<?php
declare(strict_types=1);
require_once __DIR__.'/withdrawals.php';

function withdrawal_headers(): void {
  header('Cache-Control: no-store, private, max-age=0');header('X-Content-Type-Options: nosniff');header('Referrer-Policy: same-origin');
}
function withdrawal_csrf(): string {
  if (empty($_SESSION['wallet_csrf'])) $_SESSION['wallet_csrf']=bin2hex(random_bytes(32));
  return $_SESSION['wallet_csrf'];
}
function withdrawal_input(bool $admin=false): array {
  if (($_SERVER['REQUEST_METHOD']??'')!=='POST') throw new WithdrawalError('method_not_allowed','Use POST for changes.',405);
  if (!nister_is_same_origin_request()) throw new WithdrawalError('origin_not_allowed','Same-origin requests are required.',403);
  $expected=$admin?(string)($_SESSION['admin_csrf']??''):withdrawal_csrf();$given=(string)($_SERVER['HTTP_X_CSRF_TOKEN']??'');
  if ($expected==='' || !hash_equals($expected,$given)) throw new WithdrawalError('csrf_invalid','Your session expired. Reload this page.',419);
  if ((int)($_SERVER['CONTENT_LENGTH']??0)>8192) throw new WithdrawalError('request_too_large','Request is too large.',413);
  $raw=file_get_contents('php://input',false,null,0,8193);
  if ($raw===false || strlen($raw)>8192) throw new WithdrawalError('request_too_large','Request is too large.',413);
  try {$in=json_decode($raw,true,16,JSON_THROW_ON_ERROR);}catch(JsonException $e){throw new WithdrawalError('invalid_json','Send a JSON object.');}
  if (!is_array($in) || array_is_list($in)) throw new WithdrawalError('invalid_json','Send a JSON object.');
  return $in;
}
function withdrawal_error(Throwable $e): never {
  if ($e instanceof WithdrawalError) json_out(['ok'=>false,'error'=>$e->errorCode,'message'=>$e->getMessage()],$e->httpStatus);
  error_log('[withdrawal] request_failed '.get_class($e));
  json_out(['ok'=>false,'error'=>'service_unavailable','message'=>'Withdrawals are temporarily unavailable. Check your request history before retrying.'],503);
}
