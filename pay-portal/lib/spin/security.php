<?php
declare(strict_types=1);
require_once __DIR__.'/math.php';

function spin_env(array $env, string $key, string $default = ''): string {
  return (string)($env[$key] ?? (getenv($key) !== false ? getenv($key) : $default));
}
function spin_is_manager(string $user, array $env): bool {
  return $user !== '' && in_array($user, array_filter(array_map('trim', explode(',', spin_env($env,'SPIN_GAME_MANAGERS')))), true);
}
function spin_launch_ready(array $env, int $now,?array $state=null): bool {
  $last=$state['last_admin_login']??null;
  $at=$last?strtotime($last.' UTC'):false;
  return spin_env($env,'SPIN_PAID_PLAY_ENABLED') === '1'
    && spin_env($env,'SPIN_OPERATIONS_APPROVED') === '1'
    && strlen(spin_env($env,'SPIN_AUDIT_KEY')) >= 32
    && $at!==false && $now-$at<(int)($state['threshold_seconds']??172800)
    && spin_is_manager((string)($state['last_admin_user']??''),$env);
}
function spin_request_key(mixed $v): string {
  if (!is_string($v) || !preg_match('/^[A-Za-z0-9_-]{16,64}$/D',$v)) throw new SpinError('invalid_request_key','A unique request key is required.',422);
  return $v;
}
function spin_rate_limit(PDO $db, string $bucket, int $limit, int $window, int $now): void {
  $key = hash('sha256',$bucket); $start = intdiv($now,$window)*$window;
  $db->beginTransaction();
  try {
    $db->prepare('INSERT IGNORE INTO spin_security_limits(bucket,window_start,hits) VALUES(?,?,0)')->execute([$key,$start]);
    $st=$db->prepare('SELECT window_start,hits FROM spin_security_limits WHERE bucket=? FOR UPDATE'); $st->execute([$key]); $row=$st->fetch();
    $hits=(int)$row['window_start']===$start ? (int)$row['hits']+1 : 1;
    $db->prepare('UPDATE spin_security_limits SET window_start=?,hits=? WHERE bucket=?')->execute([$start,$hits,$key]);
    $db->commit();
    if ($hits>$limit) throw new SpinError('rate_limited','Too many requests. Please wait before retrying.',429);
  } catch (Throwable $e) { if ($db->inTransaction()) $db->rollBack(); throw $e; }
}
