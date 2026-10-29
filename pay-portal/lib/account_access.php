<?php
declare(strict_types=1);
require_once __DIR__.'/common.php';

function account_access_users(string $raw): array {
  $raw = trim($raw);
  if (preg_match('/^\+?[0-9 ()-]+$/D', $raw)) {
    $digits = preg_replace('/\D+/', '', $raw);
    if (strpos($digits, '00') === 0) $digits = substr($digits, 2);
    if (preg_match('/^(?:0[0-9]{9}|2330?[0-9]{9})$/D', $digits)) {
      $canonical = normalize_msisdn($digits);
      return [$canonical, '0'.substr($canonical, 3)];
    }
  }
  // Legacy/test RADIUS accounts can have names. Preserve their exact identity;
  // stripping non-digits could delete a different subscriber's account.
  if (!preg_match('/^[A-Za-z0-9][A-Za-z0-9_.@+-]{0,63}$/D', $raw)) throw new InvalidArgumentException('invalid_username');
  return [$raw];
}

function account_access_password_attributes(): array {
  return ['Cleartext-Password','Password','Crypt-Password','MD5-Password','SHA-Password',
    'SSHA-Password','SMD5-Password','NT-Password','LM-Password'];
}

function account_access_table_exists(PDO $pdo, string $table): bool {
  if ($pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'sqlite') {
    $st = $pdo->prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?");
  } else {
    $st = $pdo->prepare('SELECT 1 FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name=?');
  }
  $st->execute([$table]);
  return (bool)$st->fetchColumn();
}

function account_access_bootstrap(PDO $pdo): void {
  $pdo->exec("CREATE TABLE IF NOT EXISTS account_access_revocations (
    msisdn VARCHAR(64) PRIMARY KEY,
    revision BIGINT NOT NULL DEFAULT 0,
    pending INTEGER NOT NULL DEFAULT 0,
    reason VARCHAR(32) NOT NULL DEFAULT '',
    last_error VARCHAR(64) NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_attempt_at DATETIME NULL
  )" . ($pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql' ? ' ENGINE=InnoDB' : ''));
}

function account_access_lock(PDO $pdo, string $raw): int {
  if (!$pdo->inTransaction()) throw new LogicException('account_access_transaction_required');
  $user = account_access_users($raw)[0];
  $sql = $pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'sqlite'
    ? 'INSERT OR IGNORE INTO account_access_revocations(msisdn) VALUES (?)'
    : 'INSERT IGNORE INTO account_access_revocations(msisdn) VALUES (?)';
  $pdo->prepare($sql)->execute([$user]);
  return account_access_revision($pdo, $user, true);
}

function account_access_revision(PDO $pdo, string $raw, bool $lock=false): int {
  if (!account_access_table_exists($pdo, 'account_access_revocations')) return 0;
  $suffix = $lock && $pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql' ? ' FOR UPDATE' : '';
  $st = $pdo->prepare('SELECT revision FROM account_access_revocations WHERE msisdn=?'.$suffix);
  $st->execute([account_access_users($raw)[0]]);
  return (int)($st->fetchColumn() ?: 0);
}

function account_access_credentials_exist(PDO $pdo, string $raw): bool {
  $users = account_access_users($raw);
  $userPh = implode(',', array_fill(0, count($users), '?'));
  $attrs = account_access_password_attributes();
  $ph = implode(',', array_fill(0, count($attrs), '?'));
  $st = $pdo->prepare("SELECT 1 FROM radcheck WHERE username IN ($userPh) AND attribute IN ($ph) LIMIT 1");
  $st->execute(array_merge($users, $attrs));
  return (bool)$st->fetchColumn();
}

function account_access_session_valid(PDO $pdo, string $raw, int $revision): bool {
  return account_access_credentials_exist($pdo, $raw) && $revision === account_access_revision($pdo, $raw);
}

function account_access_record(PDO $pdo, string $raw, string $reason): int {
  account_access_lock($pdo, $raw);
  $pdo->prepare('UPDATE account_access_revocations SET revision=revision+1, pending=1, reason=?, last_error=NULL, updated_at=CURRENT_TIMESTAMP, last_attempt_at=NULL WHERE msisdn=?')
    ->execute([$reason, account_access_users($raw)[0]]);
  return account_access_revision($pdo, $raw);
}

/** Remove legacy password hashes as well as replacing both login aliases. */
function account_access_replace_password(PDO $pdo, string $raw, string $password): void {
  account_access_lock($pdo, $raw);
  if (!account_access_credentials_exist($pdo, $raw)) throw new RuntimeException('user_not_found');
  $users = account_access_users($raw);
  $userPh = implode(',', array_fill(0, count($users), '?'));
  $attrs = account_access_password_attributes();
  $ph = implode(',', array_fill(0, count($attrs), '?'));
  $pdo->prepare("DELETE FROM radcheck WHERE username IN ($userPh) AND attribute IN ($ph)")->execute(array_merge($users, $attrs));
  $insert = $pdo->prepare("INSERT INTO radcheck(username,attribute,op,value) VALUES (?, 'Cleartext-Password', ':=', ?)");
  foreach ($users as $user) $insert->execute([$user, $password]);
}

