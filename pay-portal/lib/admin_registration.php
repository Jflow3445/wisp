<?php
declare(strict_types=1);
require_once __DIR__.'/account_access.php';

/** Atomic creation on the shared portal/RADIUS connection; no credit or paid access. */
function admin_register_account(PDO $db,array $input,array $location): array {
  $phone=trim((string)($input['phone'] ?? ''));
  if (!preg_match('/^\+?[0-9 ()-]+$/D',$phone)) throw new InvalidArgumentException('invalid_phone');
  $users=account_access_users($phone);
  if (count($users)!==2 || !preg_match('/^233\d{9}$/D',$users[0])) throw new InvalidArgumentException('invalid_phone');
  $name=trim((string)($input['name'] ?? '')); $password=(string)($input['password'] ?? '');
  if (strlen($name)<2 || strlen($name)>80 || preg_match('/[\x00-\x1f]/',$name)) throw new InvalidArgumentException('invalid_name');
  if (strlen($password)<6 || strlen($password)>128 || preg_match('/[\x00\r\n]/',$password)) throw new InvalidArgumentException('password_must_be_6_to_128_characters');
  if (empty($location['id']) || empty($location['active'])) throw new InvalidArgumentException('invalid_location');
  account_access_bootstrap($db);
  $db->beginTransaction();
  try {
    // Same canonical lock as purge/password changes serializes concurrent admin registrations.
    account_access_lock($db,$users[0]);
    $ph=implode(',',array_fill(0,count($users),'?'));
    foreach (['radcheck'=>'username','radreply'=>'username','radusergroup'=>'username','accounts'=>'msisdn'] as $table=>$field) {
      $st=$db->prepare("SELECT 1 FROM $table WHERE $field IN ($ph) LIMIT 1"); $st->execute($users);
      if ($st->fetchColumn()) throw new RuntimeException('account_exists');
    }
    $expiry=(new DateTimeImmutable('now',new DateTimeZone('UTC')))->modify('+3650 days')->setTime(23,59,59)->format('d M Y H:i:s');
    $insert=$db->prepare('INSERT INTO radcheck(username,attribute,op,value) VALUES (?,?,?,?)');
    foreach ($users as $user) {
      foreach (['Cleartext-Password'=>$password,'Expiration'=>$expiry,'Simultaneous-Use'=>'2'] as $attribute=>$value) $insert->execute([$user,$attribute,':=',$value]);
      $db->prepare("INSERT INTO radreply(username,attribute,op,value) VALUES (?,'Mikrotik-Address-List',':=','HS_NOPAID')")->execute([$user]);
      $db->prepare("INSERT INTO radusergroup(username,groupname,priority) VALUES (?,'HS_NOPAID',1)")->execute([$user]);
    }
    $db->prepare('INSERT INTO accounts(msisdn,balance_cents) VALUES (?,0)')->execute([$users[0]]);
    $parts=preg_split('/\s+/',$name,2);
    $db->prepare('INSERT INTO userinfo(username,firstname,lastname) VALUES (?,?,?)')->execute([$users[0],$parts[0],$parts[1] ?? '']);
    $db->prepare('INSERT INTO user_location_profiles(msisdn,location_id,signup_location_id,last_location_code) VALUES (?,?,?,?)')
      ->execute([$users[0],(int)$location['id'],(int)$location['id'],(string)$location['code']]);
    $db->commit();
  } catch (Throwable $e) { if ($db->inTransaction()) $db->rollBack(); throw $e; }
  return ['username'=>$users[1],'canonical'=>$users[0],'name'=>$name,'group'=>'HS_NOPAID','devices'=>2,'location'=>(string)$location['code']];
}
