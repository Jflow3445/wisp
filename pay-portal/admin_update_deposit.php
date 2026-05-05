<?php
require_once __DIR__.'/nister_pdo.php';
require_once __DIR__.'/lib/common.php';
require_once __DIR__.'/lib/sms.php';
header('Content-Type: application/json; charset=utf-8');

// Security hotfix: legacy secret-based admin endpoints are disabled by default.
$env = app_boot();
$legacyRaw = strtolower(trim((string)($env['ALLOW_LEGACY_ADMIN_ENDPOINTS'] ?? getenv('ALLOW_LEGACY_ADMIN_ENDPOINTS') ?? ($_ENV['ALLOW_LEGACY_ADMIN_ENDPOINTS'] ?? ''))));
$legacyEnabled = in_array($legacyRaw, ['1','true','yes','on'], true);
if (!$legacyEnabled) {
  http_response_code(410);
  echo json_encode(['ok'=>false,'error'=>'legacy_endpoint_disabled','detail'=>'Use /admin/index.php']);
  exit;
}

$method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
if ($method !== 'POST') {
  http_response_code(405);
  echo json_encode(['ok'=>false,'error'=>'method_not_allowed']); exit;
}

$expected = $env['ADMIN_DEPOSIT_SECRET'] ?? getenv('ADMIN_DEPOSIT_SECRET') ?? ($_ENV['ADMIN_DEPOSIT_SECRET'] ?? '');
$secret = $_SERVER['HTTP_X_ADMIN_SECRET'] ?? ($_POST['secret'] ?? ($_POST['s'] ?? ''));
if ($expected === '' || !hash_equals((string)$expected, (string)$secret)){
  http_response_code(403); echo json_encode(['ok'=>false,'error'=>'forbidden']); exit;
}

$raw = file_get_contents('php://input'); $in = json_decode($raw,true) ?: $_POST;
$id = trim((string)($in['id']??'')); $action = strtolower(trim((string)($in['action']??'')));
if (!$id || !in_array($action,['approve','decline'],true)){
  http_response_code(422); echo json_encode(['ok'=>false,'error'=>'id + action required']); exit;
}
if (!preg_match('/^[A-Za-z0-9_-]{1,80}$/', $id)) {
  http_response_code(422); echo json_encode(['ok'=>false,'error'=>'invalid_id']); exit;
}

$src = __DIR__.'/data/manual_deposits/pending/'.$id.'.json';
if (!is_file($src)){ http_response_code(404); echo json_encode(['ok'=>false,'error'=>'not found']); exit; }
$j = json_decode(file_get_contents($src),true);
if (!$j){ http_response_code(409); echo json_encode(['ok'=>false,'error'=>'corrupt request']); exit; }

if ($action==='decline'){
  $j['status']='declined'; $j['decided_at']=date('Y-m-d H:i:s');
  $dst = __DIR__.'/data/manual_deposits/declined/'.$id.'.json'; @mkdir(dirname($dst),0755,true);
  file_put_contents($dst,json_encode($j,JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES)); @unlink($src);
  $sms = ['attempted'=>false,'sent'=>false,'template_source'=>null,'error'=>null];
  try {
    $sms = sms_send_templated(
      (string)($j['msisdn'] ?? ''),
      'SMS_PAYMENT_FAILED_TEXT',
      'Payment request {REF} was declined. Please retry payment or contact support.',
      [
        'NAME' => '',
        'MSISDN' => sms_normalize_local((string)($j['msisdn'] ?? '')),
        'REF' => (string)($j['ref'] ?? $id),
      ]
    );
  } catch (Throwable $e) {
    $sms = ['attempted'=>true,'sent'=>false,'template_source'=>null,'error'=>'sms_exception: '.$e->getMessage()];
  }
  $smsAttempted = (bool)($sms['attempted'] ?? false);
  $smsSent = (bool)($sms['sent'] ?? false);
  $out = [
    'ok'=>true,
    'id'=>$id,
    'status'=>'declined',
    'sms_attempted'=>$smsAttempted,
    'sms_sent'=>$smsSent,
    'sms_template_source'=>$sms['template_source'] ?? null,
  ];
  if ($smsAttempted && !$smsSent) {
    $out['sms_warning'] = 'Decision saved, but SMS could not be delivered.';
    error_log("[admin_update_deposit sms] id={$id} action=decline msisdn=" . (string)($j['msisdn'] ?? '') . " error=" . (string)($sms['error'] ?? 'unknown'));
  }
  echo json_encode($out); exit;
}

