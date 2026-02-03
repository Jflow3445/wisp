<?php
declare(strict_types=1);
/* GET: ?ref=... -> { ok, payment{...} } */
require_once __DIR__.'/lib/db.php';
require_once __DIR__.'/lib/user_auth.php';
user_boot();
user_require_login(true);
$ref=(string)($_GET['ref']??''); if($ref==='') json_out(['ok'=>false,'error'=>'ref required'],422);
$st=$PDO->prepare("SELECT ref,msisdn,amount,method,status,created_at,approved_at FROM payments WHERE ref=:r LIMIT 1");
$st->execute([':r'=>$ref]);
$row=$st->fetch();
if(!$row) json_out(['ok'=>false,'error'=>'unknown ref'],404);
if (normalize_msisdn((string)$row['msisdn']) !== normalize_msisdn(user_msisdn())) {
  json_out(['ok'=>false,'error'=>'forbidden'], 403);
}
json_out(['ok'=>true,'payment'=>$row]);
