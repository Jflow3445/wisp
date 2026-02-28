<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
ini_set('display_errors', '0');

try {
  require_once __DIR__.'/lib/common.php';
  require_once __DIR__.'/lib/db.php';
  require_once __DIR__.'/lib/wallet.php';
  require_once __DIR__.'/lib/plans_radius.php';
  require_once __DIR__.'/lib/radius.php';
  require_once __DIR__.'/lib/user_auth.php';
  require_once __DIR__.'/lib/referrals.php';
  require_once __DIR__.'/lib/auto_renew.php';

  user_boot();
  user_require_login(true);
  $msisdn = normalize_msisdn(user_msisdn());
  if ($msisdn === '') json_out(['ok'=>false,'error'=>'unauthorized'], 401);

  $walletOk = true;
  $walletErr = null;
  $bal = 0;
  $ledger = [];
  try {
    $bal = wallet_balance($msisdn);

    // Recent wallet history
    $lg = $PDO->prepare("SELECT type,amount_cents,ref,notes,created_at FROM ledger WHERE msisdn=:m ORDER BY id DESC LIMIT 10");
    $lg->execute([':m'=>$msisdn]);
    $ledger = $lg->fetchAll();
  } catch (Throwable $e) {
    $walletOk = false;
    $walletErr = ($e->getMessage() === 'wallet_tables_missing') ? 'wallet_tables_missing' : 'wallet_error';
  }

  $plans = [];
  try { $plans = array_values(radius_fetch_plans()); }
  catch (Throwable $e) { $plans = []; }

  // Active plan from FreeRADIUS
  $active = null;
  try { $active = radius_get_active_plan($msisdn); }
  catch (Throwable $e) { $active = null; }

  // (Optional) fallback to local purchases if FR had nothing
  if (!$active) {
    try {
      $st = $PDO->prepare("SELECT plan_code,expires_at FROM purchases WHERE msisdn=:m AND status='applied' AND (expires_at IS NULL OR expires_at>=NOW()) ORDER BY id DESC LIMIT 1");
      $st->execute([':m'=>$msisdn]);
      $row = $st->fetch();
      if ($row) $active = ['plan_code'=>$row['plan_code'],'expires_at'=>$row['expires_at']];
    } catch (Throwable $e) {
      $active = null;
    }
  }

  $referral = [
    'invite_code'=>null,
    'pending_cents'=>0,
    'released_cents_month'=>0,
    'released_cents_lifetime'=>0,
  ];
  try { $referral = referrals_user_summary($msisdn); } catch (Throwable $e) { /* keep defaults */ }

  $autoRenew = [
    'enabled'=>false,
    'plan_code'=>null,
    'plan_name'=>null,
    'price_cents'=>null,
    'updated_at'=>null,
    'last_renew_at'=>null,
    'last_attempt_at'=>null,
    'last_error'=>null,
  ];
  try {
    $auto = auto_renew_get($msisdn);
    $planInfo = null;
    if (!empty($auto['plan_code'])) {
      $planInfo = radius_find_plan((string)$auto['plan_code']);
    }
    $autoRenew = [
      'enabled'=>(bool)($auto['enabled'] ?? false),
      'plan_code'=>$auto['plan_code'] ?? null,
      'plan_name'=>$planInfo['name'] ?? ($planInfo['display_name'] ?? null),
      'price_cents'=>$planInfo['price_cents'] ?? null,
      'updated_at'=>$auto['updated_at'] ?? null,
      'last_renew_at'=>$auto['last_renew_at'] ?? null,
      'last_attempt_at'=>$auto['last_attempt_at'] ?? null,
      'last_error'=>$auto['last_error'] ?? null,
    ];
  } catch (Throwable $e) { /* keep defaults */ }

  json_out([
    'ok'=>true,
    'msisdn'=>msisdn_display($msisdn), "msisdn_canonical"=>$msisdn,
    'balance_cents'=>$bal,
    'balance_ghs'=>round($bal/100,2),
    'wallet_ok'=>$walletOk,
    'wallet_error'=>$walletErr,
    'active'=>$active,
    'referral'=>$referral,
    'auto_renew'=>$autoRenew,
    'plans'=>$plans,
    'ledger'=>$ledger
  ]);
} catch (Throwable $e) {
  http_response_code(500);
  echo json_encode(
    ['ok'=>false,'error'=>'server_error','detail'=>$e->getMessage()],
    JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE
  );
}