$msisdn = $j['msisdn']; $amount_cents=(int)$j['amount_cents'];
$ref = 'MNL-'.date('YmdHis').'-'.substr(bin2hex(random_bytes(4)),0,8);
$note = 'MoMo deposit approved';
$credited=false; $db_error=null; $pdo=null;

try{
  $db_dsn  = $env['DB_DSN']  ?? getenv('DB_DSN')  ?? '';
  $db_user = $env['DB_USER'] ?? getenv('DB_USER') ?? '';
  $db_pass = $env['DB_PASS'] ?? getenv('DB_PASS') ?? '';
  if ($db_dsn === '') {
    $db_host = $env['DB_HOST'] ?? getenv('DB_HOST') ?: '127.0.0.1';
    $db_name = $env['DB_NAME'] ?? getenv('DB_NAME') ?: 'radius';
    $db_dsn = "mysql:host={$db_host};dbname={$db_name};charset=utf8mb4";
  }
  if ($db_dsn !== '' && $db_user !== '') {
    $pdo = new NisterPDO($db_dsn, $db_user, $db_pass, [
      PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,
      PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC
    ]);
    $pdo->beginTransaction();
    $st=$pdo->prepare("INSERT INTO ledger (msisdn,type,amount_cents,ref,notes,created_at)
                       VALUES (:m,'deposit',:a,:r,:n,NOW())");
    $st->execute([':m'=>$msisdn,':a'=>$amount_cents,':r'=>$ref,':n'=>$note]);
    $st=$pdo->prepare("INSERT INTO accounts (msisdn,balance_cents) VALUES (:m,:a)
                       ON DUPLICATE KEY UPDATE balance_cents = balance_cents + VALUES(balance_cents)");
    $st->execute([':m'=>$msisdn,':a'=>$amount_cents]);
    $pdo->commit();
    $credited=true;
  }
}catch(Throwable $e){
  if ($pdo instanceof PDO && $pdo->inTransaction()) $pdo->rollBack();
  $db_error=$e->getMessage();
}

if (!$credited){
  @file_put_contents(__DIR__.'/data/ledger.jsonl',
    json_encode(['msisdn'=>$msisdn,'type'=>'deposit','amount_cents'=>$amount_cents,'ref'=>$ref,'notes'=>$note,'created_at'=>date('Y-m-d H:i:s')],JSON_UNESCAPED_SLASHES)."\n",
    FILE_APPEND);
}

$j['status']='approved'; $j['decided_at']=date('Y-m-d H:i:s'); $j['approved_ref']=$ref;
$dst = __DIR__.'/data/manual_deposits/approved/'.$id.'.json'; @mkdir(dirname($dst),0755,true);
file_put_contents($dst,json_encode($j,JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES)); @unlink($src);
$bal = '';
try {
  if ($credited && $pdo instanceof PDO) {
    $st = $pdo->prepare("SELECT balance_cents FROM accounts WHERE msisdn=:m");
    $st->execute([':m'=>$msisdn]);
    $b = $st->fetchColumn();
    if ($b !== false && $b !== null) $bal = number_format(((int)$b) / 100, 2);
  }
} catch (Throwable $e) { $bal = ''; }
$sms = ['attempted'=>false,'sent'=>false,'template_source'=>null,'error'=>null];
try {
  $sms = sms_send_templated(
    (string)$msisdn,
    'SMS_TOPUP_CONFIRM_TEXT',
    'Top up confirmed: GHS {AMOUNT_GHS}. Balance: GHS {BALANCE_GHS}. Ref: {REF}.',
    [
      'NAME' => '',
      'MSISDN' => sms_normalize_local((string)$msisdn),
      'AMOUNT_GHS' => number_format($amount_cents / 100, 2),
      'BALANCE_GHS' => $bal,
      'REF' => $ref,
    ]
  );
} catch (Throwable $e) {
  $sms = ['attempted'=>true,'sent'=>false,'template_source'=>null,'error'=>'sms_exception: '.$e->getMessage()];
}
$smsAttempted = (bool)($sms['attempted'] ?? false);
$smsSent = (bool)($sms['sent'] ?? false);
$out = ['ok'=>true,'id'=>$id,'status'=>'approved','ref'=>$ref,'db_ok'=>$credited,'db_error'=>$db_error,'sms_attempted'=>$smsAttempted,'sms_sent'=>$smsSent,'sms_template_source'=>$sms['template_source'] ?? null];
if ($smsAttempted && !$smsSent) {
  $out['sms_warning'] = 'Decision saved, but SMS could not be delivered.';
  error_log("[admin_update_deposit sms] id={$id} action=approve msisdn={$msisdn} error=" . (string)($sms['error'] ?? 'unknown'));
}
echo json_encode($out);
