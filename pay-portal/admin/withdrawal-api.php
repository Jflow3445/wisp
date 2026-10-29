<?php
declare(strict_types=1);
require_once __DIR__.'/../lib/admin_auth.php';require_once __DIR__.'/../lib/withdrawal_http.php';
withdrawal_headers();
try {
  $env=admin_boot();if (!admin_logged_in()) throw new WithdrawalError('unauthorized','Sign in to the WISP admin portal.',401);
  $service=new WalletWithdrawals(db_pdo($env));
  if (($_SERVER['REQUEST_METHOD']??'GET')==='GET') {
    $page=filter_var(withdrawal_text($_GET,'page','0'),FILTER_VALIDATE_INT,['options'=>['min_range'=>0,'max_range'=>10000]]);
    if ($page===false) throw new WithdrawalError('invalid_search','Choose a valid page.');
    json_out(['ok'=>true,'queue'=>$service->queue(withdrawal_text($_GET,'status','pending'),trim(withdrawal_text($_GET,'search')),$page)]);
  }
  $in=withdrawal_input(true);$actor=(string)$_SESSION['admin_user'];
  if (($in['action']??'')==='configure') json_out(['ok'=>true,'minimum_cents'=>$service->configure($actor,$in['minimum']??null)]);
  json_out(['ok'=>true,'withdrawal'=>$service->decide($actor,$in)]);
}catch(Throwable $e){withdrawal_error($e);}
