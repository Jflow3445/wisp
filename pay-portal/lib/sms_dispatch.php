<?php
declare(strict_types=1);

/** Pure gateway policy. HTTP and persistent health are injected for behavioral tests. */
function sms_gateway_ids(): array { return ['pilosms', 'mnotify', 'arkesel']; }

function sms_flag($value): bool {
  return in_array(strtolower(trim((string)$value)), ['1','true','yes','on','enabled'], true);
}

function sms_gateway_configs(array $settings): array {
  $legacyBase = rtrim(trim((string)($settings['MNOTIFY_BASE'] ?? '')), '/');
  if ($legacyBase === '') $legacyBase = 'https://api.pilosms.com/v1';
  $legacy = stripos($legacyBase, 'pilosms') !== false ? 'pilosms' : 'mnotify';
  $defaults = ['pilosms'=>'https://api.pilosms.com/v1', 'mnotify'=>'https://api.mnotify.com/api', 'arkesel'=>'https://sms.arkesel.com/sms/api'];
  $out = [];
  foreach (sms_gateway_ids() as $i=>$id) {
    $prefix = 'SMS_'.strtoupper($id).'_';
    $key = trim((string)($settings[$prefix.'API_KEY'] ?? ($id === $legacy ? ($settings['MNOTIFY_API_KEY'] ?? '') : '')));
    $sender = trim((string)($settings[$prefix.'SENDER'] ?? ($id === $legacy ? ($settings['MNOTIFY_SENDER'] ?? '') : '')));
    $base = trim((string)($settings[$prefix.'BASE'] ?? ($id === $legacy ? $legacyBase : $defaults[$id])));
    $base = preg_replace('~/(?:send-message|sms/quick)$~i', '', rtrim($base, '/')) ?? '';
    // Prevent keys being sent to a host entered by mistake. No redirects are followed.
    $url = parse_url($base);
    $host = ['pilosms'=>'api.pilosms.com', 'mnotify'=>'api.mnotify.com', 'arkesel'=>'sms.arkesel.com'][$id];
    $validBase = is_array($url) && ($url['scheme'] ?? '') === 'https' && strtolower($url['host'] ?? '') === $host
      && !isset($url['user']) && !isset($url['pass']) && !isset($url['query']) && !isset($url['fragment']) && (!isset($url['port']) || $url['port'] === 443);
    $enabled = sms_flag($settings[$prefix.'ENABLED'] ?? ($id === $legacy ? '1' : '0'));
    $out[$id] = ['id'=>$id, 'enabled'=>$enabled, 'key'=>$key, 'sender'=>$sender, 'base'=>$base,
      'configured'=>$key !== '' && $sender !== '' && strlen($sender) <= 11 && $validBase,
      'priority'=>max(1,min(99,(int)($settings[$prefix.'PRIORITY'] ?? ($i+1)))),
      'config_hash'=>hash('sha256', $key."\0".$sender."\0".$base)];
  }
  uasort($out, static function($a,$b) { return ($a['priority'] <=> $b['priority']) ?: strcmp($a['id'],$b['id']); });
  return $out;
}

function sms_gateway_request(array $g, string $to, string $message, ?string $sender=null, bool $probe=false): array {
  $sender = $sender !== null && $sender !== '' ? $sender : $g['sender'];
  $method = $probe || $g['id'] === 'arkesel' ? 'GET' : 'POST';
  $headers = ['Accept: application/json']; $body = '';
  if ($g['id'] === 'arkesel') {
    $args = ['action'=>$probe ? 'check-balance' : 'send-sms', 'api_key'=>$g['key']];
    $args += $probe ? ['response'=>'json'] : ['to'=>$to,'from'=>$sender,'sms'=>$message];
    $url = $g['base'].'?'.http_build_query($args, '', '&', PHP_QUERY_RFC3986);
  } elseif ($g['id'] === 'pilosms') {
    $url = $g['base'].($probe ? '/check-balance' : '/send-message').'?apikey='.rawurlencode($g['key']);
    if (!$probe) {
      $headers[] = 'Content-Type: application/x-www-form-urlencoded';
      $body = http_build_query(['sender'=>$sender,'message'=>$message,'receipients'=>$to], '', '&', PHP_QUERY_RFC3986);
    }
  } else {
    $url = $g['base'].($probe ? '/balance/sms' : '/sms/quick').'?key='.rawurlencode($g['key']);
    if (!$probe) {
      $headers[] = 'Content-Type: application/json';
      $recipients=array_map(static function($phone){return '0'.substr($phone,3);},explode(',',$to));
      $body = (string)json_encode(['recipient'=>$recipients,'sender'=>$sender,'message'=>$message,'is_schedule'=>false,'schedule_date'=>'']);
    }
  }
  return ['url'=>$url,'method'=>$method,'headers'=>$headers,'body'=>$body];
}

