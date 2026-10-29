<?php
declare(strict_types=1);
require_once __DIR__.'/lib/user_auth.php';require_once __DIR__.'/lib/withdrawal_http.php';
withdrawal_headers();
try {
  $env=user_boot();user_require_login(true);$user=normalize_msisdn(user_msisdn());$service=new WalletWithdrawals(db_pdo($env));
  if (($_SERVER['REQUEST_METHOD']??'GET')==='GET') json_out(['ok'=>true,'snapshot'=>$service->snapshot($user)]);
  $in=withdrawal_input();
  if (!nister_rate_limit_allow('wallet_withdrawal',$user,20,3600,300)['allowed']) throw new WithdrawalError('rate_limited','Too many requests. Please try again later.',429);
  nister_rate_limit_hit('wallet_withdrawal',$user,20,3600,300);
  json_out(['ok'=>true,'withdrawal'=>$service->request($user,$in)]);
}catch(Throwable $e){withdrawal_error($e);}
