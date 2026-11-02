<?php
declare(strict_types=1);
require_once __DIR__.'/admin_registration.php';

/** Only an explicit global SMS pause relaxes NEW-account verification. */
function registration_otp_required($smsEnabled): bool {
  return !in_array(strtolower(trim((string)$smsEnabled)),['0','false','off','no','disabled'],true);
}

function registration_policy(): array {
  return ['otp_required'=>registration_otp_required(settings_get('SMS_ENABLED','1'))];
}

function registration_origin_allowed(string $origin): bool {
  $p=parse_url($origin);
  if (!is_array($p) || isset($p['user']) || isset($p['pass'])) return false;
  $normalized=strtolower((string)($p['scheme'] ?? '')).'://'.strtolower((string)($p['host'] ?? ''));
  if (isset($p['port'])) $normalized.=':'.(int)$p['port'];
  return in_array($normalized,['https://pay.nister.org','https://wifi.nister.org','http://wifi.nister.org',
    'http://192.168.88.1','https://192.168.88.1','http://192.168.80.1','https://192.168.80.1',
    'http://10.10.20.2','https://10.10.20.2'],true);
}

/** Authorize after the duplicate check, inside the same atomic creation transaction. */
function self_register_account(PDO $db,array $input,array $location,?callable $readSmsSwitch=null): array {
  $readSmsSwitch=$readSmsSwitch ?? static function() use ($db) {
    // A current, shared locking read prevents a resume from racing the commit.
    $suffix=$db->getAttribute(PDO::ATTR_DRIVER_NAME)==='mysql' ? ' LOCK IN SHARE MODE' : '';
    $st=$db->query("SELECT v FROM app_settings WHERE k='SMS_ENABLED'".$suffix);
    $value=$st->fetchColumn(); return $value===false ? '1' : $value;
  };
  return admin_register_account($db,$input,$location,static function(PDO $transaction,string $user) use ($input,$readSmsSwitch): void {
    if (!registration_otp_required($readSmsSwitch())) return;
    $token=trim((string)($input['otp_token'] ?? ''));
    if ($token==='') throw new InvalidArgumentException('otp_required');
    if (!preg_match('/^[a-f0-9]{64}$/D',$token)) throw new InvalidArgumentException('otp_invalid_or_expired');
    $now=gmdate('Y-m-d H:i:s');
    $consume=$transaction->prepare('UPDATE signup_otp_sessions SET consumed_at=? WHERE token=? AND msisdn=? AND consumed_at IS NULL AND expires_at>=?');
    $consume->execute([$now,$token,$user,$now]);
    if ($consume->rowCount()!==1) throw new InvalidArgumentException('otp_invalid_or_expired');
  });
}

function registration_limit_attempt(string $phone,string $ip): void {
  $ip=$ip!=='' ? $ip : 'unknown';
  $canonical=normalize_msisdn($phone);
  foreach ([['signup_ip',$ip,60],['signup_phone',$canonical!=='' ? $canonical : $phone,6]] as [$scope,$key,$limit]) {
    $gate=nister_rate_limit_allow($scope,$key,$limit,3600,900);
    if (!$gate['allowed']) throw new InvalidArgumentException('rate_limited');
  }
  nister_rate_limit_hit('signup_ip',$ip,60,3600,900);
  nister_rate_limit_hit('signup_phone',$canonical!=='' ? $canonical : $phone,6,3600,900);
}

function registration_error_message(string $code): string {
  $messages=[
    'invalid_phone'=>'Enter a valid Ghana phone number, such as 0241234567.',
    'invalid_name'=>'Enter your full name, between 2 and 80 characters.',
    'password_must_be_6_to_128_characters'=>'Choose a password between 6 and 128 characters.',
    'invalid_location'=>'This site is unavailable. Please choose another site.',
    'account_exists'=>'An account already uses this number. Sign in with your existing password.',
    'otp_required'=>'Phone verification is required. Request a code and verify your number.',
    'otp_invalid_or_expired'=>'Your verification has expired. Request a new code and verify again.',
    'invalid_referral_code'=>'Check the referral code, or leave it blank.',
    'rate_limited'=>'Too many registration attempts. Please wait before trying again.',
    'csrf_invalid'=>'This form expired. Refresh the page and try again.',
  ];
  return $messages[$code] ?? 'Registration could not be completed. Please try again.';
}
