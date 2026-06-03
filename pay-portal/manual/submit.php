<?php
declare(strict_types=1);
/* POST/JSON: msisdn, amount, method(momo|cash|bank|other), payer_name?, notes?(include Txn ID) */
require_once __DIR__.'/../lib/db.php';
require_once __DIR__.'/../lib/common.php';
require_once __DIR__.'/../lib/settings.php';

$ENV = app_boot();
$allowLegacy = filter_var((string)($ENV['ALLOW_LEGACY_MANUAL_SUBMIT'] ?? getenv('ALLOW_LEGACY_MANUAL_SUBMIT') ?: ''), FILTER_VALIDATE_BOOLEAN);
if (!$allowLegacy) {
  json_out(['ok'=>false,'error'=>'endpoint_retired'], 410);
}

$reqMethod = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
if ($reqMethod !== 'POST') {
  json_out(['ok'=>false,'error'=>'method_not_allowed'], 405);
}
if (!nister_is_same_origin_request()) {
  json_out(['ok'=>false,'error'=>'origin_not_allowed'], 403);
}
$manualEnabledRaw = strtolower(trim((string)(settings_get('TOPUP_MANUAL_ENABLED', '1') ?? '1')));
if (!in_array($manualEnabledRaw, ['1','true','yes','y','on','enabled'], true)) {
  json_out(['ok'=>false,'error'=>'manual_topup_disabled'], 403);
}

$manualToken = trim((string)($ENV['MANUAL_SUBMIT_TOKEN'] ?? $ENV['APP_SECRET'] ?? ''));
require_bearer($manualToken);

$in=array_merge($_POST, body_json());
$msisdn=normalize_msisdn((string)from_any([$in],'msisdn',''));
$amount=(float)from_any([$in],'amount',0);
$method=strtolower((string)from_any([$in],'method','momo'));
$payer=(string)from_any([$in],'payer_name',null);
$notes=(string)from_any([$in],'notes',null);

if($msisdn===''||$amount<=0) json_out(['ok'=>false,'error'=>'msisdn and positive amount required'],422);
if(!in_array($method,['cash','momo','bank','other'],true)) $method='momo';
$amountCents = (int)round($amount * 100);
$minTopupCents = max(100, (int)($ENV['TOPUP_MIN_CENTS'] ?? 3000));
$maxTopupCents = max($minTopupCents, (int)($ENV['TOPUP_MAX_CENTS'] ?? 2000000));
if ($amountCents < $minTopupCents || $amountCents > $maxTopupCents) {
  json_out([
    'ok'=>false,
    'error'=>'amount_out_of_range',
    'min_cents'=>$minTopupCents,
    'max_cents'=>$maxTopupCents,
  ], 422);
}

$ref='MNL-'.date('YmdHis').'-'.bin2hex(random_bytes(4));
$PDO->prepare("INSERT INTO payments(ref,msisdn,amount,method,status,payer_name,notes)
VALUES(:r,:m,:a,:me,'pending',:p,:n)")
->execute([':r'=>$ref,':m'=>$msisdn,':a'=>$amount,':me'=>$method,':p'=>$payer,':n'=>$notes]);

json_out(['ok'=>true,'ref'=>$ref,'status'=>'pending',
  'momo_number'=>'0530488905','momo_names'=>['GRASAG-UHAS']]);
