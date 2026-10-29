<?php
declare(strict_types=1);
require_once __DIR__.'/lib/user_auth.php';
require_once __DIR__.'/lib/plans_radius.php';
require_once __DIR__.'/lib/spin/http.php';
spin_headers();
try {
  $env=user_boot(); user_require_login(true); $db=db_pdo($env); $game=new SpinService($db,$env);
  $user=normalize_msisdn(user_msisdn());
  $loc=location_resolve_for_user($user,location_session_get_code()); $locationId=(int)($loc['id']??0);
  if($locationId<=0) $locationId=location_default_id();
  if(($_SERVER['REQUEST_METHOD']??'GET')==='GET') json_out(['ok'=>true,'credits'=>$game->credits($user,max(0,(int)($_GET['page']??0))),'plans'=>array_values(radius_fetch_plans(false,$locationId,true))]);
  $in=spin_input(); spin_rate_limit($db,'redemption:'.$user,10,60,$game->now());
  $key=spin_request_key($in['request_key']??null);
  $settled=$game->rows('SELECT * FROM spin_redemptions WHERE msisdn=? AND request_key=?',[$user,$key]);
  if($settled) {
    if($settled[0]['plan_code']!==(string)($in['plan_code']??'') || (int)$settled[0]['location_id']!==$locationId) throw new SpinError('idempotency_conflict','This request key belongs to another purchase.');
    json_out(['ok'=>true,'receipt'=>$settled[0],'credits'=>$game->credits($user)]);
  }
  $plan=radius_find_plan((string)($in['plan_code']??''),$locationId,true);
  if(!$plan || !radius_plan_is_active($plan)) throw new SpinError('plan_inactive','Choose a current internet plan.',422);
  // No gameplay-state, eligibility, or launch gate applies to spending an existing obligation.
  $receipt=$game->redeem($user,$plan,$locationId,$key);
  try { radius_try_disconnect($user,$env,$locationId); } catch(Throwable $e) { error_log('[spin] redemption_disconnect_deferred'); }
  json_out(['ok'=>true,'receipt'=>$receipt,'credits'=>$game->credits($user)]);
} catch(Throwable $e) { spin_error($e); }
