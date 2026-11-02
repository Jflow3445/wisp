<?php
declare(strict_types=1);
// Local QA router only. Real production PHP endpoints/authentication/DB; no mocked app handlers.
if(PHP_SAPI!=='cli-server' || !getenv('SPIN_TEST_RUNTIME')) { http_response_code(404);exit; }
require_once __DIR__.'/rate_limit.php';
$root=realpath(__DIR__.'/../../pay-portal'); $path=(string)parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH);
if (str_starts_with($path,'/hotspot/')) {
  $root=realpath(__DIR__.'/../../api/hotspot'); $path=substr($path,8);
  require_once __DIR__.'/../../pay-portal/lib/common.php';
  foreach (env_load((string)getenv('SPIN_TEST_RUNTIME').'/.env') as $key=>$value) {
    if (in_array($key,['RADIUS_DSN','RADIUS_USER','RADIUS_PASS'],true)) putenv($key.'='.$value);
  }
} elseif (str_starts_with($path,'/captive/')) {
  $root=realpath(__DIR__.'/../../hotspot'); $path=substr($path,8);
}
$target=realpath($root.($path==='/'?'/index.php':$path));
if(!$target || !str_starts_with($target,$root.DIRECTORY_SEPARATOR) || !is_file($target)) { http_response_code(404);exit; }
if(strtolower(pathinfo($target,PATHINFO_EXTENSION))!=='php') {
  $types=['html'=>'text/html; charset=utf-8','css'=>'text/css','js'=>'text/javascript','svg'=>'image/svg+xml','ico'=>'image/x-icon','png'=>'image/png'];
  header('Content-Type: '.($types[strtolower(pathinfo($target,PATHINFO_EXTENSION))]??'application/octet-stream')); readfile($target);exit;
}
$_SERVER['DOCUMENT_ROOT']=(string)getenv('SPIN_TEST_RUNTIME');
require $target;
