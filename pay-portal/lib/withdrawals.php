<?php
declare(strict_types=1);
require_once __DIR__.'/common.php';

final class WithdrawalError extends RuntimeException {
  public function __construct(public string $errorCode, string $message, public int $httpStatus=422) { parent::__construct($message); }
}

function withdrawal_text(array $input,string $key,string $default=''): string {
  $value=array_key_exists($key,$input)?$input[$key]:$default;
  if (!is_string($value)) throw new WithdrawalError('invalid_field','Supply valid text for '.$key.'.');
  return $value;
}

function withdrawal_amount(mixed $amount): int {
  if (!is_string($amount) || !preg_match('/^(\d{1,8})(?:\.(\d{1,2}))?$/D', trim($amount), $m)) {
    throw new WithdrawalError('invalid_amount','Enter an amount with up to two decimal places.');
  }
  $cents=(int)$m[1]*100+(int)str_pad($m[2]??'',2,'0');
  if ($cents<1 || $cents>2147483647) throw new WithdrawalError('invalid_amount','Enter a valid positive amount.');
  return $cents;
}

final class WalletWithdrawals {
  public const NOTE='Withdrawals are processed during working hours, within a maximum of 48 hours.';
  public const NETWORKS=['MTN'=>'MTN MoMo','TELECEL'=>'Telecel Cash','AT'=>'AT Money'];
  public function __construct(private PDO $db) {}
  private function exec(string $sql,array $args=[]): PDOStatement { $s=$this->db->prepare($sql);$s->execute($args);return $s; }
  private function one(string $sql,array $args=[]): ?array { return $this->exec($sql,$args)->fetch(PDO::FETCH_ASSOC)?:null; }
  private function tx(callable $fn): mixed {
    if ($this->db->inTransaction()) throw new LogicException('withdrawal_requires_own_transaction');
    for ($attempt=0;;$attempt++) {
      $this->db->beginTransaction();
      try {$result=$fn();$this->db->commit();return $result;}
      catch (Throwable $e) {
        if ($this->db->inTransaction()) $this->db->rollBack();
        if ($e instanceof PDOException && in_array((int)($e->errorInfo[1]??0),[1205,1213],true) && $attempt<2) continue;
        throw $e;
      }
    }
  }
  private function read(callable $fn): mixed {
    if ($this->db->inTransaction()) throw new LogicException('withdrawal_requires_own_transaction');
    // Keep wallet, held amount, history and queue totals on one committed snapshot.
    $this->db->exec('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    return $this->tx($fn);
  }
  private function account(string $user): string {
    if (!preg_match('/^233\d{9}$/D',$user)) throw new WithdrawalError('invalid_account','Use the phone number registered to your account.');
    return $user;
  }
  public function minimum(bool $lock=false): int {
    $row=$this->one("SELECT v FROM app_settings WHERE k='WITHDRAWAL_MIN_CENTS'".($lock?' FOR UPDATE':''));
    $value=$row['v']??'10000';
    if (!ctype_digit((string)$value) || (int)$value<1 || (int)$value>2147483647) throw new WithdrawalError('settings_unavailable','Withdrawals are temporarily unavailable.',503);
    return (int)$value;
  }
  public function enabled(): bool {
    $row=$this->one("SELECT v FROM app_settings WHERE k='WITHDRAWALS_ENABLED'");
    return ($row['v']??'1')==='1';
  }
  /** Follow the existing wallet / flight lock order; promotional grants stay in the wallet. */
  private function wallet(string $user,bool $lock=false): array {
    $exists=$this->one("SELECT 1 FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='wallet_promo_grants'")!==null;
    if ($lock && $exists) $this->exec("SELECT id FROM wallet_promo_grants WHERE msisdn=? AND status='active' AND remaining_cents>0 AND expires_at<=UTC_TIMESTAMP() ORDER BY expires_at,id FOR UPDATE",[$user])->fetchAll();
    $a=$this->one('SELECT balance_cents FROM accounts WHERE msisdn=?'.($lock?' FOR UPDATE':''),[$user]);
    if (!$a) throw new WithdrawalError('account_missing','Your wallet account is unavailable.',409);
    $promo=0;
    if ($exists) foreach ($this->exec("SELECT remaining_cents FROM wallet_promo_grants WHERE msisdn=? AND status='active'".($lock?' FOR UPDATE':''),[$user])->fetchAll(PDO::FETCH_ASSOC) as $g) $promo+=max(0,(int)$g['remaining_cents']);
    return ['balance_cents'=>(int)$a['balance_cents'],'available_cents'=>max(0,(int)$a['balance_cents']-$promo)];
  }
  private function event(?string $id,string $kind,string $actor,array $details): void {
    $this->exec('INSERT INTO wallet_withdrawal_events(withdrawal_id,event,actor,details_json,created_at) VALUES(?,?,?,?,UTC_TIMESTAMP(6))',[$id,$kind,$actor,json_encode($details,JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE)]);
  }
  private function row(string $id): array {
    return $this->one('SELECT * FROM wallet_withdrawals WHERE id=?',[$id])??throw new WithdrawalError('not_found','Withdrawal request not found.',404);
  }
  private function view(array $r): array {
    unset($r['request_hash'],$r['active_user']);$r['amount_cents']=(int)$r['amount_cents'];$r['account_number']='0'.substr($r['msisdn'],3);return $r;
  }
  public function snapshot(string $user): array {
    $user=$this->account($user);
    return $this->read(function()use($user){
      $wallet=$this->wallet($user);
      $wallet['held_cents']=(int)$this->exec("SELECT COALESCE(SUM(amount_cents),0) FROM wallet_withdrawals WHERE msisdn=? AND status IN ('pending','approved')",[$user])->fetchColumn();
      return ['enabled'=>$this->enabled(),'minimum_cents'=>$this->minimum(),'note'=>self::NOTE,'account_number'=>'0'.substr($user,3),'wallet'=>$wallet,
        'withdrawals'=>array_map([$this,'view'],$this->exec("SELECT w.* FROM wallet_withdrawals w WHERE w.msisdn=? AND NOT EXISTS (SELECT 1 FROM wallet_withdrawal_events e WHERE e.withdrawal_id=w.id AND e.event='account_purged') ORDER BY w.created_at DESC,w.id DESC LIMIT 30",[$user])->fetchAll(PDO::FETCH_ASSOC))];
    });
  }
  public function request(string $user,array $in): array {
    $user=$this->account($user);$phone=trim(withdrawal_text($in,'account_number'));
    if (!preg_match('/^(?:0\d{9}|\+?233\d{9})$/D',$phone) || normalize_msisdn($phone)!==$user) throw new WithdrawalError('account_mismatch','Withdrawals must go to your registered phone number.');
    if (!is_string($in['name']??null)) throw new WithdrawalError('invalid_name','Enter the MoMo account holder’s full name.');
    $name=trim($in['name']);
    if (strlen($name)>480 || preg_match('/[\p{C}]/u',$name)!==0 || preg_match('/^.{2,120}$/usD',$name)!==1 || !preg_match('/\p{L}/u',$name)) throw new WithdrawalError('invalid_name','Enter the MoMo account holder’s full name (2–120 characters).');
    $network=withdrawal_text($in,'network');if (!isset(self::NETWORKS[$network])) throw new WithdrawalError('invalid_network','Choose your MoMo network.');
    $amount=withdrawal_amount($in['amount']??null);$key=withdrawal_text($in,'request_key');
    if (!preg_match('/^[A-Za-z0-9_-]{16,64}$/D',$key)) throw new WithdrawalError('invalid_request','Reload the page and try again.');
    $hash=hash('sha256',json_encode([$user,$name,$network,$amount],JSON_THROW_ON_ERROR));$id='WDR-'.bin2hex(random_bytes(16));
    return $this->tx(function()use($user,$name,$network,$amount,$key,$hash,$id){
      $wallet=$this->wallet($user,true);
      $old=$this->one('SELECT * FROM wallet_withdrawals WHERE msisdn=? AND request_key=? FOR UPDATE',[$user,$key]);
      if ($old) {
        if ($this->one("SELECT 1 FROM wallet_withdrawal_events WHERE withdrawal_id=? AND event='account_purged'",[$old['id']])) throw new WithdrawalError('request_conflict','This request belongs to a previous account. Create a new withdrawal request.',409);
        if (!hash_equals($old['request_hash'],$hash)) throw new WithdrawalError('request_conflict','This request was already used for different details.',409);
        return $this->view($old);
      }
      if (!$this->enabled()) throw new WithdrawalError('withdrawals_paused','New withdrawals are temporarily unavailable. Existing requests remain in progress.',503);
      if ($this->one('SELECT id FROM wallet_withdrawals WHERE active_user=? FOR UPDATE',[$user])) throw new WithdrawalError('withdrawal_pending','You already have a withdrawal awaiting completion.',409);
      $minimum=$this->minimum(true);
      if ($amount<$minimum) throw new WithdrawalError('minimum_amount','The minimum withdrawal is GHS '.number_format($minimum/100,2,'.','').'.');
      if ($amount>$wallet['available_cents']) throw new WithdrawalError('insufficient_funds','Your withdrawable wallet balance is insufficient.',402);
      $this->exec("INSERT INTO wallet_withdrawals(id,msisdn,active_user,request_key,request_hash,amount_cents,recipient_name,network,status,created_at) VALUES(?,?,?,?,?,?,?,?,'pending',UTC_TIMESTAMP(6))",[$id,$user,$user,$key,$hash,$amount,$name,$network]);
      $this->exec('UPDATE accounts SET balance_cents=balance_cents-? WHERE msisdn=?',[$amount,$user]);
      $this->exec("INSERT INTO ledger(msisdn,type,amount_cents,ref,notes) VALUES(?,'withdrawal_hold',?,?,?)",[$user,-$amount,$id,'MoMo withdrawal held for manual payout']);
      $this->event($id,'requested',$user,['amount_cents'=>$amount,'network'=>$network]);
      return $this->view($this->row($id));
    });
  }
  public function configure(string $actor,mixed $amount): int {
    $minimum=withdrawal_amount($amount);
    return $this->tx(function()use($actor,$minimum){
      $before=$this->minimum(true);
      $this->exec("INSERT INTO app_settings(k,v) VALUES('WITHDRAWAL_MIN_CENTS',?) ON DUPLICATE KEY UPDATE v=VALUES(v)",[(string)$minimum]);
      if ($before!==$minimum) $this->event(null,'minimum_changed',$actor,['before_cents'=>$before,'minimum_cents'=>$minimum]);
      return $minimum;
    });
  }
  public function decide(string $actor,array $in): array {
    $id=withdrawal_text($in,'id');if (!preg_match('/^WDR-[a-f0-9]{32}$/D',$id)) throw new WithdrawalError('invalid_request','Select a withdrawal request.');
    $action=withdrawal_text($in,'action');if (!in_array($action,['approve','decline','paid'],true)) throw new WithdrawalError('invalid_action','Choose a valid action.');
    $initial=$this->row($id);$reason=trim(withdrawal_text($in,'reason'));$reference=strtoupper(trim(withdrawal_text($in,'payout_ref')));
    if ($action==='decline' && (preg_match('/^.{3,500}$/usD',$reason)!==1 || preg_match('/[\p{C}]/u',$reason)!==0)) throw new WithdrawalError('reason_required','Enter a decline reason (3–500 characters).');
    if ($action==='paid' && !preg_match('/^[A-Z0-9][A-Z0-9._:\/-]{2,79}$/D',$reference)) throw new WithdrawalError('reference_required','Enter the completed MoMo transaction reference (3–80 characters).');
    // Final receipts remain retryable even after the customer's account was deleted.
    if (($action==='approve' && in_array($initial['status'],['approved','paid'],true))
      || ($action==='decline' && $initial['status']==='declined')
      || ($action==='paid' && $initial['status']==='paid' && hash_equals((string)$initial['payout_ref'],$reference))) return $this->view($initial);
    try {return $this->tx(function()use($actor,$id,$initial,$action,$reason,$reference){
      $wallet=$this->wallet($initial['msisdn'],true);
      $row=$this->one('SELECT * FROM wallet_withdrawals WHERE id=? FOR UPDATE',[$id]);$state=$row['status'];$amount=(int)$row['amount_cents'];
      if ($action==='approve') {
        if (in_array($state,['approved','paid'],true)) return $this->view($row);
        if ($state!=='pending') throw new WithdrawalError('state_conflict','This request can no longer be approved.',409);
        $this->exec("UPDATE wallet_withdrawals SET status='approved',approved_by=?,approved_at=UTC_TIMESTAMP() WHERE id=?",[$actor,$id]);
        $this->event($id,'approved',$actor,['amount_cents'=>$amount]);
      } elseif ($action==='decline') {
        if ($state==='declined') return $this->view($row);
        if ($state!=='pending') throw new WithdrawalError('state_conflict','Only a pending request can be declined. An approved payout must be completed.',409);
        if ($wallet['balance_cents']>2147483647-$amount) throw new WithdrawalError('wallet_capacity','The refund cannot fit in this wallet yet. Funds remain held; retry after wallet capacity is available.',409);
        $this->exec('UPDATE accounts SET balance_cents=balance_cents+? WHERE msisdn=?',[$amount,$row['msisdn']]);
        $this->exec("INSERT INTO ledger(msisdn,type,amount_cents,ref,notes) VALUES(?,'withdrawal_refund',?,?,?)",[$row['msisdn'],$amount,$id.'-REFUND','Withdrawal declined: '.$reason]);
        $this->exec("UPDATE wallet_withdrawals SET status='declined',active_user=NULL,declined_by=?,declined_at=UTC_TIMESTAMP(),decline_reason=? WHERE id=?",[$actor,$reason,$id]);
        $this->event($id,'declined',$actor,['amount_cents'=>$amount,'reason'=>$reason]);
      } else {
        if ($state==='paid' && hash_equals((string)$row['payout_ref'],$reference)) return $this->view($row);
        if ($state!=='approved') throw new WithdrawalError('state_conflict','Approve the request before recording the completed manual payment.',409);
        $this->exec("UPDATE wallet_withdrawals SET status='paid',active_user=NULL,paid_by=?,paid_at=UTC_TIMESTAMP(),payout_ref=? WHERE id=?",[$actor,$reference,$id]);
        $this->event($id,'paid',$actor,['amount_cents'=>$amount,'payout_ref'=>$reference]);
      }
      return $this->view($this->row($id));
    });}catch(PDOException $e){
      if ($action==='paid' && (int)($e->errorInfo[1]??0)===1062) throw new WithdrawalError('reference_used','That MoMo transaction reference has already been recorded.',409);
      throw $e;
    }
  }
  public function queue(string $status,string $search,int $page): array {
    if (!in_array($status,['all','pending','approved','paid','declined'],true)) throw new WithdrawalError('invalid_status','Choose a valid status.');
    if ($page<0 || $page>10000 || strlen($search)>80) throw new WithdrawalError('invalid_search','Choose a valid search or page.');
    $where=[];$args=[];
    if ($status!=='all') {$where[]='status=?';$args[]=$status;}
    if ($search!=='') {
      if (preg_match('/^(?:0\d{9}|\+?233\d{9})$/D',$search)) {$where[]='msisdn=?';$args[]=normalize_msisdn($search);}
      else {$where[]='id=?';$args[]=$search;}
    }
    $filter=$where?' WHERE '.implode(' AND ',$where):'';
    return $this->read(function()use($filter,$args,$page){
      $rows=$this->exec('SELECT * FROM wallet_withdrawals'.$filter.' ORDER BY created_at DESC,id DESC LIMIT 50 OFFSET '.($page*50),$args)->fetchAll(PDO::FETCH_ASSOC);
      return ['minimum_cents'=>$this->minimum(),'rows'=>array_map([$this,'view'],$rows),'page'=>$page,'total'=>(int)$this->exec('SELECT COUNT(*) FROM wallet_withdrawals'.$filter,$args)->fetchColumn(),
        'held_cents'=>(int)$this->exec("SELECT COALESCE(SUM(amount_cents),0) FROM wallet_withdrawals WHERE status IN ('pending','approved')")->fetchColumn()];
    });
  }
}
