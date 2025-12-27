<?php
declare(strict_types=1);
/* POST/JSON: msisdn, amount, method(momo|cash|bank|other), payer_name?, notes?(include Txn ID) */
require_once __DIR__.'/../lib/db.php';
require_once __DIR__.'/../lib/common.php';

$in=array_merge($_POST, body_json());
$msisdn=normalize_msisdn((string)from_any([$in],'msisdn',''));
$amount=(float)from_any([$in],'amount',0);
$method=strtolower((string)from_any([$in],'method','momo'));
$payer=(string)from_any([$in],'payer_name',null);
$notes=(string)from_any([$in],'notes',null);

if($msisdn===''||$amount<=0) json_out(['ok'=>false,'error'=>'msisdn and positive amount required'],422);
if(!in_array($method,['cash','momo','bank','other'],true)) $method='momo';

$ref='MNL-'.date('YmdHis').'-'.bin2hex(random_bytes(4));
$PDO->prepare("INSERT INTO payments(ref,msisdn,amount,method,status,payer_name,notes)
VALUES(:r,:m,:a,:me,'pending',:p,:n)")
->execute([':r'=>$ref,':m'=>$msisdn,':a'=>$amount,':me'=>$method,':p'=>$payer,':n'=>$notes]);

json_out(['ok'=>true,'ref'=>$ref,'status'=>'pending',
  'momo_number'=>'0598544768','momo_names'=>['Magna Cibus Ltd.','Felix Dolla Dimado']]);
