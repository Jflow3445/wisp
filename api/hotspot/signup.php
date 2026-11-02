<?php
declare(strict_types=1);
require_once __DIR__.'/_paylib.php';
try { hotspot_require_paylib('registration_runtime.php'); }
catch (Throwable $e) { http_response_code(503); echo 'Registration is temporarily unavailable. Please try again.'; exit; }

function portal_base_from_link(string $link,string $fallback): string {
  $parts=parse_url(trim($link));
  if (!is_array($parts) || empty($parts['host']) || empty($parts['scheme'])) return $fallback;
  $host=strtolower((string)$parts['host']); $scheme=strtolower((string)$parts['scheme']);
  $allowed=['wifi.nister.org'=>['https','http'],'192.168.88.1'=>['http','https'],
    '192.168.80.1'=>['http','https'],'10.10.20.2'=>['http','https']];
  if (!isset($allowed[$host]) || !in_array($scheme,$allowed[$host],true) || isset($parts['user']) || isset($parts['pass'])) return $fallback;
  return $scheme.'://'.$host.(isset($parts['port']) ? ':'.(int)$parts['port'] : '');
}

$linkLoginOnly=(string)($_POST['link_login_only'] ?? '');
$PORTAL_BASE=portal_base_from_link($linkLoginOnly,'');
$locationCodeRaw=trim((string)($_POST['location_code'] ?? $_POST['site_code'] ?? ''));
function fail(string $code,string $username='',string $dst='',string $name=''): void {
  global $PORTAL_BASE,$locationCodeRaw;
  $back=$PORTAL_BASE!=='' ? $PORTAL_BASE.'/signup.html' : 'https://pay.nister.org/register.php';
  $params=['err'=>$code,'username'=>$username,'name'=>$name,'location_code'=>$locationCodeRaw];
  header('Cache-Control: no-store');
  header('Location: '.$back.'?'.http_build_query($params,'','&',PHP_QUERY_RFC3986),true,303); exit;
}
if (($_SERVER['REQUEST_METHOD'] ?? 'GET')!=='POST') fail('method_not_allowed');
$origin=(string)($_SERVER['HTTP_ORIGIN'] ?? '');
if ($origin!=='' && !registration_origin_allowed($origin)) { http_response_code(403); echo 'Origin not allowed.'; exit; }
if ($locationCodeRaw==='') {
  try {
    $autoLoc=location_resolve_from_router_context([
      'link_login_only'=>$linkLoginOnly,'link_login'=>(string)($_POST['link_login'] ?? ''),
      'remote_addr'=>(string)($_SERVER['REMOTE_ADDR'] ?? ''),'x_forwarded_for'=>(string)($_SERVER['HTTP_X_FORWARDED_FOR'] ?? ''),
      'router_ip'=>(string)($_POST['router_ip'] ?? ''),'router_id'=>(string)($_POST['router_id'] ?? $_POST['identity'] ?? $_POST['nas_id'] ?? ''),
    ]);
    if ($autoLoc) $locationCodeRaw=(string)($autoLoc['code'] ?? '');
  } catch (Throwable $e) { /* Missing router context uses the default site. */ }
}
try {
  $account=registration_submit($GLOBALS['PDO'],$_POST,$locationCodeRaw);
} catch (InvalidArgumentException $e) {
  fail($e->getMessage(),(string)($_POST['username'] ?? ''),'',(string)($_POST['name'] ?? ''));
} catch (Throwable $e) {
  error_log('[registration] creation_failed class='.get_class($e).' code='.(string)$e->getCode());
  fail($e->getMessage()==='account_exists' ? 'account_exists' : 'server_error',(string)($_POST['username'] ?? ''),'',(string)($_POST['name'] ?? ''));
}
if ($PORTAL_BASE==='') {
  header('Location: https://pay.nister.org/login.php?msg=registered&username='.rawurlencode($account['username']),true,303); exit;
}
$LOGIN_URL=$PORTAL_BASE.'/login.html';
header('Content-Type: text/html; charset=utf-8'); header('Cache-Control: no-store'); header('X-Robots-Tag: noindex');
?>
<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Account created | Nister Wi-Fi</title></head>
<body><h1>Your account is ready</h1><p>Sign in with your phone number and password, then choose a plan to get online.</p>
<p><a href="<?=htmlspecialchars($LOGIN_URL,ENT_QUOTES,'UTF-8')?>" target="_top">Continue to Wi-Fi login</a></p>
<p><a href="https://pay.nister.org/login.php" target="_top">Manage your account</a></p></body></html>
