<?php
declare(strict_types=1);
require_once __DIR__.'/settings.php';
require_once __DIR__.'/common.php';
require_once __DIR__.'/sms_dispatch.php';

function sms_setting(string $k, ?string $default=null): ?string { return settings_get($k,$default); }
function sms_template(string $tpl, array $vars): string {
  foreach ($vars as $k=>$v) $tpl=str_replace('{'.$k.'}',(string)$v,$tpl);
  return $tpl;
}
function sms_normalize_e164(string $raw): string {
  $canon=normalize_msisdn($raw);
  return preg_match('/^233\d{9}$/',$canon) ? $canon : '';
}
function sms_normalize_local(string $raw): string {
  $canon=sms_normalize_e164($raw);
  return $canon === '' ? '' : '0'.substr($canon,3);
}

function sms_health_bootstrap(): void {
  static $ready=false;
  if ($ready) return;
  global $PDO;
  $PDO->exec("CREATE TABLE IF NOT EXISTS sms_gateway_health (
    provider VARCHAR(16) PRIMARY KEY,
    config_hash CHAR(64) NOT NULL DEFAULT '',
    failures INT NOT NULL DEFAULT 0,
    retry_after BIGINT NOT NULL DEFAULT 0,
    last_checked BIGINT NOT NULL DEFAULT 0,
    last_accepted BIGINT NOT NULL DEFAULT 0,
    last_http_status INT NOT NULL DEFAULT 0,
    last_error VARCHAR(64) NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
  $ready=true;
}
function sms_health_load(string $id): array {
  sms_health_bootstrap(); global $PDO;
  $st=$PDO->prepare('SELECT * FROM sms_gateway_health WHERE provider=?'); $st->execute([$id]);
  return $st->fetch(PDO::FETCH_ASSOC) ?: [];
}
function sms_health_save(string $id,array $health): void {
  sms_health_bootstrap(); global $PDO;
  $fields=['config_hash','failures','retry_after','last_checked','last_accepted','last_http_status','last_error'];
  $values=[$id]; foreach ($fields as $f) $values[]=$health[$f] ?? ($f==='config_hash' ? '' : ($f==='last_error' ? null : 0));
  $update=implode(',',array_map(static function($f){return "$f=VALUES($f)";},$fields));
  $PDO->prepare('INSERT INTO sms_gateway_health(provider,'.implode(',',$fields).') VALUES(?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE '.$update)->execute($values);
}

function sms_http(array $request): array {
  if (!function_exists('curl_init')) return ['status'=>0,'body'=>'','error'=>'connect_failed'];
  $ch=curl_init($request['url']);
  curl_setopt_array($ch,[CURLOPT_RETURNTRANSFER=>true,CURLOPT_CONNECTTIMEOUT=>3,CURLOPT_TIMEOUT=>7,
    CURLOPT_HTTPHEADER=>$request['headers'],CURLOPT_FOLLOWLOCATION=>false,CURLOPT_PROTOCOLS=>CURLPROTO_HTTPS]);
  if ($request['method']==='POST') { curl_setopt($ch,CURLOPT_POST,true); curl_setopt($ch,CURLOPT_POSTFIELDS,$request['body']); }
  $body=curl_exec($ch); $errno=curl_errno($ch); $status=(int)curl_getinfo($ch,CURLINFO_HTTP_CODE); curl_close($ch);
  $error=$errno===0 ? null : (in_array($errno,[CURLE_COULDNT_RESOLVE_HOST,CURLE_COULDNT_RESOLVE_PROXY,CURLE_COULDNT_CONNECT],true) ? 'connect_failed' : 'delivery_uncertain');
  return ['status'=>$status,'body'=>is_string($body) ? $body : '', 'error'=>$error];
}

function sms_send_result(string $msisdn,string $message,?string $senderOverride=null): array {
  return sms_send_batch_result([$msisdn],$message,$senderOverride);
}
function sms_send_batch_result(array $recipients,string $message,?string $senderOverride=null): array {
  try {
    $recipients=array_values(array_unique(array_map('sms_normalize_e164',$recipients)));
    return sms_dispatch(settings_get_all(),$recipients,$message,$senderOverride,
      'sms_health_load','sms_health_save','sms_http',static function(string $id): bool {
        $settings=settings_get_all(); $gateways=sms_gateway_configs($settings);
        return sms_flag($settings['SMS_ENABLED'] ?? '1') && $gateways[$id]['enabled'] && $gateways[$id]['configured'];
      });
  } catch (Throwable $e) {
    error_log('[sms] dispatch_unavailable');
    return ['attempted'=>false,'sent'=>false,'accepted_count'=>0,'provider'=>null,'error'=>'sms_unavailable'];
  }
}
function sms_send(string $msisdn,string $message,?string $senderOverride=null): bool {
  return (bool)sms_send_result($msisdn,$message,$senderOverride)['sent'];
}
function sms_send_templated(string $msisdn,string $settingKey,string $defaultTemplate,array $vars): array {
  try {
    $tpl=trim((string)sms_setting($settingKey,'')); $source=$tpl!=='' ? 'setting' : 'default';
    $message=trim(sms_template($tpl!=='' ? $tpl : $defaultTemplate,$vars));
    if ($message==='') return ['attempted'=>false,'sent'=>false,'template_source'=>$source,'error'=>'empty_message'];
    return sms_send_result($msisdn,$message)+['template_source'=>$source];
  } catch (Throwable $e) {
    error_log('[sms] template_unavailable');
    return ['attempted'=>false,'sent'=>false,'template_source'=>null,'error'=>'sms_unavailable'];
  }
}

/** Safe admin view; never return keys, key hashes, messages, recipients or raw responses. */
function sms_admin_status(): array {
  $settings=settings_get_all(); $rows=[];
  foreach (sms_gateway_configs($settings) as $id=>$g) {
    $h=sms_health_load($id);
    if (($h['config_hash'] ?? '')!==$g['config_hash']) $h=[];
    $state=!$g['enabled'] ? 'disabled' : (!$g['configured'] ? 'not configured' : ((int)($h['retry_after'] ?? 0)>time() ? 'cooling down' : (empty($h['last_checked']) ? 'not checked' : (empty($h['last_error']) ? 'ready' : 'retry ready'))));
    $rows[]=['id'=>$id,'enabled'=>$g['enabled'],'configured'=>$g['configured'],'sender'=>$g['sender'],'base'=>$g['base'],'priority'=>$g['priority'],
      'has_key'=>$g['key']!=='','state'=>$state,'retry_after'=>(int)($h['retry_after'] ?? 0),
      'last_checked'=>(int)($h['last_checked'] ?? 0),'last_accepted'=>(int)($h['last_accepted'] ?? 0),
      'last_error'=>$h['last_error'] ?? null,'last_http_status'=>(int)($h['last_http_status'] ?? 0)];
  }
  return ['enabled'=>sms_flag($settings['SMS_ENABLED'] ?? '1'),'gateways'=>$rows];
}

function sms_probe_gateway(string $id): array {
  $settings=settings_get_all(); $g=sms_gateway_configs($settings)[$id] ?? null;
  if (!$g || !$g['enabled'] || !$g['configured']) return ['ok'=>false,'error'=>'gateway_disabled_or_unconfigured'];
  $result=sms_gateway_response($id,sms_http(sms_gateway_request($g,'','',null,true)),true);
  $h=sms_health_load($id);
  if (($h['config_hash'] ?? '')!==$g['config_hash']) $h=[];
  $h['config_hash']=$g['config_hash']; $h['last_checked']=time(); $h['last_http_status']=$result['http_status'];
  $h['last_error']=$result['error']; $h['failures']=$result['accepted'] ? 0 : (int)($h['failures'] ?? 0)+1;
  $h['retry_after']=$result['accepted'] ? 0 : time()+60;
  sms_health_save($id,$h);
  return ['ok'=>$result['accepted'],'error'=>$result['error'],'balance'=>$result['balance'] ?? null];
}

function sms_admin_save_gateways(array $input): void {
  global $PDO;
  $updates=[]; $existing=sms_gateway_configs(settings_get_all());
  foreach (sms_gateway_ids() as $id) {
    $g=$existing[$id]; $prefix='SMS_'.strtoupper($id).'_';
    $key=trim((string)($input['key_'.$id] ?? ''));
    if ($key==='') $key=$g['key'];
    if (!empty($input['clear_key_'.$id])) $key='';
    $sender=trim((string)($input['sender_'.$id] ?? ''));
    $enabled=!empty($input['enabled_'.$id]);
    $priority=filter_var($input['priority_'.$id] ?? null,FILTER_VALIDATE_INT,['options'=>['min_range'=>1,'max_range'=>99]]);
    if ($priority===false || strlen($key)>512 || preg_match('/[\x00-\x20]/',$key) || strlen($sender)>11 || preg_match('/[\x00-\x1f]/',$sender)) throw new InvalidArgumentException('Invalid settings for '.$id.'. Sender IDs allow up to 11 characters; priorities are 1–99.');
    if ($enabled && ($key==='' || $sender==='')) throw new InvalidArgumentException('Enter an API key and Sender ID before enabling '.$id.'.');
    $updates[$prefix.'API_KEY']=$key; $updates[$prefix.'SENDER']=$sender;
    $updates[$prefix.'ENABLED']=$enabled ? '1' : '0'; $updates[$prefix.'PRIORITY']=(string)$priority;
    $updates[$prefix.'BASE']=$g['base'];
  }
  $candidate=sms_gateway_configs($updates);
  foreach ($candidate as $g) if ($g['enabled'] && !$g['configured']) throw new InvalidArgumentException('Invalid HTTPS endpoint for '.$g['id'].'.');
  $PDO->beginTransaction();
  try { foreach ($updates as $key=>$value) settings_set($key,$value); $PDO->commit(); }
  catch (Throwable $e) { if ($PDO->inTransaction()) $PDO->rollBack(); throw $e; }
}
