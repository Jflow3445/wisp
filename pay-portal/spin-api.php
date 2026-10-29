<?php
declare(strict_types=1);
require_once __DIR__.'/lib/user_auth.php';
require_once __DIR__.'/lib/spin/http.php';
spin_headers();
try {
  $env=user_boot(); user_require_login(true); $db=db_pdo($env);
  $game=new SpinService($db,$env); $user=normalize_msisdn(user_msisdn());
  if(($_SERVER['REQUEST_METHOD']??'GET')==='GET') {
    $now=$game->now();
    spin_rate_limit($db,'flight-read-burst:'.$user,20,1,$now);
    spin_rate_limit($db,'flight-read:'.$user,600,60,$now);
    if(($_GET['action']??'')==='flight') {
      if(isset($_GET['id']) && !is_string($_GET['id']))throw new SpinError('invalid_round','That flight reference is invalid.',422);
      $id=isset($_GET['id'])?$_GET['id']:null;$key=isset($_GET['request_key'])?spin_request_key($_GET['request_key']):null;
      json_out(['ok'=>true,'flight'=>$game->activeFlight($user,$id,$key)]);
    }
    if(($_GET['action']??'')==='receipt') {
      $key=spin_request_key($_GET['request_key']??null); $receipt=$game->receipt($user,$key);
      json_out(['ok'=>true,'receipt'=>$receipt]);
    }
    json_out(['ok'=>true,'game'=>$game->snapshot($user)]);
  }
  $in=spin_input();
  if(!is_string($in['action']??null))throw new SpinError('unknown_action','Unknown action.',422);
  $action=$in['action'];
  $limit=$action==='collect'?120:($action==='preferences'?10:30);
  $bucket=in_array($action,['start','collect','preferences'],true)?$action:'unknown';
  spin_rate_limit($db,'flight-write:'.$bucket.':'.$user,$limit,60,$game->now());
  if(in_array($action,['start','collect'],true)) {
    $allowed=$action==='start'?['action','stake_cents','request_key']:['action','round_id','offer_id','request_key'];
    if(array_diff(array_keys($in),$allowed))throw new SpinError('invalid_request','Unexpected game fields. Refresh and try again.',422);
    if($action==='collect' && (!is_string($in['round_id']??null) || !is_string($in['offer_id']??null)))throw new SpinError('invalid_offer','Recover the current flight offer.',422);
  }
  switch($in['action']??'') {
    case 'start': $result=$game->startFlight($user,SpinMath::integer($in['stake_cents']??null,1,SpinMath::MAX_WALLET,'stake'),spin_request_key($in['request_key']??null)); break;
    case 'collect': $result=$game->collectFlight($user,(string)($in['round_id']??''),(string)($in['offer_id']??''),spin_request_key($in['request_key']??null)); break;
    case 'preferences': $result=$game->preferences($user,$in); break;
    default: throw new SpinError('unknown_action','Unknown action.',422);
  }
  json_out(['ok'=>true,'result'=>$result]+(in_array($in['action']??'',['start','collect'],true)?['flight'=>$result]:[]));
} catch(Throwable $e) { spin_error($e); }