/** Pilo's cash wallet and SMS bundles are separate balances. Unknown schemas must not disable sending. */
function sms_pilosms_balance(array $data, int $now): array {
  $validNumber=static function($value): bool { return is_numeric($value) && is_finite((float)$value) && (float)$value>=0; };
  $out=['accepted'=>false,'gateway_failure'=>false,'error'=>'balance_unverified'];
  $walletKnown=$validNumber($data['balance'] ?? null);
  if ($walletKnown) $out['balance']=(float)$data['balance'];
  $units=$data['units'] ?? null; $unitsKnown=false;
  if ($validNumber($units)) {
    $out['sms_units']=(float)$units; $unitsKnown=true;
  } elseif (is_array($units)) {
    $nonExpiry=$units['non-expiry'] ?? null; $expiring=$units['expiry'] ?? null;
    $nonExpiryKnown=$validNumber($nonExpiry); $expiringKnown=$validNumber($expiring);
    $expiry=null;
    if (is_string($units['expiry_date'] ?? null)) {
      $date=DateTimeImmutable::createFromFormat('!Y-m-d H:i:s',$units['expiry_date'],new DateTimeZone('UTC'));
      if ($date && $date->format('Y-m-d H:i:s')===$units['expiry_date']) {
        $expiry=$date->getTimestamp(); $out['sms_expiry_date']=$units['expiry_date'];
      }
    }
    if ($nonExpiryKnown) $out['sms_units_non_expiry']=(float)$nonExpiry;
    if ($expiringKnown && ((float)$expiring===0.0 || $expiry!==null)) {
      $out['sms_units_expiring']=$expiry!==null && $expiry>$now ? (float)$expiring : 0.0;
    }
    $knownPositive=(float)($out['sms_units_non_expiry'] ?? 0)+(float)($out['sms_units_expiring'] ?? 0);
    $unitsKnown=$nonExpiryKnown && isset($out['sms_units_expiring'])
      && !array_diff(array_keys($units),['non-expiry','expiry','expiry_date']);
    if ($unitsKnown || $knownPositive>0) $out['sms_units']=$knownPositive;
  }
  if ((float)($out['sms_units'] ?? 0)>0 || (float)($out['balance'] ?? 0)>0) {
    $out['accepted']=true; $out['error']=null;
  } elseif ($walletKnown && $unitsKnown) {
    $out['gateway_failure']=true; $out['error']='insufficient_balance';
  }
  return $out;
}

