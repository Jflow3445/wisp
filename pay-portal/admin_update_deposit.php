<?php
require_once __DIR__.'/lib/common.php';
header('Content-Type: application/json; charset=utf-8');

$env = array_merge(
  env_load('/etc/pay.env'),
  env_load(__DIR__.'/.env')
);
$expected = $env['ADMIN_DEPOSIT_SECRET'] ?? getenv('ADMIN_DEPOSIT_SECRET') ?? ($_ENV['ADMIN_DEPOSIT_SECRET'] ?? '');
$secret = $_GET['secret'] ?? $_SERVER['HTTP_X_ADMIN_SECRET'] ?? '';
if ($expected === '' || !hash_equals((string)$expected, (string)$secret)){
  http_response_code(403); echo json_encode(['ok'=>false,'error'=>'forbidden']); exit;
}

$raw = file_get_contents('php://input'); $in = json_decode($raw,true) ?: $_POST;
$id = trim((string)($in['id']??'')); $action = strtolower(trim((string)($in['action']??'')));
if (!$id || !in_array($action,['approve','decline'],true)){
  http_response_code(422); echo json_encode(['ok'=>false,'error'=>'id + action required']); exit;
}

$src = __DIR__.'/data/manual_deposits/pending/'.$id.'.json';
if (!is_file($src)){ http_response_code(404); echo json_encode(['ok'=>false,'error'=>'not found']); exit; }
$j = json_decode(file_get_contents($src),true);
if (!$j){ http_response_code(409); echo json_encode(['ok'=>false,'error'=>'corrupt request']); exit; }

if ($action==='decline'){
  $j['status']='declined'; $j['decided_at']=date('Y-m-d H:i:s');
  $dst = __DIR__.'/data/manual_deposits/declined/'.$id.'.json'; @mkdir(dirname($dst),0755,true);
  file_put_contents($dst,json_encode($j,JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES)); @unlink($src);
  echo json_encode(['ok'=>true,'id'=>$id,'status'=>'declined']); exit;
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
    $pdo = new PDO($db_dsn, $db_user, $db_pass, [
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
echo json_encode(['ok'=>true,'id'=>$id,'status'=>'approved','ref'=>$ref,'db_ok'=>$credited,'db_error'=>$db_error]);
