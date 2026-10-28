<?php
declare(strict_types=1);
require_once __DIR__.'/../../pay-portal/lib/sms_dispatch.php';
$checks=0;
function sms_check(string $name,bool $condition): void { global $checks; if (!$condition) throw new RuntimeException($name); $checks++; echo "PASS sms_$name\n"; }
function sms_fixture(): array {
  $s=['SMS_ENABLED'=>'1'];
  foreach (sms_gateway_ids() as $i=>$id) foreach (['ENABLED'=>'1','API_KEY'=>'test-secret-'.$id,'SENDER'=>'Nister','PRIORITY'=>(string)($i+1)] as $key=>$value) $s['SMS_'.strtoupper($id).'_'.$key]=$value;
  return $s;
}
function sms_simulate(array $settings,array $responses,array &$health,array &$requests,?callable $guard=null,int $time=1000): array {
  return sms_dispatch($settings,'233190000001','Test & + # OTP 123456',null,
    static function($id) use (&$health){return $health[$id] ?? [];},
    static function($id,$value) use (&$health){$health[$id]=$value;},
    static function($request) use (&$requests,&$responses){$requests[]=$request; if (!$responses) throw new RuntimeException('unexpected_network_call'); return array_shift($responses);},$guard,$time);
}
function sms_response(string $body,int $status=200): array { return ['status'=>$status,'body'=>$body]; }
$s=sms_fixture();$h=[];$calls=[];
$paused=$s;$paused['SMS_ENABLED']='0';$r=sms_simulate($paused,[],$h,$calls);
sms_check('pause_stops_all_network_calls',!$r['attempted'] && $r['error']==='sms_paused' && !$calls);
$disabled=$s;foreach(sms_gateway_ids() as $id) $disabled['SMS_'.strtoupper($id).'_ENABLED']='0';
$r=sms_simulate($disabled,[],$h,$calls);sms_check('disabled_gateways_never_contacted',!$r['attempted'] && !$calls);
$r=sms_simulate($s,[sms_response('{"status":1005}'),sms_response('{"status":"success","code":"2000","summary":{"total_sent":1}}')],$h,$calls);
sms_check('insufficient_credit_fails_over',$r['sent'] && $r['provider']==='mnotify' && count($calls)===2 && $h['pilosms']['retry_after']===1060);
$calls=[];$r=sms_simulate($s,[sms_response('{"status":"success","code":"2000"}')],$h,$calls,null,1001);
sms_check('persistent_cooldown_skips_broken_gateway',$r['sent'] && count($calls)===1 && strpos($calls[0]['url'],'mnotify')!==false);
$calls=[];$r=sms_simulate($s,[sms_response('{"status":1001}')],$h,$calls,null,1061);
sms_check('gateway_recovers_after_cooldown',$r['sent'] && $r['provider']==='pilosms' && $h['pilosms']['retry_after']===0);
$h=[];$calls=[];$r=sms_simulate($s,[['status'=>0,'body'=>'','error'=>'delivery_uncertain']],$h,$calls);
sms_check('timeout_does_not_duplicate_otp',!$r['sent'] && $r['error']==='delivery_uncertain' && count($calls)===1 && $h['pilosms']['retry_after']>1000);
$calls=[];$r=sms_simulate($s,[sms_response('{"status":"success","code":"2000"}')],$h,$calls,null,1001);
sms_check('later_message_uses_backup_after_timeout',$r['sent'] && $r['provider']==='mnotify');
$h=[];$calls=[];$r=sms_simulate($s,[['status'=>0,'body'=>'','error'=>'connect_failed'],sms_response('{"status":"success","code":"2000"}')],$h,$calls);
sms_check('connect_failure_fails_over_immediately',$r['sent'] && count($calls)===2);
$h=[];$calls=[];$r=sms_simulate($s,[sms_response('<html>proxy error</html>')],$h,$calls);
sms_check('http_200_html_never_claims_success',!$r['sent'] && $r['error']==='delivery_uncertain' && count($calls)===1);
$h=[];$calls=[];$r=sms_simulate($s,[sms_response('{"status":1006}')],$h,$calls);
sms_check('bad_recipient_does_not_penalize_gateway_or_retry',!$r['sent'] && count($calls)===1 && empty($h['pilosms']['retry_after']));
$h=[];$calls=[];$r=sms_simulate($s,[],$h,$calls,static function($id){return false;});
sms_check('pause_rechecked_before_transport',!$r['attempted'] && !$calls);
$ark=$s;$ark['SMS_ARKESEL_PRIORITY']='1';$ark['SMS_PILOSMS_ENABLED']='0';$ark['SMS_MNOTIFY_ENABLED']='0';
$h=[];$calls=[];$r=sms_simulate($ark,[sms_response('{"code":"ok","message":"Successfully Sent"}')],$h,$calls);
parse_str((string)parse_url($calls[0]['url'],PHP_URL_QUERY),$params);
sms_check('arkesel_uses_requested_v1_contract',$r['sent'] && $r['provider']==='arkesel' && $params['action']==='send-sms' && $params['to']==='233190000001' && $params['from']==='Nister' && $params['sms']==='Test & + # OTP 123456');
$result=sms_gateway_response('arkesel',sms_response('{"code":"102","message":"Authentication Failed"}'));
sms_check('arkesel_auth_failure_is_explicit_failover',!$result['accepted'] && $result['failover'] && $result['gateway_failure']);
$result=sms_gateway_response('arkesel',sms_response('{"code":"111","message":"Wait for approval"}'));
sms_check('arkesel_approval_not_retried',!$result['accepted'] && !$result['failover']);
$result=sms_gateway_response('mnotify',sms_response('{"status":"error","code":"4000"}'));
sms_check('mnotify_application_error_not_200_success',!$result['accepted'] && $result['failover']);
$result=sms_gateway_response('mnotify',sms_response('{"status":"success","code":"2000","summary":{"total_sent":0,"total_rejected":1}}'));
sms_check('mnotify_zero_recipients_is_failure',!$result['accepted'] && !$result['failover']);
$legacy=sms_gateway_configs(['MNOTIFY_BASE'=>'https://api.pilosms.com/v1','MNOTIFY_API_KEY'=>'legacy-key','MNOTIFY_SENDER'=>'Nister WiFi']);
sms_check('existing_pilosms_configuration_preserved',$legacy['pilosms']['enabled'] && $legacy['pilosms']['configured'] && !$legacy['mnotify']['enabled'] && !$legacy['arkesel']['enabled']);
$wrong=$s;$wrong['SMS_ARKESEL_BASE']='https://evil.example/sms/api';$g=sms_gateway_configs($wrong);
sms_check('secrets_not_sent_to_arbitrary_host',!$g['arkesel']['configured']);
$wrong['SMS_ARKESEL_BASE']='https://user@sms.arkesel.com/sms/api';$g=sms_gateway_configs($wrong);
sms_check('url_credentials_rejected',!$g['arkesel']['configured']);
$g=sms_gateway_configs($s)['arkesel'];$probe=sms_gateway_request($g,'','',null,true);
parse_str((string)parse_url($probe['url'],PHP_URL_QUERY),$params);
sms_check('balance_probe_never_sends_sms',$params['action']==='check-balance' && $params['response']==='json' && !isset($params['sms']));
$result=sms_gateway_response('arkesel',sms_response('{"balance":0}'),true);
sms_check('empty_balance_is_unhealthy',!$result['accepted'] && $result['error']==='insufficient_balance');
$result=sms_gateway_response('pilosms',sms_response('{"balance":39.29,"units":1309}'),true);
sms_check('pilosms_balance_recognized',$result['accepted']);
$result=sms_gateway_response('pilosms',sms_response('{"status":1001,"errors":{"count":1}}'),false,3);
sms_check('partial_bulk_not_resent_to_another_gateway',!$result['accepted'] && $result['accepted_count']===2 && !$result['failover']);
$g=sms_gateway_configs($s)['mnotify'];$request=sms_gateway_request($g,'233190000001,233190000002','Bulk test');
$payload=json_decode($request['body'],true);
sms_check('mnotify_bulk_uses_array_of_local_recipients',$payload['recipient']===['0190000001','0190000002']);
$result=sms_gateway_response('mnotify',sms_response('{"status":"success","code":"2000","summary":{"total_sent":2,"total_rejected":0}}'),false,2);
sms_check('whole_bulk_acceptance_counted',$result['accepted'] && $result['accepted_count']===2);
$h=[];$calls=[];$r=sms_simulate($s,[sms_response('{"status":1001}')],$h,$calls);
$s['SMS_PILOSMS_API_KEY']='changed-test-key';$h['pilosms']['retry_after']=9999;$calls=[];
$r=sms_simulate($s,[sms_response('{"status":1001}')],$h,$calls);
sms_check('new_credentials_clear_stale_cooldown',$r['sent'] && $r['provider']==='pilosms');
echo "SMS gateway checks passed ($checks).\n";
