<?php
declare(strict_types=1);

/**
 * JSON bridge: the frontend posts application/json.
 * Make JSON payload available to legacy $_POST/$_GET/$_REQUEST code paths.
 */
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
  $ct = strtolower((string)($_SERVER['CONTENT_TYPE'] ?? $_SERVER['HTTP_CONTENT_TYPE'] ?? ''));
  if (strpos($ct, 'application/json') !== false) {
    $raw = file_get_contents('php://input');
    if ($raw !== false && trim($raw) !== '') {
      $j = json_decode($raw, true);
      if (is_array($j)) {
        // normalize keys
        $msisdn = (string)($j['msisdn'] ?? $j['username'] ?? $j['user'] ?? '');
        $plan   = (string)($j['plan_code'] ?? $j['plan'] ?? '');

        if ($msisdn !== '') {
          $_POST['msisdn']    = $_POST['msisdn']    ?? $msisdn;
          $_POST['username']  = $_POST['username']  ?? $msisdn;
          $_GET['username']   = $_GET['username']   ?? $msisdn;   // in case code expects query param
          $_REQUEST['msisdn'] = $_REQUEST['msisdn'] ?? $msisdn;
          $_REQUEST['username']= $_REQUEST['username'] ?? $msisdn;
        }
        if ($plan !== '') {
          $_POST['plan_code'] = $_POST['plan_code'] ?? $plan;
          $_POST['plan']      = $_POST['plan']      ?? $plan;
          $_REQUEST['plan_code']= $_REQUEST['plan_code'] ?? $plan;
          $_REQUEST['plan']     = $_REQUEST['plan']      ?? $plan;
        }
      }
    }
  }
}

/**
 * Crash logging (temporary but safe): catches fatals and logs them.
 */
