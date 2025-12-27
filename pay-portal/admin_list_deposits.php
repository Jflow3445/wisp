<?php
require_once __DIR__.'/env.php';
header('Content-Type: application/json; charset=utf-8');
$secret = $_GET['secret'] ?? $_SERVER['HTTP_X_ADMIN_SECRET'] ?? '';
if (!isset($_ENV['ADMIN_DEPOSIT_SECRET']) || $secret!==$_ENV['ADMIN_DEPOSIT_SECRET']){
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
