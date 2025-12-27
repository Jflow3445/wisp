<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__.'/lib/plans_radius.php';
try { echo json_encode(['ok'=>true,'plans'=>array_values(radius_fetch_plans())], JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE); }
catch(Throwable $e){ http_response_code(500); echo json_encode(['ok'=>false,'error'=>$e->getMessage()]); }
