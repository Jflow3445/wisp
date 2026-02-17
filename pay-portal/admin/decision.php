<?php
declare(strict_types=1);
/* Auth: Authorization: Bearer <APP_SECRET>
   JSON/POST: {ref, action: approve|decline, notes?} */
require_once __DIR__.'/../lib/db.php';
require_once __DIR__.'/../lib/wallet.php';
require_once __DIR__.'/../lib/common.php';
require_once __DIR__.'/../lib/sms.php';

require_bearer($ENV['APP_SECRET']??'');

$in=array_merge($_POST, body_json());
$ref=(string)from_any([$in],'ref','');
$action=strtolower((string)from_any([$in],'action',''));
$notes=(string)from_any([$in],'notes',null);
if($ref===''||!in_array($action,['approve','decline'],true)) json_out(['ok'=>false,'error'=>'ref and valid action required'],422);

$st=$PDO->prepare("SELECT id,msisdn,amount,amount_cents,status FROM payments WHERE ref=:r LIMIT 1");
$st->execute([':r'=>$ref]);
$row=$st->fetch();
if(!$row) json_out(['ok'=>false,'error'=>'unknown ref'],404);

$who=(($_SERVER['REMOTE_USER']??'')?:($_SERVER['HTTP_X_ADMIN']??'api')).' '.($_SERVER['REMOTE_ADDR']??'');

if($action==='approve'){
  if ($row['status']!=='approved') {
    $PDO->prepare("UPDATE payments SET status='approved',approved_at=NOW(),approved_by=:w,notes=IFNULL(:n,notes) WHERE ref=:r")
        ->execute([':w'=>$who,':n'=>$notes,':r'=>$ref]);
    $cents = 0;
    if (isset($row['amount_cents']) && is_numeric($row['amount_cents'])) {
      $cents = (int)$row['amount_cents'];
    }
    if ($cents <= 0 && isset($row['amount'])) {
      $cents = (int)round(((float)$row['amount']) * 100);
    }
    wallet_credit($row['msisdn'],$cents,$ref,'MoMo deposit approved');
    $bal = null;
    try { $bal = wallet_balance($row['msisdn']); } catch (Throwable $e) { $bal = null; }
    $sms = ['attempted'=>false,'sent'=>false,'template_source'=>null,'error'=>null];
    try {
      $sms = sms_send_templated(
        (string)$row['msisdn'],
        'SMS_TOPUP_CONFIRM_TEXT',
        'Top up confirmed: GHS {AMOUNT_GHS}. Balance: GHS {BALANCE_GHS}. Ref: {REF}.',
        [
          'NAME' => '',
          'MSISDN' => sms_normalize_local((string)$row['msisdn']),
          'AMOUNT_GHS' => number_format($cents / 100, 2),
          'BALANCE_GHS' => $bal !== null ? number_format($bal / 100, 2) : '',
          'REF' => $ref,
        ]
      );
    } catch (Throwable $e) {
      $sms = ['attempted'=>true,'sent'=>false,'template_source'=>null,'error'=>'sms_exception: '.$e->getMessage()];
    }
    $out = [
      'ok'=>true,
      'ref'=>$ref,
      'msisdn'=>$row['msisdn'],
      'status'=>'approved',
      'sms_attempted'=>(bool)($sms['attempted'] ?? false),
      'sms_sent'=>(bool)($sms['sent'] ?? false),
      'sms_template_source'=>$sms['template_source'] ?? null,
    ];
    if (($sms['attempted'] ?? false) && !($sms['sent'] ?? false)) {
      $out['sms_warning'] = 'Decision saved, but SMS could not be delivered.';
      error_log("[admin/decision sms] ref={$ref} action=approve msisdn={$row['msisdn']} error=" . (string)($sms['error'] ?? 'unknown'));
    }
    json_out($out);
  }
  json_out(['ok'=>true,'ref'=>$ref,'msisdn'=>$row['msisdn'],'status'=>'approved','sms_attempted'=>false,'sms_sent'=>false,'sms_template_source'=>null]);
} else {
  $PDO->prepare("UPDATE payments SET status='declined',approved_at=NOW(),approved_by=:w,notes=IFNULL(:n,notes) WHERE ref=:r")
      ->execute([':w'=>$who,':n'=>$notes,':r'=>$ref]);
  $sms = ['attempted'=>false,'sent'=>false,'template_source'=>null,'error'=>null];
  try {
    $sms = sms_send_templated(
      (string)$row['msisdn'],
      'SMS_PAYMENT_FAILED_TEXT',
      'Payment request {REF} was declined. Please retry payment or contact support.',
      [
        'NAME' => '',
        'MSISDN' => sms_normalize_local((string)$row['msisdn']),
        'REF' => $ref,
      ]
    );
  } catch (Throwable $e) {
    $sms = ['attempted'=>true,'sent'=>false,'template_source'=>null,'error'=>'sms_exception: '.$e->getMessage()];
  }
  $out = [
    'ok'=>true,
    'ref'=>$ref,
    'msisdn'=>$row['msisdn'],
    'status'=>'declined',
    'sms_attempted'=>(bool)($sms['attempted'] ?? false),
    'sms_sent'=>(bool)($sms['sent'] ?? false),
    'sms_template_source'=>$sms['template_source'] ?? null,
  ];
  if (($sms['attempted'] ?? false) && !($sms['sent'] ?? false)) {
    $out['sms_warning'] = 'Decision saved, but SMS could not be delivered.';
    error_log("[admin/decision sms] ref={$ref} action=decline msisdn={$row['msisdn']} error=" . (string)($sms['error'] ?? 'unknown'));
  }
  json_out($out);
}
