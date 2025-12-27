<?php
declare(strict_types=1);
require_once __DIR__.'/lib/db.php';
require_once __DIR__.'/lib/common.php';
$msisdn=normalize_msisdn((string)($_GET['msisdn']??'')); if($msisdn===''){ header('Content-Type: text/plain'); echo "NOPAID\n"; exit; }
$st=$PDO->prepare("SELECT 1 FROM purchases WHERE msisdn=:m AND status='applied' AND (expires_at IS NULL OR expires_at>=NOW()) ORDER BY id DESC LIMIT 1");
$st->execute([':m'=>$msisdn]); $isPaid=(bool)$st->fetchColumn();
if (bool_param('plain')) { header('Content-Type: text/plain; charset=utf-8'); echo $isPaid?'PAID'."\n":'NOPAID'."\n"; exit; }
json_out(['ok'=>true,'msisdn'=>$msisdn,'status'=>$isPaid?'PAID':'NOPAID']);
