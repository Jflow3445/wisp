<?php
declare(strict_types=1);
require_once __DIR__.'/service.php';

function spin_headers(): void {
  header('Cache-Control: no-store, private, max-age=0');
  header('X-Robots-Tag: noindex, nofollow, noarchive');
  header('X-Content-Type-Options: nosniff');
  header('Referrer-Policy: same-origin');
  header("Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
}
function spin_csrf(): string {
  if(empty($_SESSION['spin_csrf'])) $_SESSION['spin_csrf']=bin2hex(random_bytes(32));
  return $_SESSION['spin_csrf'];
}
function spin_input(bool $admin=false): array {
  if(($_SERVER['REQUEST_METHOD']??'')!=='POST') throw new SpinError('method_not_allowed','Use POST for changes.',405);
  if((int)($_SERVER['CONTENT_LENGTH']??0)>16384) throw new SpinError('request_too_large','Request is too large.',413);
  if(!nister_is_same_origin_request()) throw new SpinError('origin_not_allowed','Same-origin requests are required.',403);
  $expected=$admin?(string)($_SESSION['admin_csrf']??''):spin_csrf();
  $provided=(string)($_SERVER['HTTP_X_CSRF_TOKEN']??'');
  if($expected==='' || !hash_equals($expected,$provided)) throw new SpinError('csrf_invalid','Your session expired. Reload this page.',419);
  $raw=file_get_contents('php://input',false,null,0,16385);
  if($raw===false || strlen($raw)>16384) throw new SpinError('request_too_large','Request is too large.',413);
  try { $in=json_decode($raw,true,32,JSON_THROW_ON_ERROR); }
  catch(JsonException $e) { throw new SpinError('invalid_json','Send a JSON object.',422); }
  if(!is_array($in) || array_is_list($in)) throw new SpinError('invalid_json','Send a JSON object.',422);
  return $in;
}
function spin_error(Throwable $e): never {
  if($e instanceof SpinError) {
    if(in_array($e->errorCode,['mfa_invalid','forbidden','csrf_invalid','origin_not_allowed','rate_limited'],true)) error_log(json_encode(['module'=>'spin','event'=>'security_rejected','code'=>$e->errorCode]));
    json_out(['ok'=>false,'error'=>$e->errorCode,'message'=>$e->getMessage()],$e->httpStatus);
  }
  // SQL bindings, credentials, and customer details must not enter logs or client responses.
  error_log(json_encode(['module'=>'spin','event'=>'request_failed','class'=>get_class($e)]));
  // Existing WISP alert queue; visibility/Ghost Mode never disables operational reporting.
  try {
    require_once __DIR__.'/../alerts.php';
    $pdo=$GLOBALS['PDO']??null;
    if($pdo instanceof PDO && !$pdo->inTransaction()) {
      alerts_bootstrap($pdo);
      $recent=$pdo->query("SELECT COUNT(*) FROM admin_alerts WHERE type='spin_request_failure' AND created_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 5 MINUTE)")->fetchColumn();
      if((int)$recent===0) alerts_insert($pdo,gmdate('Y-m-d H:i:s'),'spin_request_failure',null,'Spin service request failed. Inspect structured application logs and run game reconciliation.',null);
    }
  } catch(Throwable $alertError) { error_log('[spin] request_failure_alert_deferred'); }
  json_out(['ok'=>false,'error'=>'service_unavailable','message'=>'The service is temporarily unavailable. Check your receipts before retrying.'],503);
}
function spin_html(mixed $v): string { return htmlspecialchars((string)$v,ENT_QUOTES,'UTF-8'); }