register_shutdown_function(function(){
  $e = error_get_last();
  if ($e && in_array($e['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR], true)) {
    error_log("[purchase.php] FATAL: {$e['message']} @ {$e['file']}:{$e['line']}");
  }
});

function purchase_column_exists(PDO $pdo, string $table, string $column): bool {
  $st = $pdo->prepare(
    "SELECT 1 FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = :t AND column_name = :c LIMIT 1"
  );
  $st->execute([':t' => $table, ':c' => $column]);
  return (bool)$st->fetchColumn();
}

function purchase_table_exists(PDO $pdo, string $table): bool {
  $st = $pdo->prepare(
    "SELECT 1 FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = :t LIMIT 1"
  );
  $st->execute([':t' => $table]);
  return (bool)$st->fetchColumn();
}

function purchase_lock_name(string $msisdn): string {
  // Shared namespace with auto-renew lock to serialize renewal + manual purchase.
  return 'auto_renew:' . substr(sha1($msisdn), 0, 40);
}

function purchase_try_lock(PDO $pdo, string $msisdn, int $timeoutSec = 5): bool {
  $timeoutSec = max(0, min(30, $timeoutSec));
  try {
    $st = $pdo->prepare("SELECT GET_LOCK(:k, :t)");
    $st->execute([':k' => purchase_lock_name($msisdn), ':t' => $timeoutSec]);
    return ((int)($st->fetchColumn() ?: 0)) === 1;
  } catch (Throwable $e) {
    error_log('[purchase.php] lock_error msisdn=' . $msisdn . ' err=' . $e->getMessage());
    return false;
  }
}

function purchase_release_lock(PDO $pdo, string $msisdn): void {
  try {
    $st = $pdo->prepare("SELECT RELEASE_LOCK(:k)");
    $st->execute([':k' => purchase_lock_name($msisdn)]);
  } catch (Throwable $e) {
    // ignore
  }
}

// Accept legacy "plan" from frontend as alias for "plan_code"
if (!isset($_POST['plan_code']) && isset($_POST['plan'])) { $_POST['plan_code'] = $_POST['plan']; }
require_once __DIR__.'/lib/user_auth.php';
require_once __DIR__.'/lib/db.php';
require_once __DIR__.'/lib/wallet.php';
require_once __DIR__.'/lib/radius.php';
require_once __DIR__.'/lib/plans_radius.php';
require_once __DIR__.'/lib/common.php';
require_once __DIR__.'/lib/transaction_safety.php';
require_once __DIR__.'/lib/settings.php';
require_once __DIR__.'/lib/sms.php';
require_once __DIR__.'/lib/referrals.php';

try {
  $ENV = user_boot();
  user_require_login(true);
  if (!nister_is_same_origin_request()) {
    json_out(['ok'=>false,'error'=>'origin_not_allowed'], 403);
  }
  $in = array_merge($_POST, body_json());
  
    if (!isset($in["plan_code"]) && isset($in["plan"])) { $in["plan_code"] = $in["plan"]; }
$msisdn = user_msisdn();
if ($msisdn === '') json_out(['ok'=>false,'error'=>'unauthorized'],401);
  $loc = location_resolve_for_user($msisdn, location_session_get_code());
  $locationId = (int)($loc['id'] ?? 0);
  if ($locationId <= 0) $locationId = location_default_id();
  $code   = (string)from_any([$in],'plan_code','');
  if ($msisdn==='' || $code==='') json_out(['ok'=>false,'error'=>'msisdn and plan_code required'],422);

  $plan = radius_find_plan($code, $locationId, true);
  if (!$plan) json_out(['ok'=>false,'error'=>'unknown_plan'],404);
  if (!radius_plan_is_active($plan)) {
    json_out(['ok'=>false,'error'=>'plan_inactive','message'=>'This plan is no longer available. Please choose one of the current plans.'],409);
  }
  if (!isset($plan['price_cents'])) json_out(['ok'=>false,'error'=>'plan_not_configured','message'=>'Plan has no Nister-Price-Cents in FreeRADIUS.'],409);

  $lockHeld = purchase_try_lock($PDO, $msisdn, 5);
  if (!$lockHeld) {
    json_out([
      'ok'=>false,
      'error'=>'duplicate_request',
      'message'=>'Another purchase or auto-renew is in progress. Please retry shortly.'
    ], 409);
  }

  try {
    $price = (int)$plan['price_cents'];
    $ref   = 'BUY-'.date('YmdHis').'-'.bin2hex(random_bytes(3));

    // Guard against accidental double-click / duplicate submits
    try {
      if (purchase_table_exists($PDO, 'purchases')) {
        $hasLocation = purchase_column_exists($PDO, 'purchases', 'location_id');
        if ($hasLocation) {
          $st = $PDO->prepare("SELECT id FROM purchases
                               WHERE msisdn=:m AND location_id=:l AND plan_code=:c
                                 AND created_at >= (NOW() - INTERVAL 30 SECOND)
                                 AND status IN ('pending','applied')
                               ORDER BY id DESC LIMIT 1");
          $st->execute([':m'=>$msisdn, ':l'=>$locationId, ':c'=>$plan['code']]);
        } else {
          $st = $PDO->prepare("SELECT id FROM purchases
                               WHERE msisdn=:m AND plan_code=:c
                                 AND created_at >= (NOW() - INTERVAL 30 SECOND)
                                 AND status IN ('pending','applied')
                               ORDER BY id DESC LIMIT 1");
          $st->execute([':m'=>$msisdn, ':c'=>$plan['code']]);
        }
        if ($st->fetchColumn()) {
          json_out(['ok'=>false,'error'=>'duplicate_request','message'=>'A recent purchase is already being processed. Please wait a few seconds and refresh.'],409);
        }
      }
    } catch (Throwable $e) {
      // Non-fatal: continue if purchases table is missing or query fails.
    }

    try {
      $debited = wallet_try_debit($msisdn,$price,$ref,"Buy plan {$plan['code']}");
    } catch (Throwable $e) {
      if ($e->getMessage() === 'wallet_tables_missing') {
        json_out([
          'ok'=>false,'error'=>'wallet_unavailable',
          'message'=>'Wallet database not ready. Please contact support.',
        ],503);
      }
      throw $e;
    }
    if (!$debited) {
      $s = settings_get_all();
      $get = static function(string $k, $def=null) use ($s, $ENV) {
        if (isset($s[$k]) && $s[$k] !== '') return $s[$k];
        if (isset($ENV[$k]) && $ENV[$k] !== '') return $ENV[$k];
        $v = getenv($k);
        if ($v !== false && $v !== '') return $v;
        return $def;
      };
      $topupNumber = (string)$get('TOPUP_NUMBER','0530488905');
      $topupName   = (string)$get('TOPUP_NAME','GRASAG-UHAS');
      $truthy = static function($v, bool $default=false): bool {
        if ($v === null || $v === '') return $default;
        return in_array(strtolower(trim((string)$v)), ['1','true','yes','y','on','enabled'], true);
      };
      $manualTopup = $truthy($get('TOPUP_MANUAL_ENABLED', '1'), true);
      $paystackSecret = (string)$get('PAYSTACK_SECRET_KEY', '');
      if ($paystackSecret === '') $paystackSecret = (string)$get('PAYSTACK_SECRET', '');
      $paystackTopup = $truthy($get('PAYSTACK_ENABLED', '0'), false) && $paystackSecret !== '';
      if ($paystackTopup && $manualTopup) {
        $topupMessage = 'Not enough balance. Top up with Momo Pay or Manual Payment and try again.';
      } elseif ($paystackTopup) {
        $topupMessage = 'Not enough balance. Top up with Momo Pay and try again.';
      } elseif ($manualTopup) {
        $topupMessage = 'Not enough balance. Use Manual Payment to top up and try again.';
      } else {
        $topupMessage = 'Not enough balance. Top-up is temporarily unavailable.';
      }
      json_out([
        'ok'=>false,'error'=>'insufficient_funds',
        'message'=>$topupMessage,
        'momo_number'=>$topupNumber,'momo_names'=>[$topupName],
        'need_cents'=>$price
      ],402);
    }

    $pid = null;
    $planApplied = false;
    try {
      // Create purchase record (pending)
      if (purchase_table_exists($PDO, 'purchases') && purchase_column_exists($PDO, 'purchases', 'location_id')) {
        $PDO->prepare("INSERT INTO purchases(msisdn,location_id,plan_code,price_cents,status)
                       VALUES(:m,:l,:c,:p,'pending')")
            ->execute([':m'=>$msisdn,':l'=>$locationId,':c'=>$plan['code'],':p'=>$price]);
      } elseif (purchase_table_exists($PDO, 'purchases')) {
        $PDO->prepare("INSERT INTO purchases(msisdn,plan_code,price_cents,status)
                       VALUES(:m,:c,:p,'pending')")
            ->execute([':m'=>$msisdn,':c'=>$plan['code'],':p'=>$price]);
      } else {
        throw new RuntimeException('purchases_table_missing');
      }
      $pid=(int)$PDO->lastInsertId();

      // Compute anchor timestamp (exact-time rolling expiry is handled in radius_apply_plan)
      $days=(int)($plan['duration_days'] ?? (int)($ENV['VALID_DAYS'] ?? 30));
      $tz = new DateTimeZone(date_default_timezone_get());
      $purchaseAt = new DateTimeImmutable('now', $tz);

      // Include plan code so we can write per-user plan attrs
      $applyPlan = [
        'code'         => $plan['code'],
        'address_list' => $plan['address_list']??'HS_ACTIVE',
        'rate_limit'   => $plan['rate_limit']??null,
        'quota_bytes'  => $plan['quota_bytes']??null,
        'duration_days'=> $days
      ];
      radius_apply_plan($msisdn, $applyPlan, $purchaseAt);
      $planApplied = true;

      // Force online users to re-auth so new Mikrotik-Address-List / limits apply immediately
      if (function_exists('radius_try_disconnect')) {
        try {
          $envArr = (isset($ENV) && is_array($ENV)) ? $ENV : [];
          radius_try_disconnect($msisdn, $envArr, $locationId);
        } catch (Throwable $e) { /* non-fatal */ }
      }

      // Fallback: if the session is missing/odd, try kick by current client IP
      if (function_exists('radius_force_kick_ip')) {
        try {
          $ip = nister_client_ip(is_array($ENV) ? $ENV : []);
          if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
            // Only allow RFC1918 to avoid kicking wrong public IPs behind proxies
            if (preg_match('/^(10\\.|192\\.168\\.|172\\.(1[6-9]|2[0-9]|3[0-1])\\.)/', $ip)) {
              $envArr = (isset($ENV) && is_array($ENV)) ? $ENV : [];
              radius_force_kick_ip($ip, $msisdn, $envArr);
            }
          }
        } catch (Throwable $e) { /* non-fatal */ }
      }


    $actualExpires = $purchaseAt->modify('+'.$days.' days');
    try {
      $active = radius_get_active_plan($msisdn);
      if ($active && !empty($active['expires_at'])) {
        $dt = nister_parse_expiry_datetime((string)$active['expires_at'], $tz);
        if ($dt instanceof DateTimeImmutable) $actualExpires = $dt;
      }
    } catch (Throwable $e) { /* keep computed expiry */ }

    $expiresStr = $actualExpires->format('Y-m-d H:i:s');
    $PDO->prepare("UPDATE purchases SET status='applied', activated_at=NOW(), expires_at=:e WHERE id=:id")
        ->execute([':e'=>$expiresStr, ':id'=>$pid]);

    try {
      referrals_create_reward_for_purchase((int)$pid, $msisdn, (int)$price, $purchaseAt);
    } catch (Throwable $e) {
      error_log("[purchase.php referral] purchase_id={$pid} msisdn={$msisdn} error=".$e->getMessage());
    }

    try {
      referrals_release_pending_for_referrer($msisdn, 200);
    } catch (Throwable $e) {
      error_log("[purchase.php referral_release] msisdn={$msisdn} error=".$e->getMessage());
    }

    try {
      $tpl = trim((string)(sms_setting('SMS_PURCHASE_CONFIRM_TEXT', '') ?? ''));
      if ($tpl !== '') {
        $loginUrl = trim((string)(sms_setting('SMS_LOGIN_URL', '') ?? ''));
        $msg = sms_template($tpl, [
          'NAME' => '',
          'MSISDN' => sms_normalize_local($msisdn),
          'PLAN' => (string)($plan['name'] ?? $plan['code'] ?? ''),
          'EXPIRES_AT' => $expiresStr,
          'REF' => $ref,
          'AMOUNT_GHS' => number_format($price / 100, 2),
          'LOGIN_URL' => $loginUrl,
        ]);
        sms_send($msisdn, $msg);
      }

      $tpl2 = trim((string)(sms_setting('SMS_BACK_ONLINE_TEXT', '') ?? ''));
      if ($tpl2 !== '') {
        $msg2 = sms_template($tpl2, [
          'NAME' => '',
          'MSISDN' => sms_normalize_local($msisdn),
          'PLAN' => (string)($plan['name'] ?? $plan['code'] ?? ''),
          'EXPIRES_AT' => $expiresStr,
        ]);
        sms_send($msisdn, $msg2);
      }
    } catch (Throwable $e) {
      // ignore SMS failures
    }

      json_out(['ok'=>true,'ref'=>$ref,'purchase_id'=>$pid,'status'=>'applied','expires_at'=>$expiresStr]);

    } catch (Throwable $e) {
      $resolution = nister_apply_failure_resolution($planApplied);
      $refundErr = null;
      if (!empty($resolution['should_refund'])) {
        try {
          wallet_credit($msisdn, $price, $ref.'-REFUND', 'Auto-refund: purchase failed');
        } catch (Throwable $re) {
          $refundErr = $re->getMessage();
          error_log('[purchase.php] refund_failed msisdn=' . $msisdn . ' ref=' . $ref . ' err=' . $refundErr);
        }
      }
      if ($pid) {
        try {
          $PDO->prepare("UPDATE purchases SET status=:s WHERE id=:id")
            ->execute([':s'=>(string)($resolution['purchase_status'] ?? 'failed'), ':id'=>$pid]);
        } catch (Throwable $se) {
          error_log('[purchase.php] purchase_status_update_failed id=' . $pid . ' err=' . $se->getMessage());
        }
      }
      error_log('[purchase.php] apply_failed msisdn=' . $msisdn . ' plan=' . (string)($plan['code'] ?? '') . ' applied=' . ($planApplied ? '1' : '0') . ' err=' . $e->getMessage());
      if ($refundErr !== null) {
        json_out(['ok'=>false,'error'=>'apply_failed','refund'=>'manual_check_required'],500);
      }
      $errCode = (string)($resolution['error'] ?? 'apply_failed');
      if ($errCode === 'reconcile_required') {
        json_out(['ok'=>false,'error'=>'reconcile_required'],500);
      }
      json_out(['ok'=>false,'error'=>'apply_failed'],500);
    }
  } finally {
    if ($lockHeld) {
      purchase_release_lock($PDO, $msisdn);
    }
  }

} catch (Throwable $e) {
  error_log('[purchase.php] server_error err=' . $e->getMessage());
  json_out(['ok'=>false,'error'=>'server_error'],500);
}
