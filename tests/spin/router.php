<?php
declare(strict_types=1);
// Local QA router only. Real production PHP endpoints/authentication/DB; no mocked app handlers.
if(PHP_SAPI!=='cli-server' || !getenv('SPIN_TEST_RUNTIME')) { http_response_code(404);exit; }
$root=realpath(__DIR__.'/../../pay-portal'); $path=(string)parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH);
$target=realpath($root.($path==='/'?'/index.php':$path));
if(!$target || !str_starts_with($target,$root.DIRECTORY_SEPARATOR) || !is_file($target)) { http_response_code(404);exit; }
if(strtolower(pathinfo($target,PATHINFO_EXTENSION))!=='php') {
  $types=['css'=>'text/css','js'=>'text/javascript','svg'=>'image/svg+xml','ico'=>'image/x-icon','png'=>'image/png'];
  header('Content-Type: '.($types[strtolower(pathinfo($target,PATHINFO_EXTENSION))]??'application/octet-stream')); readfile($target);exit;
}
$_SERVER['DOCUMENT_ROOT']=(string)getenv('SPIN_TEST_RUNTIME');
require $target;
