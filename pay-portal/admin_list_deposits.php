<?php
require_once __DIR__.'/lib/common.php';
header('Content-Type: application/json; charset=utf-8');

$env = app_boot();
$legacyRaw = strtolower(trim((string)($env['ALLOW_LEGACY_ADMIN_ENDPOINTS'] ?? getenv('ALLOW_LEGACY_ADMIN_ENDPOINTS') ?? ($_ENV['ALLOW_LEGACY_ADMIN_ENDPOINTS'] ?? ''))));
$legacyEnabled = in_array($legacyRaw, ['1','true','yes','on'], true);
if (!$legacyEnabled) {
  http_response_code(410);
  echo json_encode(['ok'=>false,'error'=>'legacy_endpoint_disabled','detail'=>'Use /admin/index.php']);
  exit;
}

$expected = $env['ADMIN_DEPOSIT_SECRET'] ?? getenv('ADMIN_DEPOSIT_SECRET') ?? ($_ENV['ADMIN_DEPOSIT_SECRET'] ?? '');
$method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
$secret = (string)($_SERVER['HTTP_X_ADMIN_SECRET'] ?? '');
if ($secret === '' && $method === 'POST') {
  $secret = (string)($_POST['secret'] ?? '');
}
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
