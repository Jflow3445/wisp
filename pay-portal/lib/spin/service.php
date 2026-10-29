<?php
declare(strict_types=1);
require_once __DIR__.'/math.php';
require_once __DIR__.'/security.php';
require_once __DIR__.'/flight.php';

/** All game writes serialize on spin_state(1). Existing cash operations serialize on accounts rows.
 * No external calls occur during a spin. The result and every financial entry commit together.
 */
final class SpinService {
  use FlightDomain;
  public const TERMS = '2026-10-27-flight-v3';
  public const CONSENT = 'I confirm I am at least 18 years old. Your stake leaves your available wallet at takeoff. The total return can rise or fall, up to 2x your stake, and can reach zero.'
    ."\n\n".'Stop & Collect secures the displayed return when the server accepts it. Otherwise the flight finishes automatically. Closing this page or losing connection does not pause it. The final return goes to your regular wallet.';
  public function __construct(private PDO $db, private array $env = []) {}
  private function one(string $sql, array $args=[]): ?array {
    $s=$this->db->prepare($sql); $s->execute($args); return $s->fetch(PDO::FETCH_ASSOC) ?: null;
  }
  public function rows(string $sql, array $args=[]): array {
    $s=$this->db->prepare($sql); $s->execute($args); return $s->fetchAll(PDO::FETCH_ASSOC);
  }
  private function exec(string $sql, array $args=[]): void { $this->db->prepare($sql)->execute($args); }
  public function now(): int {
    // Database time is authoritative across PHP instances. Tests set the DB session timestamp.
    return (int)$this->db->query('SELECT UNIX_TIMESTAMP()')->fetchColumn();
  }
  private function date(int $t): string { return gmdate('Y-m-d H:i:s',$t); }
  private function tx(callable $fn): mixed {
    for($attempt=0;;$attempt++) {
      $this->db->beginTransaction();
      try { $r=$fn(); $this->db->commit(); return $r; }
      catch(Throwable $e) {
        if($this->db->inTransaction()) $this->db->rollBack();
        if($e instanceof PDOException && in_array((int)($e->errorInfo[1]??0),[1205,1213],true) && $attempt<2) { usleep(random_int(10000,30000)); continue; }
        throw $e;
      }
    }
  }
  private function lock(): array {
    $s=$this->one('SELECT * FROM spin_state WHERE id=1 FOR UPDATE');
    if(!$s) throw new SpinError('not_installed','The game migration has not been installed.',503);
    return $s;
  }
  private function audit(string $actor, string $event, array $payload, int $now): void {
    $key=spin_env($this->env,'SPIN_AUDIT_KEY');
    if(strlen($key)<32) throw new SpinError('audit_unavailable','The game audit key has not been provisioned.',503);
    $head=(string)$this->one('SELECT audit_head FROM spin_state WHERE id=1')['audit_head'];
    $json=json_encode($payload,JSON_THROW_ON_ERROR|JSON_UNESCAPED_SLASHES);
    $at=$this->date($now); $hash=hash_hmac('sha256',json_encode([$head,$actor,$event,$json,$at],JSON_THROW_ON_ERROR),$key);
    $this->exec('INSERT INTO spin_audit(actor,event,payload,previous_hash,event_hash,created_at) VALUES(?,?,?,?,?,?)',[$actor,$event,$json,$head,$hash,$at]);
    $this->exec('UPDATE spin_state SET audit_head=? WHERE id=1',[$hash]);
  }
  private function transition(array $s, string $next, string $actor, string $reason, int $now, bool $automatic=false): array {
    if($s['state']===$next) return $s;
    $restore=$next==='GHOSTED' ? $s['state'] : $s['restore_state'];
    $this->exec('UPDATE spin_state SET state=?,restore_state=? WHERE id=1',[$next,$restore]);
    $this->audit($actor,$automatic?'automatic_ghost':($next==='GHOSTED'?'manual_ghost':($s['state']==='GHOSTED'?'restore':'state_change')),
      ['previous'=>$s['state'],'next'=>$next,'reason'=>$reason,'config_id'=>(int)$s['config_id']],$now);
    $s['state']=$next; $s['restore_state']=$restore; return $s;
  }
  private function enforce(array $s, int $now): array {
    $base=strtotime(($s['last_admin_login'] ?: $s['created_at']).' UTC');
    if($now-$base >= (int)$s['threshold_seconds'] && $s['state']!=='GHOSTED') {
      $s=$this->transition($s,'GHOSTED','watchdog','Qualifying administrator login inactivity threshold elapsed.',$now,true);
    }
    return $s;
  }
  public function watchdog(): array {
    return $this->tx(function(){
      $now=$this->now(); $s=$this->enforce($this->lock(),$now);
      $this->exec('UPDATE spin_state SET last_watchdog_at=? WHERE id=1',[$this->date($now)]);
      $s['last_watchdog_at']=$this->date($now); return $s;
    });
  }
  public function interactiveLogin(string $actor): void {
    if(!spin_is_manager($actor,$this->env)) return;
    $this->tx(function() use($actor){
      $now=$this->now(); $this->enforce($this->lock(),$now);
      $this->exec('UPDATE spin_state SET last_admin_login=?,last_admin_user=? WHERE id=1',[$this->date($now),$actor]);
      $this->audit($actor,'interactive_login',['source'=>'successful_password_login'],$now);
    });
  }
  /** Reuse the original authentication timestamp from an existing trusted WISP admin session. */
  public function recognizeAdminSession(string $actor,int $authenticatedAt): void {
    if(!spin_is_manager($actor,$this->env) || $authenticatedAt<=0)return;
    $this->tx(function()use($actor,$authenticatedAt){
      $now=$this->now();if($authenticatedAt>$now+5)return;
      $s=$this->enforce($this->lock(),$now);
      $last=$s['last_admin_login']?strtotime($s['last_admin_login'].' UTC'):0;
      if($authenticatedAt<=$last)return;
      $this->exec('UPDATE spin_state SET last_admin_login=?,last_admin_user=? WHERE id=1',[$this->date($authenticatedAt),$actor]);
      $this->audit($actor,'interactive_login',['source'=>'existing_admin_session','authenticated_at'=>$this->date($authenticatedAt)],$now);
    });
  }
  public function upgradeWalletExperience(): void {
    $this->tx(function(){
      $s=$this->lock();if((int)$s['wallet_experience_version']>=2) return;
      $now=$this->now();$rules=$this->config($s);
      $rules['daily_stake_cents']=0;$rules['daily_loss_cents']=0;$rules['interval_seconds']=0;
      $json=json_encode($rules,JSON_THROW_ON_ERROR|JSON_UNESCAPED_SLASHES);
      $reason='Wallet payouts, minimum-only stake controls and one-time customer confirmation.';
      $this->exec('INSERT INTO spin_configs(rules_json,rules_hash,created_by,reason,created_at) VALUES(?,?,?,?,?)',[$json,hash('sha256',$json),'migration',$reason,$this->date($now)]);
      $id=(int)$this->db->lastInsertId();
      $this->exec('UPDATE spin_state SET config_id=?,wallet_experience_version=2 WHERE id=1',[$id]);
      $this->audit('migration','rules_changed',['previous_config_id'=>(int)$s['config_id'],'config_id'=>$id,'rules'=>$rules,'reason'=>$reason],$now);
      $this->audit('migration','wallet_experience_upgraded',['version'=>2,'reason'=>$reason],$now);
    });
  }
  /** Preserve previously awarded credits with an atomic, signed transfer to the ordinary wallet. */
  public function consolidateCredits(string $user): int {
    if($this->creditBalance($user)===0) return 0;
    return $this->tx(function()use($user){
      $s=$this->lock();if((int)($s['wallet_experience_version']??0)<2) return 0;
      $amount=$this->creditBalance($user);if($amount===0) return 0;
      $this->exec('INSERT IGNORE INTO accounts(msisdn,balance_cents) VALUES(?,0)',[$user]);
      $cash=$this->cash($user,true);
      if($cash['balance_cents']+$amount>SpinMath::MAX_WALLET) throw new SpinError('wallet_capacity','Contact support to move your remaining credits to your wallet.',409);
      $now=$this->now();$ref='MERGE-'.bin2hex(random_bytes(16));
      $this->credit($user,-$amount,$ref,'wallet_transfer','Transferred to your regular wallet',$now);
      $this->exec('INSERT INTO ledger(msisdn,type,amount_cents,ref,notes) VALUES(?,?,?,?,?)',[$user,'spin_credit_transfer',$amount,$ref,'Previous Spin & Win credits moved to your wallet']);
      $this->exec('UPDATE accounts SET balance_cents=balance_cents+? WHERE msisdn=?',[$amount,$user]);
      $this->journal($ref,'wallet_transfer',$user,['network_credit_liability'=>-$amount,'customer_cash_liability'=>$amount],$now);
      $this->audit($user,'credits_transferred',['ref'=>$ref,'msisdn'=>$user,'amount_cents'=>$amount,'cash_after_cents'=>$cash['balance_cents']+$amount],$now);
      return $amount;
    });
  }
  private function config(array $s): array {
    $c=$this->one('SELECT * FROM spin_configs WHERE id=?',[$s['config_id']]);
    if(!$c || !hash_equals($c['rules_hash'],hash('sha256',$c['rules_json']))) throw new SpinError('config_integrity','Game configuration integrity check failed.',503);
    return SpinMath::rules(json_decode($c['rules_json'],true,512,JSON_THROW_ON_ERROR));
  }
  public function availability(): array {
    // Commit an overdue ghost transition BEFORE returning an error to a caller.
    return $this->tx(function(){ $now=$this->now(); $s=$this->enforce($this->lock(),$now);
      $reason=null; try{$this->playable($s,$now);}catch(SpinError $e){$reason=$e->getMessage();}
      return ['state'=>$s['state'],'visible'=>$s['state']!=='GHOSTED' && spin_launch_ready($this->env,$now,$s),
        'can_play'=>$reason===null,'unavailable_reason'=>$reason,
        'launch_ready'=>spin_launch_ready($this->env,$now,$s),'config_id'=>(int)$s['config_id']]; });
  }
  private function playable(array $s, int $now): void {
    if($s['state']==='GHOSTED') throw new SpinError('unavailable','This page is unavailable.',404);
    if($s['state']!=='ACTIVE') throw new SpinError('paused','New flights are temporarily paused. Your wallet remains available.');
    if((int)($s['wallet_experience_version']??0)<2) throw new SpinError('upgrade_required','The game is being updated. Please try again shortly.',503);
    if(array_key_exists('flight_config_id',$s) && empty($s['flight_config_id'])) throw new SpinError('upgrade_required','Flight is being installed. Please try again shortly.',503);
    if(!$s['last_admin_login'] || $now-strtotime($s['last_admin_login'].' UTC') >= (int)$s['threshold_seconds']) throw new SpinError('administrator_inactive','Gameplay requires an active game administrator.',403);
    if(!spin_launch_ready($this->env,$now,$s)) throw new SpinError('launch_disabled','Paid play requires an authorised game administrator and operational readiness.',403);
    if(!$s['last_watchdog_at'] || $now-strtotime($s['last_watchdog_at'].' UTC')>180) throw new SpinError('watchdog_unhealthy','Gameplay is paused while the background watchdog is unavailable.',503);
    if(empty($s['reconcile_ok']) || !$s['last_reconcile_at'] || $now-strtotime($s['last_reconcile_at'].' UTC')>1800) throw new SpinError('reconciliation_unhealthy','Gameplay is unavailable until financial reconciliation is healthy.',503);
    $storage=$this->rows("SELECT table_name,engine FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name IN ('accounts','ledger')");
    if(count($storage)!==2 || array_filter($storage,fn($t)=>strtolower((string)$t['engine'])!=='innodb')) throw new SpinError('wallet_storage','Atomic wagering requires InnoDB monetary-wallet tables.',503);
  }
  private function player(string $user, bool $create=false): array {
    if($create) $this->exec('INSERT IGNORE INTO spin_players(msisdn) VALUES(?)',[$user]);
    return $this->one('SELECT * FROM spin_players WHERE msisdn=?',[$user]) ?: ['msisdn'=>$user];
  }
  private function eligible(string $user, array $r, int $now, int $stake=0): array {
    $p=$this->player($user);
    $adult=gmdate('Y-m-d',strtotime('-18 years',$now));
    // Existing WISP authentication identifies the customer; this row only stores game preferences.
    // Known underage customers remain blocked. Other customers confirm 18+ in the one-time consent.
    if(!empty($p['birth_date']) && $p['birth_date']>$adult) throw new SpinError('identity_required','Flight is available to adults aged 18 and over.',403);
    if(!empty($p['restricted'])) throw new SpinError('restricted','Game access is restricted. Contact support with your receipt reference.',403);
    if(!empty($p['excluded_until']) && strtotime($p['excluded_until'].' UTC')>$now) throw new SpinError('self_excluded','Your self-exclusion is active. Your wallet and internet services remain available.',403);
    if(($p['terms_version']??'')!==self::TERMS || !$this->one('SELECT 1 accepted FROM spin_consents WHERE msisdn=? AND version=?',[$user,self::TERMS])) throw new SpinError('terms_required','Confirm the game rules once to start playing.',403);
    if($stake>0) {
      if($stake<$r['min_stake_cents']) throw new SpinError('stake_limit','The minimum stake is GHS '.number_format($r['min_stake_cents']/100,2,'.','').'.',422);
      $day=$this->date(intdiv($now,86400)*86400);
      $sum=$this->one("SELECT COALESCE(SUM(stake_cents),0) stakes,COALESCE(SUM(CASE WHEN outcome='loss' THEN stake_cents ELSE 0 END),0) losses,MAX(created_at) latest FROM spin_spins WHERE msisdn=? AND created_at>=?",[$user,$day]);
      $flights=$this->one("SELECT COALESCE(SUM(stake_cents),0) stakes,COALESCE(SUM(CASE WHEN status='SETTLED' THEN GREATEST(0,stake_cents-payout_cents) ELSE stake_cents END),0) losses,MAX(created_at) latest FROM flight_rounds WHERE msisdn=? AND created_at>=?",[$user,$day]);
      $sum['stakes']=(int)$sum['stakes']+(int)$flights['stakes'];$sum['losses']=(int)$sum['losses']+(int)$flights['losses'];$sum['latest']=max($sum['latest']??'',$flights['latest']??'')?:null;
      $stakeLimits=array_filter([$r['daily_stake_cents'],(int)($p['daily_stake_cents']??0)],fn($v)=>$v>0);
      $lossLimits=array_filter([$r['daily_loss_cents'],(int)($p['daily_loss_cents']??0)],fn($v)=>$v>0);
      if(($stakeLimits && (int)$sum['stakes']+$stake>min($stakeLimits)) || ($lossLimits && (int)$sum['losses']+$stake>min($lossLimits))) throw new SpinError('daily_limit','This stake exceeds an account limit. Contact support if you need help.',403);
      if($sum['latest'] && $now-strtotime($sum['latest'].' UTC')<$r['interval_seconds']) throw new SpinError('cooldown','Please take a moment before your next spin.',429);
    }
    return $p;
  }
  /** Existing accounts include promotional grants. Those grants never fund wagering. */
  private function cash(string $user, bool $lock=false): array {
    $promo=0;
    $exists=$this->one("SELECT 1 present FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='wallet_promo_grants'");
    // Match the established wallet expiration lock order before locking its account.
    if($lock && $exists) $this->rows("SELECT id FROM wallet_promo_grants WHERE msisdn=? AND status='active' AND remaining_cents>0 AND expires_at<=UTC_TIMESTAMP() ORDER BY expires_at,id FOR UPDATE",[$user]);
    $a=$this->one('SELECT balance_cents FROM accounts WHERE msisdn=?'.($lock?' FOR UPDATE':''),[$user]);
    if($exists) {
      $grants=$this->rows("SELECT remaining_cents FROM wallet_promo_grants WHERE msisdn=? AND status='active'".($lock?' FOR UPDATE':''),[$user]);
      foreach($grants as $g) $promo+=(int)$g['remaining_cents'];
    }
    $balance=(int)($a['balance_cents']??0);
    return ['balance_cents'=>$balance,'stakeable_cents'=>max(0,$balance-$promo)];
  }
  public function creditBalance(string $user): int {
    $a=$this->one('SELECT balance_cents FROM spin_credit_accounts WHERE msisdn=?',[$user]);
    return (int)($a['balance_cents']??0);
  }
  public function creditSummary(string $user): array {
    return ['balance_cents'=>$this->creditBalance($user),'entries'=>$this->rows('SELECT ref,kind,amount_cents,notes,created_at FROM spin_credit_entries WHERE msisdn=? ORDER BY id DESC LIMIT 5',[$user])];
  }
  public function credits(string $user, int $page=0): array {
    $offset=max(0,min(100000,$page))*100;
    return ['balance_cents'=>$this->creditBalance($user),
      'entries'=>$this->rows("SELECT ref,kind,amount_cents,balance_after_cents,notes,created_at FROM spin_credit_entries WHERE msisdn=? ORDER BY id DESC LIMIT 100 OFFSET $offset",[$user]),
      'spins'=>$this->rows("SELECT * FROM spin_spins WHERE msisdn=? ORDER BY created_at DESC,id DESC LIMIT 100 OFFSET $offset",[$user]),
      'redemptions'=>$this->rows("SELECT * FROM spin_redemptions WHERE msisdn=? ORDER BY created_at DESC,id DESC LIMIT 100 OFFSET $offset",[$user])];
  }
  public function snapshot(string $user): array {
    $this->consolidateCredits($user);
    $a=$this->availability(); $active=$this->activeFlight($user);
    if(!$a['visible'] && !$active) throw new SpinError('unavailable','This page is unavailable.',404);
    $s=$this->one('SELECT * FROM spin_state WHERE id=1'); $r=$this->flightRules($s); $now=$this->now(); $eligibility=null;
    try {$this->eligible($user,$r,$now);}catch(SpinError $e){$eligibility=['code'=>$e->errorCode,'message'=>$e->getMessage()];}
    return ['availability'=>array_intersect_key($a,array_flip(['state','visible','can_play'])),'rules'=>['min_stake_cents'=>$r['min_stake_cents']],'wallet'=>$this->cash($user),
      'eligibility'=>$eligibility,
      'account'=>['number'=>'0'.substr($user,3),'signed_in'=>true],
      'consent_accepted'=>($this->player($user)['terms_version']??'')===self::TERMS && (bool)$this->one('SELECT 1 accepted FROM spin_consents WHERE msisdn=? AND version=?',[$user,self::TERMS]),
      'active_flight'=>$active,
      'history'=>$this->rows("SELECT id,stake_cents,payout_cents,cash_after_cents,end_reason,settled_at FROM flight_rounds WHERE msisdn=? AND status='SETTLED' ORDER BY settled_at DESC,id DESC LIMIT 10",[$user])];
  }
  public function quote(string $user, int $stake): array {
    $this->availability();
    return $this->tx(function()use($user,$stake){
      $s=$this->lock(); $now=$this->now(); $this->playable($s,$now); $r=$this->config($s); $this->eligible($user,$r,$now,$stake);
      $cash=$this->cash($user);
      if($cash['stakeable_cents']<$stake) throw new SpinError('insufficient_funds','Your wallet has insufficient funds for this stake.',402);
      $q=SpinMath::expectation($stake,(int)$s['pool_cents'],$r);
      if($cash['balance_cents']+$q['max_bonus_cents']>SpinMath::MAX_WALLET) throw new SpinError('wallet_capacity','Your wallet cannot hold the possible winnings for this stake.',422);
      $q+=['id'=>bin2hex(random_bytes(16)),'stake_cents'=>$stake,'config_id'=>(int)$s['config_id'],
        'win_bps'=>$r['win_bps'],'loss_bps'=>10000-$r['win_bps'],'expires_at'=>$this->date($now+120)];
      $this->exec('INSERT INTO spin_quotes(id,msisdn,stake_cents,config_id,pool_revision,quote_json,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?)',
        [$q['id'],$user,$stake,$s['config_id'],$s['pool_revision'],json_encode($q,JSON_THROW_ON_ERROR),$q['expires_at'],$this->date($now)]);
      return $q;
    });
  }
  private function journal(string $ref, string $kind, ?string $user, array $postings, int $now): void {
    if(array_sum($postings)!==0) throw new LogicException('Unbalanced game journal');
    $this->exec('INSERT INTO spin_journals(ref,kind,msisdn,created_at) VALUES(?,?,?,?)',[$ref,$kind,$user,$this->date($now)]);
    foreach($postings as $account=>$amount) if($amount!==0) $this->exec('INSERT INTO spin_postings(journal_ref,account,amount_cents) VALUES(?,?,?)',[$ref,$account,$amount]);
  }
  private function credit(string $user, int $delta, string $ref, string $kind, string $notes, int $now): int {
    $this->exec('INSERT IGNORE INTO spin_credit_accounts(msisdn,balance_cents) VALUES(?,0)',[$user]);
    $balance=(int)$this->one('SELECT balance_cents FROM spin_credit_accounts WHERE msisdn=? FOR UPDATE',[$user])['balance_cents'];
    $next=$balance+$delta;
    if($next<0 || $next>SpinMath::MAX_MONEY) throw new SpinError('credit_balance','Network-credit balance is insufficient or outside operational limits.',402);
    $this->exec('INSERT INTO spin_credit_entries(msisdn,ref,kind,amount_cents,balance_after_cents,notes,created_at) VALUES(?,?,?,?,?,?,?)',[$user,$ref,$kind,$delta,$next,$notes,$this->date($now)]);
    $this->exec('UPDATE spin_credit_accounts SET balance_cents=? WHERE msisdn=?',[$next,$user]); return $next;
  }
  private function pool(array $s, int $delta, string $ref, string $kind, string $actor, string $reason, int $now): int {
    $next=(int)$s['pool_cents']+$delta;
    if($next<0 || $next>SpinMath::MAX_MONEY) throw new SpinError('pool_balance','Pool adjustment exceeds the available balance or operational range.',422);
    if(array_key_exists('flight_config_id',$s) && $s['flight_config_id']!==null)$this->protectFlightPool($next);
    $this->exec('INSERT INTO spin_pool_movements(ref,kind,amount_cents,balance_after_cents,actor,reason,created_at) VALUES(?,?,?,?,?,?,?)',[$ref,$kind,$delta,$next,$actor,$reason,$this->date($now)]);
    $this->exec('UPDATE spin_state SET pool_cents=?,pool_revision=pool_revision+1 WHERE id=1',[$next]); return $next;
  }
  public function receipt(string $user, string $key): ?array {
    return $this->one('SELECT * FROM spin_spins WHERE msisdn=? AND request_key=?',[$user,$key]);
  }
  public function spin(string $user, string $quoteId, string $key): array {
    spin_request_key($key);
    if(!preg_match('/^[a-f0-9]{32}$/D',$quoteId)) throw new SpinError('invalid_quote','Review a stake before spinning.',422);
    $this->availability();
    return $this->tx(function()use($user,$quoteId,$key){
      $s=$this->lock(); $now=$this->now();
      $old=$this->receipt($user,$key);
      if($old) { if($old['quote_id']!==$quoteId) throw new SpinError('idempotency_conflict','This request key belongs to another stake.'); return $old; }
      $this->playable($s,$now);
      $q=$this->one('SELECT * FROM spin_quotes WHERE id=? AND msisdn=?',[$quoteId,$user]);
      if(!$q || strtotime($q['expires_at'].' UTC')<=$now || (int)$q['config_id']!==(int)$s['config_id'] || (int)$q['pool_revision']!==(int)$s['pool_revision']) throw new SpinError('quote_expired','The pool or rules changed. Review the updated returns before confirming again.');
      if($this->one('SELECT id FROM spin_spins WHERE quote_id=?',[$quoteId])) throw new SpinError('quote_used','This reviewed stake has already been settled. Open your receipts.');
      $r=$this->config($s); $stake=(int)$q['stake_cents']; $this->eligible($user,$r,$now,$stake);
      $expect=SpinMath::expectation($stake,(int)$s['pool_cents'],$r);
      $cash=$this->cash($user,true);
      if($cash['stakeable_cents']<$stake) throw new SpinError('insufficient_funds','The monetary wallet no longer has enough available funds.',402);
      $draw=SpinMath::draw($r); $win=$draw['outcome']==='win';
      $bonus=$win?SpinMath::bonus($stake,(int)$s['pool_cents'],$draw['bonus_pct'],$r):0;
      $id=bin2hex(random_bytes(16)); $ref='SPIN-'.$id; $payout=$win?$stake+$bonus:0;
      $cashAfter=$cash['balance_cents']-$stake+$payout;
      if($cashAfter>SpinMath::MAX_WALLET) throw new SpinError('wallet_capacity','Your wallet cannot hold these winnings.',422);
      $this->exec('INSERT INTO ledger(msisdn,type,amount_cents,ref,notes) VALUES(?,?,?,?,?)',[$user,'spin_stake',-$stake,$ref,'Spin & Win stake']);
      $this->exec('UPDATE accounts SET balance_cents=balance_cents-? WHERE msisdn=?',[$stake,$user]);
      if($payout>0) {
        $this->exec('INSERT INTO ledger(msisdn,type,amount_cents,ref,notes) VALUES(?,?,?,?,?)',[$user,'spin_win',$payout,$ref.'-WIN','Spin & Win winnings, including your stake']);
        $this->exec('UPDATE accounts SET balance_cents=balance_cents+? WHERE msisdn=?',[$payout,$user]);
      }
      $creditAfter=$this->creditBalance($user);
      $poolAfter=$this->pool($s,$win?-$bonus:$stake,$ref,$win?'win_bonus':'lost_stake','settlement',$win?'Funded winning bonus':'Forfeited monetary stake',$now);
      $postings=['customer_cash_liability'=>-$stake+$payout,'forfeited_stakes'=>$win?0:$stake,'bonus_funding'=>-$bonus];
      $this->journal($ref,'spin',$user,$postings,$now);
      $configHash=$this->one('SELECT rules_hash FROM spin_configs WHERE id=?',[$s['config_id']])['rules_hash'];
      $this->exec("INSERT INTO spin_spins(id,msisdn,request_key,quote_id,config_id,outcome,config_hash,stake_cents,bonus_pct,bonus_cents,credit_cents,pool_before_cents,pool_after_cents,cash_after_cents,credit_after_cents,expected_rtp_pct,created_at,payout_wallet) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'monetary')",
        [$id,$user,$key,$quoteId,$s['config_id'],$draw['outcome'],$configHash,$stake,$draw['bonus_pct'],$bonus,$payout,$s['pool_cents'],$poolAfter,$cashAfter,$creditAfter,$expect['rtp_pct'],$this->date($now)]);
      $receipt=$this->receipt($user,$key); $this->audit('settlement','spin_settled',$receipt,$now); return $receipt;
    });
  }
  public function preferences(string $user, array $in): array {
    return $this->tx(function()use($user,$in){
      $s=$this->lock(); $now=$this->now(); $p=$this->player($user,true); $r=$this->config($s);
      if(($in['accept_terms']??false)===true) {
        $accepted=$this->one('SELECT 1 accepted FROM spin_consents WHERE msisdn=? AND version=?',[$user,self::TERMS]);
        if(!$accepted) {
          $this->exec('INSERT INTO spin_consents(msisdn,version,consent_text,text_hash,accepted_at) VALUES(?,?,?,?,?)',[$user,self::TERMS,self::CONSENT,hash('sha256',self::CONSENT),$this->date($now)]);
          $this->exec('UPDATE spin_players SET terms_version=?,terms_at=? WHERE msisdn=?',[self::TERMS,$this->date($now),$user]);
          $this->audit($user,'game_consent_accepted',['version'=>self::TERMS,'text'=>self::CONSENT,'accepted_at'=>$this->date($now)],$now);
        }
        elseif(($p['terms_version']??'')!==self::TERMS) $this->exec('UPDATE spin_players SET terms_version=? WHERE msisdn=?',[self::TERMS,$user]);
        if(count(array_diff(array_keys($in),['action','accept_terms']))===0) return $this->player($user);
      }
      if(isset($in['exclude_days'])) {
        if(!in_array($in['exclude_days'],[1,7,30,365],true)) throw new SpinError('invalid_input','Choose 1, 7, 30 or 365 days.',422);
        $until=$this->date(max($now+$in['exclude_days']*86400,strtotime(($p['excluded_until']??'1970-01-01').' UTC')));
        $this->exec('UPDATE spin_players SET excluded_until=? WHERE msisdn=?',[$until,$user]);
      }
      foreach(['daily_stake_cents','daily_loss_cents'] as $field) if(isset($in[$field])) {
        $limits=array_filter([$r[$field],(int)($p[$field]??0)],fn($v)=>$v>0);
        $value=SpinMath::integer($in[$field],1,$limits?min($limits):SpinMath::MAX_WALLET,$field);
        $this->exec("UPDATE spin_players SET $field=? WHERE msisdn=?",[$value,$user]);
      }
      $this->audit($user,'player_preferences',['before'=>$p,'after'=>$this->player($user)],$now);
      return $this->player($user);
    });
  }
  /** Admin mutation envelope: existing admin permission, persistent idempotency, reason and HMAC audit. */
  public function admin(string $actor, array $in): array {
    if(!spin_is_manager($actor,$this->env)) throw new SpinError('forbidden','Game manager permission is required.',403);
    $key=spin_request_key($in['request_key']??null); $reason=trim((string)($in['reason']??''));
    if(strlen($reason)<8 || strlen($reason)>500) throw new SpinError('reason_required','Give a reason between 8 and 500 characters.',422);
    $body=$in; unset($body['mfa'],$body['_csrf']); $fingerprint=hash('sha256',json_encode($body,JSON_THROW_ON_ERROR));
    $this->availability();
    return $this->tx(function()use($actor,$in,$key,$reason,$fingerprint){
      $s=$this->lock(); $now=$this->now();
      $old=$this->one('SELECT * FROM spin_admin_requests WHERE actor=? AND request_key=?',[$actor,$key]);
      if($old) { if(!hash_equals($old['fingerprint'],$fingerprint)) throw new SpinError('idempotency_conflict','Request key was already used for another change.'); return json_decode($old['result_json'],true,512,JSON_THROW_ON_ERROR); }
      $action=(string)($in['action']??''); $ref='ADJ-'.bin2hex(random_bytes(16)); $result=['ref'=>$ref];
      switch($action) {
        case 'flight_rules':
          if(!is_array($in['rules']??null))throw new SpinError('invalid_rules','Supply flight rules.',422);
          $result['config_id']=$this->saveFlightRules($actor,$in['rules'],$reason,$now);break;
        case 'state':
          $next=(string)($in['state']??'');
          if(!in_array($next,['ACTIVE','PAUSED','GHOSTED','RESTORE'],true)) throw new SpinError('invalid_state','Invalid operational state.',422);
          if($s['state']==='GHOSTED' && $next!=='RESTORE' && $next!=='GHOSTED') throw new SpinError('restore_required','Use the explicit Restore Game operation.');
          if($next==='RESTORE') {
            if($s['state']!=='GHOSTED') throw new SpinError('not_ghosted','The game is not ghosted.');
            if(!spin_launch_ready($this->env,$now,$s)) throw new SpinError('launch_disabled','A game manager must log in before restoring play.',403);
            $next=$s['restore_state'];
          }
          if($next==='ACTIVE') $this->playable(array_merge($s,['state'=>'ACTIVE']),$now);
          $this->transition($s,$next,$actor,$reason,$now); $result['state']=$next; break;
        case 'rules':
          $r=SpinMath::rules($in['rules']??[]); $json=json_encode($r,JSON_THROW_ON_ERROR|JSON_UNESCAPED_SLASHES);
          $this->exec('INSERT INTO spin_configs(rules_json,rules_hash,created_by,reason,created_at) VALUES(?,?,?,?,?)',[$json,hash('sha256',$json),$actor,$reason,$this->date($now)]);
          $id=(int)$this->db->lastInsertId(); $this->exec('UPDATE spin_state SET config_id=? WHERE id=1',[$id]);
          $this->audit($actor,'rules_changed',['previous_config_id'=>(int)$s['config_id'],'config_id'=>$id,'rules'=>$r,'reason'=>$reason],$now); $result['config_id']=$id; break;
        case 'pool':
          $delta=SpinMath::integer($in['amount_cents']??null,-100000000,100000000,'pool adjustment');
          if($delta===0) throw new SpinError('invalid_input','Use a nonzero adjustment.',422);
          $result['pool_cents']=$this->pool($s,$delta,$ref,'manual',$actor,$reason,$now);
          $this->audit($actor,'pool_adjusted',$result+['delta_cents'=>$delta,'reason'=>$reason],$now); break;
        case 'threshold':
          $hours=SpinMath::integer($in['hours']??null,1,168,'inactivity hours');
          $this->exec('UPDATE spin_state SET threshold_seconds=? WHERE id=1',[$hours*3600]);
          $this->audit($actor,'threshold_changed',['before_seconds'=>(int)$s['threshold_seconds'],'seconds'=>$hours*3600,'reason'=>$reason],$now);
          $this->enforce(array_merge($s,['threshold_seconds'=>$hours*3600]),$now); break;
        case 'player':
          $user=(string)($in['msisdn']??'');
          if(!preg_match('/^233[0-9]{9}$/D',$user)) throw new SpinError('invalid_input','Use the canonical Ghana account number.',422);
          $p=$this->player($user,true);
          if(isset($in['restricted'])) {
            if(!is_bool($in['restricted'])) throw new SpinError('invalid_input','Restriction must be true or false.',422);
            $this->exec('UPDATE spin_players SET restricted=? WHERE msisdn=?',[(int)$in['restricted'],$user]);
          }
          if(isset($in['birth_date'])) {
            $dob=(string)$in['birth_date']; $dt=DateTimeImmutable::createFromFormat('!Y-m-d',$dob,new DateTimeZone('UTC'));
            $verification=trim((string)($in['verification_ref']??''));
            if(!$dt || $dt->format('Y-m-d')!==$dob || $dob<gmdate('Y-m-d',strtotime('-120 years',$now)) || $dob>gmdate('Y-m-d',strtotime('-18 years',$now)) || strlen($verification)<8 || strlen($verification)>128) throw new SpinError('identity_invalid','Verify age 18+ and supply an external identity verification reference.',422);
            $this->exec('UPDATE spin_players SET birth_date=?,verified_at=?,verified_by=?,verification_ref=? WHERE msisdn=?',[$dob,$this->date($now),$actor,$verification,$user]);
          }
          $this->audit($actor,'player_reviewed',['msisdn'=>$user,'previous_restricted'=>(int)$p['restricted'],'identity_verified'=>isset($in['birth_date']),'restricted'=>$in['restricted']??(bool)$p['restricted'],'reason'=>$reason],$now); break;
        case 'credit_correction':
          $user=(string)($in['msisdn']??'');
          if(!preg_match('/^233[0-9]{9}$/D',$user)) throw new SpinError('invalid_input','Use the canonical account number.',422);
          $delta=SpinMath::integer($in['amount_cents']??null,-100000000,100000000,'credit correction');
          if($delta===0) throw new SpinError('invalid_input','Use a nonzero correction.',422);
          $result['balance_cents']=$this->credit($user,$delta,$ref,'correction',$reason,$now);
          $this->journal($ref,'credit_correction',$user,['network_credit_liability'=>$delta,'operator_credit_funding'=>-$delta],$now);
          $this->audit($actor,'credit_corrected',$result+['msisdn'=>$user,'delta_cents'=>$delta,'reason'=>$reason],$now); break;
        default: throw new SpinError('unknown_action','Unknown game administration action.',422);
      }
      $this->exec('INSERT INTO spin_admin_requests(actor,request_key,fingerprint,result_json,created_at) VALUES(?,?,?,?,?)',[$actor,$key,$fingerprint,json_encode($result,JSON_THROW_ON_ERROR),$this->date($now)]);
      return $result;
    });
  }
  public function preview(int $stake): array {
    $s=$this->one('SELECT * FROM spin_state WHERE id=1'); return SpinMath::expectation($stake,(int)$s['pool_cents'],$this->config($s));
  }
  public function securityEvent(string $actor, string $code): void {
    $this->tx(function()use($actor,$code){$this->lock();$this->audit(substr($actor,0,64),'security_rejected',['code'=>$code],$this->now());});
  }
  /** Redeem on the SAME InnoDB connection as the existing RADIUS provisioning routine.
   * Cross-database installations fail closed rather than risking a credit debit without access.
   */
  public function redeem(string $user, array $plan, int $locationId, string $key): array {
    spin_request_key($key);
    require_once __DIR__.'/../radius.php';
    $radius=rdb_pdo();
    $identity='SELECT DATABASE() db,@@hostname host,@@port port';
    if($radius->query($identity)->fetch(PDO::FETCH_ASSOC)!=$this->db->query($identity)->fetch(PDO::FETCH_ASSOC)) throw new SpinError('redemption_database','Atomic credit redemption requires PAY and RADIUS in the same database.',503);
    $required=['accounts','ledger','purchases','radcheck','radreply','radusergroup'];
    $tables=$this->rows('SELECT table_name,engine FROM information_schema.tables WHERE table_schema=DATABASE()'); $engines=[];
    foreach($tables as $t) $engines[strtolower($t['table_name'])]=strtolower((string)$t['engine']);
    foreach($required as $table) if(($engines[$table]??'')!=='innodb') throw new SpinError('redemption_storage','Credit redemption requires transactional billing and RADIUS tables.',503);
    $lock='auto_renew:'.substr(sha1($user),0,40);
    $st=$this->db->prepare('SELECT GET_LOCK(?,5)'); $st->execute([$lock]);
    if((int)$st->fetchColumn()!==1) throw new SpinError('purchase_busy','Another purchase or renewal is in progress. Retry shortly.');
    try {
      return $this->tx(function()use($user,$plan,$locationId,$key){
        $this->lock(); $now=$this->now();
        $old=$this->one('SELECT * FROM spin_redemptions WHERE msisdn=? AND request_key=?',[$user,$key]);
        if($old) { if($old['plan_code']!==$plan['code'] || (int)$old['location_id']!==$locationId) throw new SpinError('idempotency_conflict','This request key belongs to another purchase.'); return $old; }
        $price=SpinMath::integer($plan['price_cents']??null,1,100000000,'plan price');
        if(isset($plan['active']) && !$plan['active']) throw new SpinError('plan_inactive','Choose an available internet plan.');
        $id=bin2hex(random_bytes(16)); $ref='NET-'.$id;
        $balance=$this->credit($user,-$price,$ref,'internet_purchase','Internet plan '.$plan['code'],$now);
        $hasLocation=$this->one("SELECT 1 present FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='purchases' AND column_name='location_id'");
        if($hasLocation) $this->exec("INSERT INTO purchases(msisdn,location_id,plan_code,price_cents,status) VALUES(?,?,?,?,'pending')",[$user,$locationId,$plan['code'],$price]);
        else $this->exec("INSERT INTO purchases(msisdn,plan_code,price_cents,status) VALUES(?,?,?,'pending')",[$user,$plan['code'],$price]);
        $pid=(int)$this->db->lastInsertId();
        $at=new DateTimeImmutable($this->date($now),new DateTimeZone('UTC'));
        radius_apply_plan($user,$plan,$at,$this->db);
        if(!$this->db->inTransaction()) throw new LogicException('Provisioning left its transaction');
        $expiry=nister_fetch_expiration($this->db,nister_username_variants($user),new DateTimeZone('UTC'));
        if(!$expiry) throw new RuntimeException('Provisioning did not produce an expiration');
        $expires=$expiry->format('Y-m-d H:i:s');
        $this->exec("UPDATE purchases SET status='applied',activated_at=?,expires_at=? WHERE id=?",[$this->date($now),$expires,$pid]);
        $this->exec('INSERT INTO spin_redemptions(id,msisdn,request_key,plan_code,location_id,price_cents,purchase_id,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?,?)',[$id,$user,$key,$plan['code'],$locationId,$price,$pid,$expires,$this->date($now)]);
        $this->journal($ref,'internet_purchase',$user,['network_credit_liability'=>-$price,'internet_service_revenue'=>$price],$now);
        $receipt=$this->one('SELECT * FROM spin_redemptions WHERE id=?',[$id]);
        $this->audit($user,'credit_redeemed',$receipt+['balance_after_cents'=>$balance],$now); return $receipt;
      });
    } finally { $st=$this->db->prepare('SELECT RELEASE_LOCK(?)'); $st->execute([$lock]); }
  }
  public function dashboard(string $search='', int $page=0): array {
    $a=$this->availability(); $s=$this->one('SELECT * FROM spin_state WHERE id=1'); $now=$this->now();
    $base=strtotime(($s['last_admin_login']?:$s['created_at']).' UTC');
    $metrics=$this->one("SELECT COUNT(*) spins,COALESCE(SUM(s.stake_cents),0) stakes_cents,COALESCE(SUM(s.outcome='win'),0) wins,COALESCE(SUM(s.outcome='loss'),0) losses,COALESCE(SUM(s.bonus_cents),0) bonuses_cents,COALESCE(SUM(s.credit_cents),0) credits_cents,COALESCE(SUM(CASE WHEN s.payout_wallet='monetary' THEN s.credit_cents ELSE 0 END),0) wallet_winnings_cents,SUM(s.expected_rtp_pct*s.stake_cents)/NULLIF(SUM(s.stake_cents),0) expected_rtp_pct,AVG(CAST(JSON_UNQUOTE(JSON_EXTRACT(c.rules_json,'$.win_bps')) AS UNSIGNED))/100 expected_win_pct FROM spin_spins s JOIN spin_configs c ON c.id=s.config_id");
    $offset=max(0,min(100000,$page))*50;
    $search=substr($search,0,32); $filter=$search!==''?' WHERE msisdn=?':''; $args=$search!==''?[$search]:[];
    $costs=$this->one('SELECT COALESCE(SUM(price_cents),0) redeemed_cents,COUNT(*) purchases FROM spin_redemptions'); $r=$this->config($s);
    $metrics+=['actual_win_pct'=>(int)$metrics['spins']>0?(int)$metrics['wins']/(int)$metrics['spins']*100:0,
      'outstanding_credit_cents'=>(int)$this->one('SELECT COALESCE(SUM(balance_cents),0) total FROM spin_credit_accounts')['total'],
      'redeemed_cents'=>(int)$costs['redeemed_cents'],'credit_funded_purchases'=>(int)$costs['purchases'],
      'estimated_delivery_cost_cents'=>intdiv((int)$costs['redeemed_cents']*$r['delivery_cost_bps'],10000),
      'possible_displaced_revenue_cents'=>(int)$costs['redeemed_cents']];
    $dashboard=['availability'=>$a,'state'=>$s,'rules'=>$r,'metrics'=>$metrics,'bonus_ceiling_cents'=>SpinMath::ceiling((int)$s['pool_cents'],$r),
      'watchdog'=>['enabled'=>true,'healthy'=>$s['last_watchdog_at']!==null && $now-strtotime($s['last_watchdog_at'].' UTC')<=180,
        'elapsed_seconds'=>max(0,$now-$base),'remaining_seconds'=>max(0,(int)$s['threshold_seconds']-($now-$base)),'server_time'=>$this->date($now)],
      'spins'=>$this->rows('SELECT * FROM spin_spins'.$filter." ORDER BY created_at DESC,id DESC LIMIT 50 OFFSET $offset",$args),
      'players'=>$this->rows('SELECT a.msisdn,p.verified_at,COALESCE(p.restricted,0) restricted,p.excluded_until,p.terms_version,COALESCE(c.balance_cents,0) network_credit_cents,a.balance_cents cash_cents FROM accounts a LEFT JOIN spin_players p ON BINARY p.msisdn=BINARY a.msisdn LEFT JOIN spin_credit_accounts c ON BINARY c.msisdn=BINARY a.msisdn'.($search!==''?' WHERE a.msisdn=?':'')." ORDER BY a.msisdn LIMIT 50 OFFSET $offset",$args),
      'pool_movements'=>$this->rows("SELECT * FROM spin_pool_movements ORDER BY id DESC LIMIT 50 OFFSET $offset"),
      'credit_entries'=>$this->rows('SELECT * FROM spin_credit_entries'.$filter." ORDER BY id DESC LIMIT 50 OFFSET $offset",$args),
      'cash_entries'=>$this->rows('SELECT msisdn,type,amount_cents,ref,notes,created_at FROM ledger'.$filter." ORDER BY id DESC LIMIT 50 OFFSET $offset",$args),
      'redemptions'=>$this->rows('SELECT * FROM spin_redemptions'.$filter." ORDER BY created_at DESC LIMIT 50 OFFSET $offset",$args),
      'daily'=>$this->rows("SELECT DATE(s.created_at) day,COUNT(*) spins,SUM(s.stake_cents) stakes_cents,SUM(s.outcome='win') wins,SUM(s.bonus_cents) bonuses_cents,SUM(s.credit_cents) credits_cents,SUM(CASE WHEN s.outcome='loss' THEN s.stake_cents ELSE -s.bonus_cents END) pool_movement_cents,SUM(s.expected_rtp_pct*s.stake_cents)/NULLIF(SUM(s.stake_cents),0) expected_rtp_pct,AVG(CAST(JSON_UNQUOTE(JSON_EXTRACT(c.rules_json,'$.win_bps')) AS UNSIGNED))/100 expected_win_pct FROM spin_spins s JOIN spin_configs c ON c.id=s.config_id GROUP BY DATE(s.created_at) ORDER BY day DESC LIMIT 90"),
      'distribution'=>$this->rows("SELECT bonus_pct,COUNT(*) spins,SUM(bonus_cents) bonuses_cents FROM spin_spins WHERE outcome='win' GROUP BY bonus_pct ORDER BY bonus_pct"),
      'events'=>$this->rows("SELECT * FROM spin_audit WHERE event<>'spin_settled' ORDER BY id DESC LIMIT 50 OFFSET $offset"),
      'transitions'=>$this->rows("SELECT * FROM spin_audit WHERE event IN ('manual_ghost','automatic_ghost','restore','state_change') ORDER BY id DESC LIMIT 100"),
      'configs'=>$this->rows("SELECT * FROM spin_configs ORDER BY id DESC LIMIT 50 OFFSET $offset")];
    return array_replace($dashboard,$this->flightDashboard($s,$filter,$args,$offset,$metrics));
  }
  /** Run in a consistent snapshot. Reconciles materialized balances, journals, receipts and HMAC chain. */
  public function reconcile(): array {
    $this->db->exec('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    return $this->tx(function(){
      // A consistent MVCC snapshot permits normal settlements during a long audit scan.
      $s=$this->one('SELECT * FROM spin_state WHERE id=1'); $errors=[];
      $pool=(int)$this->one('SELECT COALESCE(SUM(amount_cents),0) total FROM spin_pool_movements')['total'];
      if($pool!==(int)$s['pool_cents']) $errors[]='pool_balance_mismatch';
      if($this->rows('SELECT a.msisdn FROM spin_credit_accounts a LEFT JOIN spin_credit_entries e ON e.msisdn=a.msisdn GROUP BY a.msisdn,a.balance_cents HAVING a.balance_cents<>COALESCE(SUM(e.amount_cents),0)')) $errors[]='credit_balance_mismatch';
      if($this->rows('SELECT e.msisdn FROM spin_credit_entries e LEFT JOIN spin_credit_accounts a ON a.msisdn=e.msisdn WHERE a.msisdn IS NULL')) $errors[]='orphan_credit_entry';
      if($this->rows('SELECT j.ref FROM spin_journals j LEFT JOIN spin_postings p ON p.journal_ref=j.ref GROUP BY j.ref HAVING COALESCE(SUM(p.amount_cents),1)<>0')) $errors[]='unbalanced_journal';
      if($this->rows("SELECT s.id FROM spin_spins s LEFT JOIN ledger l ON BINARY l.ref=BINARY CONCAT('SPIN-',s.id) LEFT JOIN ledger w ON BINARY w.ref=BINARY CONCAT('SPIN-',s.id,'-WIN') LEFT JOIN spin_credit_entries c ON c.ref=CONCAT('SPIN-',s.id) LEFT JOIN spin_pool_movements p ON BINARY p.ref=BINARY CONCAT('SPIN-',s.id) LEFT JOIN spin_journals j ON j.ref=CONCAT('SPIN-',s.id) JOIN spin_configs cfg ON cfg.id=s.config_id WHERE l.id IS NULL OR BINARY l.msisdn<>BINARY s.msisdn OR l.amount_cents<>-s.stake_cents OR p.id IS NULL OR j.ref IS NULL OR j.msisdn<>s.msisdn OR cfg.rules_hash<>s.config_hash OR p.balance_after_cents<>s.pool_after_cents OR p.amount_cents<>CASE WHEN s.outcome='win' THEN -s.bonus_cents ELSE s.stake_cents END OR (s.outcome='win' AND s.payout_wallet='network' AND (c.id IS NULL OR c.amount_cents<>s.credit_cents OR c.msisdn<>s.msisdn OR c.balance_after_cents<>s.credit_after_cents)) OR (s.outcome='win' AND s.payout_wallet='monetary' AND (w.id IS NULL OR BINARY w.msisdn<>BINARY s.msisdn OR w.amount_cents<>s.credit_cents)) OR (s.outcome='loss' AND (s.credit_cents<>0 OR s.bonus_cents<>0 OR w.id IS NOT NULL))")) $errors[]='settlement_link_mismatch';
      if($this->rows("SELECT r.id FROM spin_redemptions r LEFT JOIN purchases p ON p.id=r.purchase_id LEFT JOIN spin_credit_entries c ON c.ref=CONCAT('NET-',r.id) WHERE p.id IS NULL OR p.status<>'applied' OR BINARY p.msisdn<>BINARY r.msisdn OR BINARY p.plan_code<>BINARY r.plan_code OR p.price_cents<>r.price_cents OR c.id IS NULL OR c.amount_cents<>-r.price_cents OR c.msisdn<>r.msisdn")) $errors[]='redemption_link_mismatch';
      $configs=$this->rows('SELECT id,rules_json,rules_hash FROM spin_configs');
      foreach($configs as $config) if(!hash_equals($config['rules_hash'],hash('sha256',$config['rules_json']))) $errors[]='configuration_hash_mismatch';
      $creditLiability=(int)$this->one("SELECT COALESCE(SUM(amount_cents),0) total FROM spin_postings WHERE account='network_credit_liability'")['total'];
      if($creditLiability!==(int)$this->one('SELECT COALESCE(SUM(balance_cents),0) total FROM spin_credit_accounts')['total']) $errors[]='credit_journal_liability_mismatch';
      $configHashes=[1=>'fdd92924b90ea568902c525dd534a8876449902db25b5a6209d8f430c0e2a4a5'];
      $flightHashes=[];$flightStarts=0;$flightSettlements=0;
      $head=str_repeat('0',64); $count=0;
      $cursor=0;
      do {
       $batch=$this->rows('SELECT * FROM spin_audit WHERE id>? ORDER BY id LIMIT 500',[$cursor]);
       foreach($batch as $row) {
        $hash=hash_hmac('sha256',json_encode([$head,$row['actor'],$row['event'],$row['payload'],$row['created_at']],JSON_THROW_ON_ERROR),spin_env($this->env,'SPIN_AUDIT_KEY'));
        if(!hash_equals($head,$row['previous_hash']) || !hash_equals($hash,$row['event_hash'])) $errors[]='audit_chain_mismatch:'.$row['id'];
        if($row['event']==='spin_settled') {
          $receipt=json_decode($row['payload'],true,512,JSON_THROW_ON_ERROR); $live=$this->one('SELECT * FROM spin_spins WHERE id=?',[$receipt['id']]);
          if(!$live || array_intersect_key($live,$receipt)!=$receipt || (!isset($receipt['payout_wallet']) && $live['payout_wallet']!=='network')) $errors[]='receipt_tampered:'.$receipt['id']; $count++;
        }
        $payload=json_decode($row['payload'],true,512,JSON_THROW_ON_ERROR);
        if($row['event']==='rules_changed') $configHashes[(int)$payload['config_id']]=hash('sha256',json_encode($payload['rules'],JSON_THROW_ON_ERROR|JSON_UNESCAPED_SLASHES));
        if($row['event']==='flight_rules_changed')$flightHashes[(int)$payload['config_id']]=hash('sha256',json_encode($payload['rules'],JSON_THROW_ON_ERROR|JSON_UNESCAPED_SLASHES));
        if($row['event']==='flight_started') {
          $live=$this->one('SELECT * FROM flight_rounds WHERE id=?',[$payload['id']]);
          $immutable=array_flip(['id','msisdn','request_key','config_id','config_hash','stake_cents','return_cap_cents','pool_bps','pool_at_start_cents','path_hash','start_ms','end_ms','terminal_ms','step_ms','cash_after_hold_cents']);
          if(isset($payload['engine_version']))$immutable+=array_flip(['engine_version','schedule_hash']);
          if(!$live || array_intersect_key($live,$immutable)!=array_intersect_key($payload,$immutable) || !$this->flightCommitmentValid($live))$errors[]='flight_start_tampered';
          $flightStarts++;
        }
        if($row['event']==='flight_settled') {
          $live=$this->one('SELECT * FROM flight_rounds WHERE id=?',[$payload['id']]);
          if(!$live || $this->flightReceipt($live)!=$payload)$errors[]='flight_receipt_tampered';$flightSettlements++;
        }
        if($row['event']==='flight_payout_pending') {
          $live=$this->one('SELECT payout_cents FROM flight_rounds WHERE id=?',[$payload['id']]);
          if(!$live || (int)$live['payout_cents']!==(int)$payload['payout_cents'])$errors[]='flight_pending_payout_tampered';
        }
        if($row['event']==='pool_adjusted') {
          $live=$this->one('SELECT * FROM spin_pool_movements WHERE ref=?',[$payload['ref']]);
          if(!$live || (int)$live['amount_cents']!==(int)$payload['delta_cents'] || (int)$live['balance_after_cents']!==(int)$payload['pool_cents'] || $live['actor']!==$row['actor'] || $live['reason']!==$payload['reason']) $errors[]='pool_adjustment_tampered';
        }
        if($row['event']==='credit_corrected') {
          $live=$this->one('SELECT * FROM spin_credit_entries WHERE ref=?',[$payload['ref']]);
          if(!$live || (int)$live['amount_cents']!==(int)$payload['delta_cents'] || (int)$live['balance_after_cents']!==(int)$payload['balance_cents'] || $live['msisdn']!==$payload['msisdn'] || $live['notes']!==$payload['reason']) $errors[]='credit_correction_tampered';
        }
        if($row['event']==='credit_redeemed') {
          $live=$this->one('SELECT * FROM spin_redemptions WHERE id=?',[$payload['id']]); unset($payload['balance_after_cents']);
          if(!$live || $live!=$payload) $errors[]='redemption_tampered';
        }
        if($row['event']==='credits_transferred') {
          $entry=$this->one('SELECT * FROM ledger WHERE ref=?',[$payload['ref']]);
          $credit=$this->one('SELECT * FROM spin_credit_entries WHERE ref=?',[$payload['ref']]);
          if(!$entry || !$credit || $entry['msisdn']!==$payload['msisdn'] || (int)$entry['amount_cents']!==(int)$payload['amount_cents'] || (int)$credit['amount_cents']!==-(int)$payload['amount_cents']) $errors[]='wallet_transfer_mismatch';
        }
        if($row['event']==='game_consent_accepted') {
          $consent=$this->one('SELECT * FROM spin_consents WHERE msisdn=? AND version=?',[$row['actor'],$payload['version']]);
          if(!$consent || $consent['consent_text']!==$payload['text'] || $consent['accepted_at']!==$payload['accepted_at'] || !hash_equals($consent['text_hash'],hash('sha256',$payload['text']))) $errors[]='consent_record_mismatch';
        }
        $head=$row['event_hash'];
        $cursor=(int)$row['id'];
       }
      } while(count($batch)===500);
      foreach($configs as $config) if(!isset($configHashes[(int)$config['id']]) || !hash_equals($configHashes[(int)$config['id']],$config['rules_hash'])) $errors[]='unaudited_configuration';
      foreach($this->rows('SELECT id,rules_json,rules_hash FROM flight_configs') as $config)if(!isset($flightHashes[(int)$config['id']]) || !hash_equals($flightHashes[(int)$config['id']],$config['rules_hash']) || !hash_equals($config['rules_hash'],hash('sha256',$config['rules_json'])))$errors[]='flight_configuration_tampered';
      $flightCounts=$this->one("SELECT COUNT(*) total,COALESCE(SUM(status='SETTLED'),0) settled FROM flight_rounds");
      if($flightStarts!==(int)$flightCounts['total'] || $flightSettlements!==(int)$flightCounts['settled'])$errors[]='unaudited_flight';
      $errors=array_merge($errors,$this->flightReconciliation());
      if(!hash_equals($head,$s['audit_head'])) $errors[]='audit_head_mismatch';
      if($count!==(int)$this->one('SELECT COUNT(*) total FROM spin_spins')['total']) $errors[]='unaudited_spin';
      return ['ok'=>!$errors,'errors'=>array_values(array_unique($errors)),'audit_head'=>$head,'settled_spins'=>$count,'settled_flights'=>$flightSettlements,'pool_cents'=>(int)$s['pool_cents']];
    });
  }
  public function monitor(): array {
    try { $report=$this->reconcile(); }
    catch(Throwable $e) { $report=['ok'=>false,'errors'=>['reconciliation_evaluation_failed'],'audit_head'=>'unverified']; }
    $this->tx(function()use($report){
      $s=$this->lock();$now=$this->now();$ok=$report['ok']?1:0;
      $error=$report['ok']?null:substr(implode(',',$report['errors']),0,500);
      $this->exec('UPDATE spin_state SET last_reconcile_at=?,reconcile_ok=?,health_error=? WHERE id=1',[$this->date($now),$ok,$error]);
      if((int)$s['reconcile_ok']!==$ok || $s['health_error']!==$error) $this->audit('monitor','reconciliation_status',['ok'=>$report['ok'],'errors'=>$report['errors'],'verified_audit_head'=>$report['audit_head']],$now);
    });
    return $report;
  }
}