function sms_gateway_response(string $id, array $http, bool $probe=false, int $expected=1, ?int $now=null): array {
  $status = (int)($http['status'] ?? 0);
  $result = ['accepted'=>false,'accepted_count'=>0,'failover'=>true,'gateway_failure'=>true,'error'=>'gateway_rejected','http_status'=>$status];
  if (!empty($http['error'])) {
    $result['error'] = ($http['error'] === 'connect_failed') ? 'connect_failed' : ($probe ? 'probe_transport_failed' : 'delivery_uncertain');
    $result['failover'] = $probe || $result['error'] === 'connect_failed';
    return $result;
  }
  if ($status < 200 || $status >= 300) {
    $result['error'] = 'http_'.$status;
    // A 5xx can happen after acceptance. Retry only later messages on another gateway.
    if ($status >= 500 && !$probe) { $result['error']='delivery_uncertain'; $result['failover']=false; }
    return $result;
  }
  $j = json_decode((string)($http['body'] ?? ''), true);
  if (!is_array($j)) { $result['error']=$probe ? 'probe_invalid_response' : 'delivery_uncertain'; $result['failover']=$probe; return $result; }
  if ($probe) {
    if ($id==='pilosms') return array_replace($result,sms_pilosms_balance($j,$now ?? time()));
    $balance = $id === 'mnotify' ? ($j['sms_balance'] ?? $j['balance'] ?? null) : ($j['balance'] ?? null);
    if (is_numeric($balance)) {
      $result['balance'] = (float)$balance;
      $result['accepted'] = (float)$balance > 0;
      $result['error'] = $result['accepted'] ? null : 'insufficient_balance';
    }
    return $result;
  }
  if ($id === 'arkesel') {
    $code = strtolower((string)($j['code'] ?? ''));
    $result['accepted'] = $code === 'ok';
    if (in_array($code, ['103','104','109','111'], true)) {
      $result['error']='recipient_or_message_rejected'; $result['failover']=false; $result['gateway_failure']=false;
    }
  } elseif ($id === 'pilosms') {
    $code = (string)($j['status'] ?? '');
    $result['accepted'] = $code === '1001' && (int)($j['errors']['count'] ?? 0) === 0;
    if ($code === '1006' || ($code === '1001' && !$result['accepted'])) {
      $result['error']='recipient_rejected'; $result['failover']=false; $result['gateway_failure']=false;
      if ($code==='1001') $result['accepted_count']=max(0,$expected-(int)$j['errors']['count']);
    }
  } else {
    $code = (string)($j['code'] ?? '');
    $result['accepted'] = $code === '2000' && strtolower((string)($j['status'] ?? '')) === 'success'
      && (!isset($j['summary']['total_sent']) || (int)$j['summary']['total_sent'] === $expected)
      && (int)($j['summary']['total_rejected'] ?? 0) === 0;
    if ($code === '2000' && !$result['accepted']) {
      $result['error']='recipient_rejected'; $result['failover']=false; $result['gateway_failure']=false;
      $result['accepted_count']=max(0,min($expected,(int)($j['summary']['total_sent'] ?? 0)));
    }
  }
  if ($result['accepted']) { $result['accepted_count']=$expected; $result['error']=null; $result['gateway_failure']=false; }
  // Do not expose raw gateway responses: some echo API keys, recipients or OTPs.
  return $result;
}

function sms_dispatch(array $settings, $to, string $message, ?string $sender, callable $load, callable $save, callable $transport, ?callable $guard=null, ?int $now=null): array {
  $now = $now ?? time();
  $out = ['attempted'=>false,'sent'=>false,'accepted_count'=>0,'provider'=>null,'error'=>'no_enabled_gateway'];
  if (!sms_flag($settings['SMS_ENABLED'] ?? '1')) { $out['error']='sms_paused'; return $out; }
  $recipients=is_array($to) ? array_values(array_unique($to)) : [$to];
  if (!$recipients || count($recipients)>100) { $out['error']='invalid_recipient'; return $out; }
  foreach ($recipients as $phone) if (!is_string($phone) || !preg_match('/^233\d{9}$/D',$phone)) { $out['error']='invalid_recipient'; return $out; }
  $to=implode(',',$recipients);
  if (trim($message) === '' || ($sender !== null && strlen($sender)>11)) { $out['error']='invalid_message_or_sender'; return $out; }
  foreach (sms_gateway_configs($settings) as $id=>$g) {
    if (!$g['enabled'] || !$g['configured']) continue;
    $health = $load($id);
    if (($health['config_hash'] ?? '') !== $g['config_hash']) $health = [];
    if ((int)($health['retry_after'] ?? 0) > $now) { $out['error']='gateways_cooling_down'; continue; }
    // Re-read switches immediately before each attempt, including failover/bulk sends.
    if ($guard !== null && !$guard($id)) {
      $out['error']='sms_paused_or_gateway_disabled'; continue;
    }
    $out['attempted']=true; $out['provider']=$id;
    $response = sms_gateway_response($id, $transport(sms_gateway_request($g,$to,$message,$sender)),false,count($recipients));
    $out['sent']=$response['accepted']; $out['error']=$response['error'];
    $out['accepted_count']=$response['accepted_count'];
    $health['config_hash']=$g['config_hash']; $health['last_checked']=$now;
    $health['last_http_status']=$response['http_status'];
    if ($response['accepted']) {
      $health['failures']=0; $health['retry_after']=0; $health['last_error']=null; $health['last_accepted']=$now;
    } elseif ($response['gateway_failure']) {
      $health['failures']=min(10,(int)($health['failures'] ?? 0)+1);
      $health['retry_after']=$now+min(900,60*(2 ** min(4,$health['failures']-1)));
      $health['last_error']=$response['error'];
    }
    try { $save($id,$health); } catch (Throwable $e) { error_log('[sms] health_save_failed'); }
    if ($response['accepted'] || !$response['failover']) return $out;
  }
  return $out;
}
