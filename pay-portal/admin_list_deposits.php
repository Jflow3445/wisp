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
$status = $_GET['status'] ?? 'pending';
if (!in_array($status,['pending','approved','declined'],true)) $status='pending';
$dir = __DIR__."/data/manual_deposits/$status";
$out=[];
if (is_dir($dir)){
  foreach (glob($dir.'/*.json') as $f){
    $j = json_decode(@file_get_contents($f),true);
    if ($j) $out[]=$j;
  }
}
usort($out, fn($a,$b)=>strcmp($b['created_at']??'',$a['created_at']??''));
echo json_encode(['ok'=>true,'status'=>$status,'items'=>$out], JSON_UNESCAPED_SLASHES);