/** Use the already-authorized router account, never root or an application key. */
function account_access_run_router(array $users, array $env): array {
  $script = (string)($env['HOTSPOT_COOKIE_CLEAR_SCRIPT'] ?? '/usr/local/sbin/nister_clear_hotspot_cookies.sh');
  if (!is_executable($script)) return ['exit'=>1,'output'=>'missing_router_helper'];
  $sudo = is_executable('/usr/bin/sudo') ? '/usr/bin/sudo' : 'sudo';
  $cmd = array_merge([$sudo,'-n','-u','nister-router',$script], $users, ['--disconnect']);
  $process = @proc_open($cmd, [0=>['pipe','r'],1=>['pipe','w'],2=>['pipe','w']], $pipes, null, null, ['bypass_shell'=>true]);
  if (!is_resource($process)) return ['exit'=>1,'output'=>'router_helper_unavailable'];
  fclose($pipes[0]);
  $out = (string)stream_get_contents($pipes[1]); fclose($pipes[1]);
  $out .= (string)stream_get_contents($pipes[2]); fclose($pipes[2]);
  return ['exit'=>proc_close($process),'output'=>$out];
}

/** A committed request survives tunnel outages; concurrent generations serialize. */
function account_access_dispatch(PDO $pdo, string $raw, array $env=[], ?callable $runner=null): array {
  $user = account_access_users($raw)[0];
  if ($pdo->inTransaction()) throw new LogicException('dispatch_requires_committed_password');
  $pdo->beginTransaction();
  try {
    account_access_lock($pdo, $user);
    $st = $pdo->prepare('SELECT revision,pending,last_error FROM account_access_revocations WHERE msisdn=?');
    $st->execute([$user]); $row = $st->fetch(PDO::FETCH_ASSOC);
    if (empty($row['pending'])) { $pdo->commit(); return ['pending'=>false]; }
    if (($row['last_error'] ?? '') === 'router_auth_failed') { $pdo->commit(); return ['pending'=>true]; }
    $result = $runner ? $runner(account_access_users($user), $env) : account_access_run_router(account_access_users($user), $env);
    $output = (string)($result['output'] ?? '');
    $ok = ($result['exit'] ?? 1) === 0
      && preg_match('/(?m)^status=ok action=hotspot_session_revoke remaining=0(?:\s|$)/', $output) === 1;
    $error = $ok ? null : (preg_match('/Permission denied|Authentication failed|HOST IDENTIFICATION HAS CHANGED/i', $output)
      ? 'router_auth_failed' : (strpos($output, 'tunnel_unavailable') !== false ? 'tunnel_unavailable' : 'router_cleanup_failed'));
    $pdo->prepare('UPDATE account_access_revocations SET pending=?,last_error=?,last_attempt_at=CURRENT_TIMESTAMP WHERE msisdn=? AND revision=?')
      ->execute([$ok ? 0 : 1, $error, $user, (int)$row['revision']]);
    $pdo->commit();
    return ['pending'=>!$ok];
  } catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    // The password/purge is already committed; leave its durable request pending.
    error_log('[account_access] router revocation pending');
    return ['pending'=>true];
  }
}

function account_access_portal_exists(PDO $portal, PDO $radius, string $raw): bool {
  if (account_access_credentials_exist($radius, $raw)) return true;
  $users = account_access_users($raw);
  $userPh = implode(',', array_fill(0, count($users), '?'));
  foreach (['accounts','user_location_profiles'] as $table) {
    if (!account_access_table_exists($portal, $table)) continue;
    $st = $portal->prepare("SELECT 1 FROM $table WHERE msisdn IN ($userPh) LIMIT 1");
    $st->execute($users);
    if ($st->fetchColumn()) return true;
  }
  return false;
}

