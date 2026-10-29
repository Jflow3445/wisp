<?php
declare(strict_types=1);
require_once __DIR__.'/../lib/admin_auth.php';
require_once __DIR__.'/../lib/spin/http.php';
spin_headers();
try {
  $env=admin_boot();
  if(!admin_logged_in() || !spin_is_manager((string)($_SESSION['admin_user']??''),$env)) throw new SpinError('forbidden','Game manager permission is required.',403);
  $db=db_pdo($env); $game=new SpinService($db,$env);
  $game->recognizeAdminSession((string)$_SESSION['admin_user'],(int)($_SESSION['admin_at']??0));
  if(($_SERVER['REQUEST_METHOD']??'GET')==='GET') {
    if(($_GET['action']??'')==='preview') json_out(['ok'=>true,'preview'=>$game->flightPreview(SpinMath::integer(filter_var($_GET['stake_cents']??null,FILTER_VALIDATE_INT),1,SpinMath::MAX_WALLET,'preview stake'))]);
    if(($_GET['action']??'')==='reconcile') json_out(['ok'=>true,'reconciliation'=>$game->monitor()]);
    json_out(['ok'=>true,'dashboard'=>$game->dashboard((string)($_GET['search']??''),max(0,(int)($_GET['page']??0)))]);
  }
  $in=spin_input(true); $actor=(string)$_SESSION['admin_user'];
  if(($in['action']??'')==='preview') {
    spin_rate_limit($db,'admin-flight-preview:'.$actor,20,60,$game->now());
    if(!is_array($in['rules']??null))throw new SpinError('invalid_rules','Supply the draft flight rules.',422);
    json_out(['ok'=>true,'preview'=>$game->flightPreview(SpinMath::integer($in['stake_cents']??null,1,SpinMath::MAX_WALLET,'preview stake'),$in['rules'])]);
  }
  spin_rate_limit($db,'admin:'.$actor,10,60,$game->now());
  json_out(['ok'=>true,'result'=>$game->admin($actor,$in)]);
} catch(Throwable $e) {
  if($e instanceof SpinError && in_array($e->errorCode,['mfa_invalid','csrf_invalid','origin_not_allowed','rate_limited'],true) && isset($game)) {
    try{$game->securityEvent((string)($_SESSION['admin_user']??'unknown'),$e->errorCode);}catch(Throwable $auditFailure){error_log('[spin] security_event_audit_failed');}
  }
  spin_error($e);
}
