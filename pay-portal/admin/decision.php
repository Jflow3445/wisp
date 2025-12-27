<?php
declare(strict_types=1);
/* Auth: Authorization: Bearer <APP_SECRET>
   JSON/POST: {ref, action: approve|decline, notes?} */
require_once __DIR__.'/../lib/db.php';
require_once __DIR__.'/../lib/wallet.php';
require_once __DIR__.'/../lib/common.php';

require_bearer($ENV['APP_SECRET']??'');

$in=array_merge($_POST, body_json());
$ref=(string)from_any([$in],'ref','');
$action=strtolower((string)from_any([$in],'action',''));
$notes=(string)from_any([$in],'notes',null);
if($ref===''||!in_array($action,['approve','decline'],true)) json_out(['ok'=>false,'error'=>'ref and valid action required'],422);

$st=$PDO->prepare("SELECT id,msisdn,amount,status FROM payments WHERE ref=:r LIMIT 1");
$st->execute([':r'=>$ref]);
$row=$st->fetch();
if(!$row) json_out(['ok'=>false,'error'=>'unknown ref'],404);

$who=(($_SERVER['REMOTE_USER']??'')?:($_SERVER['HTTP_X_ADMIN']??'api')).' '.($_SERVER['REMOTE_ADDR']??'');

if($action==='approve'){
  if ($row['status']!=='approved') {
    $PDO->prepare("UPDATE payments SET status='approved',approved_at=NOW(),approved_by=:w,notes=IFNULL(:n,notes) WHERE ref=:r")
        ->execute([':w'=>$who,':n'=>$notes,':r'=>$ref]);
    $cents=(int)round(((float)$row['amount'])*100);
    wallet_credit($row['msisdn'],$cents,$ref,'MoMo deposit approved');
  }
  json_out(['ok'=>true,'ref'=>$ref,'msisdn'=>$row['msisdn'],'status'=>'approved']);
} else {
  $PDO->prepare("UPDATE payments SET status='declined',approved_at=NULL,approved_by=:w,notes=IFNULL(:n,notes) WHERE ref=:r")
      ->execute([':w'=>$who,':n'=>$notes,':r'=>$ref]);
  json_out(['ok'=>true,'ref'=>$ref,'msisdn'=>$row['msisdn'],'status'=>'declined']);
}