function account_access_purge(PDO $portal, PDO $radius, string $raw): array {
  $users = account_access_users($raw);
  $userPh = implode(',', array_fill(0, count($users), '?'));
  if ($portal !== $radius && $portal->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql'
      && $radius->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql') {
    $identity = 'SELECT CONCAT_WS(CHAR(58),@@hostname,@@port,DATABASE(),CURRENT_USER())';
    if ($portal->query($identity)->fetchColumn() === $radius->query($identity)->fetchColumn()) $radius = $portal;
  }
  $connections = $portal === $radius ? [$portal] : [$radius, $portal];
  foreach ($connections as $connection) {
    if ($connection->inTransaction()) throw new LogicException('purge_requires_own_transaction');
  }
  $deleted = ['radius'=>[], 'portal'=>[]];
  try {
    foreach ($connections as $connection) $connection->beginTransaction();
    if (account_access_table_exists($portal, 'accounts')) {
      $lock=$portal->prepare("SELECT msisdn FROM accounts WHERE msisdn IN ($userPh)".($portal->getAttribute(PDO::ATTR_DRIVER_NAME)==='mysql'?' FOR UPDATE':''));
      $lock->execute($users);$lock->fetchAll();
    }
    // Game receipts depend on the ordinary wallet ledger for reconciliation.
    // Deleting it would orphan accepted funds or invalidate completed receipts.
    foreach (['flight_rounds','spin_spins'] as $gameTable) {
      if (!account_access_table_exists($portal, $gameTable)) continue;
      $gameRecord=$portal->prepare("SELECT 1 FROM $gameTable WHERE msisdn IN ($userPh) LIMIT 1".($portal->getAttribute(PDO::ATTR_DRIVER_NAME)==='mysql'?' FOR UPDATE':''));
      $gameRecord->execute($users);
      if ($gameRecord->fetchColumn()) throw new RuntimeException('game_financial_history_prevents_purge');
    }
    if (account_access_table_exists($portal, 'wallet_withdrawals')) {
      // The account lock serializes with withdrawal holds and new game stakes.
      $pending = $portal->prepare("SELECT 1 FROM wallet_withdrawals WHERE msisdn IN ($userPh) AND status IN ('pending','approved') LIMIT 1");
      $pending->execute($users);
      if ($pending->fetchColumn()) throw new RuntimeException('withdrawal_pending_complete_before_purge');
      // Retain the administrative receipt but hide it from a later registration
      // using this phone number. The marker rolls back with any failed purge.
      $archive = $portal->prepare("INSERT INTO wallet_withdrawal_events(withdrawal_id,event,actor,details_json,created_at)
        SELECT w.id,'account_purged','account_purge',?,CURRENT_TIMESTAMP FROM wallet_withdrawals w
        WHERE w.msisdn IN ($userPh) AND NOT EXISTS
          (SELECT 1 FROM wallet_withdrawal_events e WHERE e.withdrawal_id=w.id AND e.event='account_purged')");
      $archive->execute(array_merge(['{"reason":"account_deleted"}'],$users));
    }
    account_access_record($radius, $raw, 'purge');
    $sets = [
      'radius' => [$radius, 'username', ['radcheck','radreply','radusergroup','radpostauth','radacct','radippool',
        'userinfo','userbillinfo','nister_wallet','nister_data_promos','nister_topup_log']],
      'portal' => [$portal, 'msisdn', ['signup_otp_sessions','signup_otp_challenges','auto_renew_settings',
        'wallet_promo_grants','payments','purchases','ledger','accounts','user_location_profiles']],
    ];
    foreach ($sets as $role => [$connection, $column, $tables]) {
      foreach ($tables as $table) {
        if (!account_access_table_exists($connection, $table)) continue;
        $st = $connection->prepare("DELETE FROM $table WHERE $column IN ($userPh)");
        $st->execute($users); $deleted[$role][$table] = $st->rowCount();
      }
    }
    foreach (['referral_rewards','referral_links','referral_profiles','admin_alerts'] as $table) {
      if (!account_access_table_exists($portal, $table)) continue;
      if ($table === 'referral_profiles') {
        $where = "msisdn IN ($userPh)"; $values = $users;
      } elseif ($table === 'admin_alerts') {
        $where = "username IN ($userPh)"; $values = $users;
      } else {
        $where = "referrer_msisdn IN ($userPh) OR referred_msisdn IN ($userPh)"; $values = array_merge($users, $users);
      }
      $st = $portal->prepare("DELETE FROM $table WHERE $where"); $st->execute($values);
      $deleted['portal'][$table] = $st->rowCount();
    }
    foreach ($sets as $role => [$connection, $column, $tables]) {
      foreach (array_keys($deleted[$role]) as $table) {
        if (!in_array($table, $tables, true)) continue;
        $st = $connection->prepare("SELECT COUNT(*) FROM $table WHERE $column IN ($userPh)"); $st->execute($users);
        if ((int)$st->fetchColumn() !== 0) throw new RuntimeException('purge_verification_failed');
      }
    }
    foreach ($connections as $connection) $connection->commit();
    return ['msisdn'=>$users[0], 'targets'=>$users, 'portal_ids'=>$users, 'deleted'=>$deleted];
  } catch (Throwable $e) {
    foreach ($connections as $connection) if ($connection->inTransaction()) $connection->rollBack();
    throw $e;
  }
}
