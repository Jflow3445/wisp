<?php
declare(strict_types=1);
require_once __DIR__.'/lib/common.php';
require_once __DIR__.'/lib/spin/http.php';
spin_headers();
header('Access-Control-Allow-Origin: *');
// A boolean visibility flag only. No customer, financial or administrator data is exposed.
if(($_SERVER['REQUEST_METHOD']??'GET')!=='GET') json_out(['visible'=>false],405);
try { $env=app_boot(); $a=(new SpinService(db_pdo($env),$env))->availability(); json_out(['visible'=>$a['visible'],'can_play'=>$a['can_play']]); }
catch(Throwable $e) { json_out(['visible'=>false]); }
