<?php
declare(strict_types=1);
// Accept legacy "plan" from frontend as alias for "plan_code"
if (!isset($_POST['plan_code']) && isset($_POST['plan'])) { $_POST['plan_code'] = $_POST['plan']; }
require_once __DIR__.'/lib/db.php';
require_once __DIR__.'/lib/wallet.php';
require_once __DIR__.'/lib/radius.php';
require_once __DIR__.'/lib/plans_radius.php';
require_once __DIR__.'/lib/common.php';

try {
  $in = array_merge($_POST, body_json());
  $msisdn = normalize_msisdn((string)from_any([$in],'msisdn',''));
  $code   = (string)from_any([$in],'plan_code','');
  if ($msisdn==='' || $code==='') json_out(['ok'=>false,'error'=>'msisdn and plan_code required'],422);

  $plan = radius_find_plan($code);
  if (!$plan) json_out(['ok'=>false,'error'=>'unknown_plan'],404);
  if (!isset($plan['price_cents'])) json_out(['ok'=>false,'error'=>'plan_not_configured','message'=>'Plan has no Nister-Price-Cents in FreeRADIUS.'],409);

  $price = (int)$plan['price_cents'];
  $ref   = 'BUY-'.date('YmdHis').'-'.bin2hex(random_bytes(3));

  if (!wallet_try_debit($msisdn,$price,$ref,"Buy plan {$plan['code']}")) {
    json_out([
      'ok'=>false,'error'=>'insufficient_funds',
      'message'=>'Not enough balance. Please deposit via MoMo and try again.',
      'momo_number'=>'0598544768','momo_names'=>['Magna Cibus Ltd.','Felix Dolla Dimado'],
      'need_cents'=>$price
    ],402);
  }

  // Create purchase record (pending)
  $PDO->prepare("INSERT INTO purchases(msisdn,plan_code,price_cents,status)
                 VALUES(:m,:c,:p,'pending')")
      ->execute([':m'=>$msisdn,':c'=>$plan['code'],':p'=>$price]);
  $pid=(int)$PDO->lastInsertId();

  // Compute expiry (end of day)
  $days=(int)($plan['duration_days'] ?? (int)($ENV['VALID_DAYS'] ?? 30));
  $expires=(new DateTimeImmutable('now', new DateTimeZone(date_default_timezone_get())))
              ->modify('+'.$days.' days')->setTime(23,59,59);

  try {
    // Include plan code so we can set radusergroup
    $applyPlan = [
      'code'         => $plan['code'],
      'address_list' => $plan['address_list']??'HS_ACTIVE',
      'rate_limit'   => $plan['rate_limit']??null,
      'quota_bytes'  => $plan['quota_bytes']??null,
      'duration_days'=> $days
    ];
    radius_apply_plan($msisdn, $applyPlan, $expires);

    $PDO->prepare("UPDATE purchases SET status='applied', activated_at=NOW(), expires_at=:e WHERE id=:id")
        ->execute([':e'=>$expires->format('Y-m-d H:i:s'), ':id'=>$pid]);

    json_out(['ok'=>true,'ref'=>$ref,'purchase_id'=>$pid,'status'=>'applied','expires_at'=>$expires->format('Y-m-d H:i:s')]);

  } catch (Throwable $e) {
    // Refund on failure
    wallet_credit($msisdn, $price, $ref.'-REFUND', 'Auto-refund: apply failed');
    $PDO->prepare("UPDATE purchases SET status='failed' WHERE id=:id")->execute([':id'=>$pid]);
    json_out(['ok'=>false,'error'=>'apply_failed','details'=>$e->getMessage()],500);
  }

} catch (Throwable $e) {
  json_out(['ok'=>false,'error'=>'server_error','details'=>$e->getMessage()],500);
}
