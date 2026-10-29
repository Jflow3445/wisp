<?php
declare(strict_types=1);
require_once __DIR__.'/flight_math.php';

trait FlightDomain {
  public function nowMs(): int {
    return (int)$this->db->query('SELECT CAST(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000 AS UNSIGNED)')->fetchColumn();
  }
  public function upgradeFlightExperience(): void {
    $this->tx(function(){
      $s=$this->lock();if(!empty($s['flight_config_id']))return;
      $rules=FlightMath::defaults();$legacy=$this->config($s);
      $rules['min_stake_cents']=$legacy['min_stake_cents'];$rules['pool_bps']=min(1000,$legacy['pool_bps']);
      $this->saveFlightRules('migration',$rules,'Replace wheel reveals with held-stake flight rounds and a total-return pool ceiling.',$this->now());
    });
  }
  public function upgradeHouseEdgeControl(): void {
    $this->tx(function(){
      $s=$this->lock();if(empty($s['flight_config_id']))return;
      $row=$this->one('SELECT * FROM flight_configs WHERE id=?',[$s['flight_config_id']]);
      if(!$row || !hash_equals($row['rules_hash'],hash('sha256',$row['rules_json'])))throw new SpinError('config_integrity','Flight configuration is unavailable.',503);
      $raw=json_decode($row['rules_json'],true,512,JSON_THROW_ON_ERROR);
      if(array_key_exists('min_house_edge_ppm',$raw))return;
      $this->saveFlightRules('migration',FlightMath::rules($raw,true),
        'Add an explicit minimum expected house edge while preserving the previous opening and movement rules.',$this->now(),true);
    });
  }
  public function upgradeBalancedFlights(): void {
    $this->tx(function(){
      $s=$this->lock();if(empty($s['flight_config_id']))return;
      $rules=$this->flightRules($s);if($rules['movement_model']==='balanced')return;
      $rules['movement_model']='balanced';unset($rules['up_bps']);
      $this->saveFlightRules('migration',$rules,'Remove compounded movement losses; preserve the selected opening edge with fair ordinary transitions and one-pesewa ceiling rebounds.',$this->now());
    });
  }
  private function saveFlightRules(string $actor,array $rules,string $reason,int $now,bool $allowLegacy=false): int {
    $rules=FlightMath::rules($rules);
    if(!$allowLegacy && $rules['movement_model']!=='balanced')throw new SpinError('unsafe_rules','New configurations must use balanced movements.',422);
    FlightMath::assertSafeRules($rules);$json=json_encode($rules,JSON_THROW_ON_ERROR|JSON_UNESCAPED_SLASHES);
    $previous=$this->one('SELECT flight_config_id FROM spin_state WHERE id=1')['flight_config_id'];
    $this->exec('INSERT INTO flight_configs(rules_json,rules_hash,created_by,reason,created_at) VALUES(?,?,?,?,?)',[$json,hash('sha256',$json),$actor,$reason,$this->date($now)]);
    $id=(int)$this->db->lastInsertId();$this->exec('UPDATE spin_state SET flight_config_id=? WHERE id=1',[$id]);
    $this->audit($actor,'flight_rules_changed',['previous_config_id'=>$previous,'config_id'=>$id,'rules'=>$rules,'reason'=>$reason],$now);return $id;
  }
  private function flightRules(array $state,bool $requireEdge=false): array {
    $row=$this->one('SELECT * FROM flight_configs WHERE id=?',[$state['flight_config_id']??0]);
    if(!$row || !hash_equals($row['rules_hash'],hash('sha256',$row['rules_json'])))throw new SpinError('config_integrity','Flight configuration is unavailable.',503);
    $raw=json_decode($row['rules_json'],true,512,JSON_THROW_ON_ERROR);
    if($requireEdge && (!array_key_exists('min_house_edge_ppm',$raw) || ($raw['movement_model']??'')!=='balanced'))throw new SpinError('upgrade_required','New flights are being updated. Please try again shortly.',503);
    return FlightMath::rules($raw,true);
  }
  private function reservations(): array {
    return $this->one("SELECT COALESCE(SUM(return_cap_cents),0) reserved,COALESCE(SUM(stake_cents),0) held,MIN(pool_bps) minimum_bps,COUNT(*) active_count FROM flight_rounds WHERE status IN ('ACTIVE','PAYOUT_PENDING')");
  }
  private function protectFlightPool(int $nextPool): void {
    $reserved=$this->reservations();
    if((int)$reserved['active_count']>0 && (int)$reserved['reserved']>intdiv($nextPool*(int)$reserved['minimum_bps'],10000))throw new SpinError('pool_reserved','This adjustment would invalidate money reserved for active flights. Wait for them to settle.');
  }
  private function flightRow(string $user,string $id): array {
    if(!preg_match('/^[a-f0-9]{32}$/D',$id))throw new SpinError('invalid_round','That flight reference is invalid.',422);
    $row=$this->one('SELECT * FROM flight_rounds WHERE id=? AND msisdn=?',[$id,$user]);
    if(!$row)throw new SpinError('round_not_found','That flight could not be found.',404);return $row;
  }
  /** Sole accepted-round state transition; callable while paused/ghosted or after account restriction. */
  private function settleFlightLocked(array $round,int $payout,string $reason,?string $offerId,int $nowMs): array {
    if($round['status']==='SETTLED')return $round;
    if($round['status']==='PAYOUT_PENDING'){$payout=(int)$round['payout_cents'];$reason=$round['end_reason'];$offerId=$round['collected_offer_id'];}
    $state=$this->lock();$stake=(int)$round['stake_cents'];
    if($payout<0 || $payout>(int)$round['return_cap_cents'] || $payout>2*$stake || $payout>intdiv((int)$state['pool_cents']*(int)$round['pool_bps'],10000))throw new SpinError('settlement_integrity','The reserved flight payout needs reconciliation.',503);
    $this->exec('INSERT IGNORE INTO accounts(msisdn,balance_cents) VALUES(?,0)',[$round['msisdn']]);
    $cash=$this->cash($round['msisdn'],true);$now=intdiv($nowMs,1000);
    if($cash['balance_cents']+$payout>SpinMath::MAX_WALLET) {
      if($round['status']!=='PAYOUT_PENDING') {
        $this->exec("UPDATE flight_rounds SET status='PAYOUT_PENDING',payout_cents=?,end_reason=?,collected_offer_id=? WHERE id=?",[$payout,$reason,$offerId,$round['id']]);
        $this->audit('settlement','flight_payout_pending',['id'=>$round['id'],'msisdn'=>$round['msisdn'],'payout_cents'=>$payout,'reason'=>'wallet_capacity'],$now);
      }
      return $this->flightRow($round['msisdn'],$round['id']);
    }
    $ref='FLT-'.$round['id'].'-END';
    if($payout>0) {
      $this->exec('INSERT INTO ledger(msisdn,type,amount_cents,ref,notes) VALUES(?,?,?,?,?)',[$round['msisdn'],'flight_return',$payout,$ref,'Flight return from held stake']);
      $this->exec('UPDATE accounts SET balance_cents=balance_cents+? WHERE msisdn=?',[$payout,$round['msisdn']]);
    }
    // Release this envelope first. Remaining envelopes must still fit the pool after settlement.
    $after=$cash['balance_cents']+$payout;
    $this->exec("UPDATE flight_rounds SET status='SETTLED',active_user=NULL,payout_cents=?,cash_after_cents=?,end_reason=?,collected_offer_id=?,settled_at=? WHERE id=?",[$payout,$after,$reason,$offerId,$this->date($now),$round['id']]);
    $kind=$payout>$stake?'flight_profit':($payout===$stake?'flight_even':($payout===0?'flight_zero':'flight_loss'));
    $poolAfter=$this->pool($state,$stake-$payout,$ref,$kind,'settlement','Held flight stake minus total return',$now);
    $this->exec('UPDATE flight_rounds SET pool_after_cents=? WHERE id=?',[$poolAfter,$round['id']]);
    $this->journal($ref,'flight_settlement',$round['msisdn'],['held_stake_liability'=>-$stake,'customer_cash_liability'=>$payout,'game_result_budget'=>$stake-$payout],$now);
    $settled=$this->flightRow($round['msisdn'],$round['id']);
    $this->audit('settlement','flight_settled',$this->flightReceipt($settled),$now);return $settled;
  }
  private function flightReceipt(array $r): array {
    $keys=['id','msisdn','request_key','config_id','config_hash','stake_cents','return_cap_cents','pool_bps','pool_at_start_cents','path_hash','start_ms','end_ms','terminal_ms','cash_after_hold_cents','status','payout_cents','cash_after_cents','pool_after_cents','end_reason','collected_offer_id','accepted_ms','settled_at'];
    // Old signed receipts must retain their exact original shape.
    if((int)($r['engine_version']??1)>=2)$keys=array_merge($keys,['engine_version','schedule_hash']);
    return array_intersect_key($r,array_flip($keys));
  }
  private function flightCommitment(array $round): string {
    if((int)($round['engine_version']??1)<2)return hash('sha256',$round['path_json']);
    if((int)$round['engine_version']===2)return hash_hmac('sha256',"flight-path-v2\0".$round['id']."\0".$round['path_json']."\0".$round['schedule_json'],spin_env($this->env,'SPIN_AUDIT_KEY'));
    return $this->flightTermsHash($round);
  }
  private function flightTermsHash(array $round): string {
    $terms=[];
    foreach(['id','msisdn','request_key','config_hash','path_json','schedule_json'] as $key)$terms[$key]=(string)$round[$key];
    foreach(['engine_version','stake_cents','return_cap_cents','pool_bps','pool_at_start_cents','start_ms','end_ms','terminal_ms','step_ms'] as $key)$terms[$key]=(int)$round[$key];
    return hash_hmac('sha256','flight-path-v'.$round['engine_version']."\0".json_encode($terms,JSON_THROW_ON_ERROR|JSON_UNESCAPED_SLASHES),spin_env($this->env,'SPIN_AUDIT_KEY'));
  }
  private function flightCommitmentValid(array $round): bool {
    if(hash_equals($round['path_hash'],$this->flightCommitment($round)))return true;
    // Preserve accepted engine-2 receipts from the commitment-format transition.
    return (int)($round['engine_version']??1)===2 && hash_equals($round['path_hash'],$this->flightTermsHash($round));
  }
  private function flightScheduleHash(string $id,string $json): string {
    return hash_hmac('sha256',"flight-schedule-v2\0".$id."\0".$json,spin_env($this->env,'SPIN_AUDIT_KEY'));
  }
  private function flightData(array $round): array {
    if(!$this->flightCommitmentValid($round))throw new SpinError('round_integrity','This flight needs reconciliation.',503);
    $path=json_decode($round['path_json'],true,512,JSON_THROW_ON_ERROR);
    $offsets=(int)($round['engine_version']??1)>=2?json_decode($round['schedule_json'],true,512,JSON_THROW_ON_ERROR):array_map(fn($index)=>$index*(int)$round['step_ms'],array_keys($path));
    if((int)($round['engine_version']??1)>=2 && !hash_equals((string)$round['schedule_hash'],$this->flightScheduleHash($round['id'],$round['schedule_json'])))throw new SpinError('round_integrity','This flight needs reconciliation.',503);
    $duration=(int)$round['end_ms']-(int)$round['start_ms'];$previous=-1;
    if(!is_array($path) || !array_is_list($path) || !$path || !is_array($offsets) || !array_is_list($offsets) || count($path)!==count($offsets))throw new SpinError('round_integrity','This flight needs reconciliation.',503);
    foreach($path as $index=>$amount) {
      if(!is_int($amount) || $amount<0 || $amount>(int)$round['return_cap_cents'] || !is_int($offsets[$index]) || $offsets[$index]<0 || $offsets[$index]<=$previous || $offsets[$index]>=$duration || ($index===0 && $offsets[$index]!==0) || ($amount===0 && $index!==count($path)-1))throw new SpinError('round_integrity','This flight needs reconciliation.',503);
      $previous=$offsets[$index];
    }
    return [$path,$offsets];
  }
  private function flightViewLocked(array $round,int $nowMs): array {
    [$path,$offsets]=$this->flightData($round);
    if($round['status']==='PAYOUT_PENDING')$this->exec('UPDATE flight_rounds SET last_retry_ms=? WHERE id=?',[$nowMs,$round['id']]);
    if($round['status']==='PAYOUT_PENDING')$round=$this->settleFlightLocked($round,(int)$round['payout_cents'],$round['end_reason'],$round['collected_offer_id'],$nowMs);
    if($round['status']==='ACTIVE' && $nowMs>=(int)$round['terminal_ms']) {
      $last=(int)$path[count($path)-1];$round=$this->settleFlightLocked($round,$last,$last===0?'zero':'completed',null,$nowMs);
    }
    $view=['id'=>$round['id'],'status'=>$round['status'],'stake_cents'=>(int)$round['stake_cents'],'server_ms'=>$nowMs,
      'start_ms'=>(int)$round['start_ms'],'end_ms'=>(int)$round['end_ms'],'step_ms'=>(int)$round['step_ms'],
      'wallet_cents'=>$this->cash($round['msisdn'])['balance_cents'],'held_cents'=>$round['status']==='SETTLED'?0:(int)$round['stake_cents'],
      'offer'=>null,'history'=>[]];
    if($round['status']==='ACTIVE') {
      $seq=0;$elapsed=max(0,$nowMs-(int)$round['start_ms']);
      foreach($offsets as $index=>$offset){if($offset>$elapsed)break;$seq=$index;}
      $expires=isset($offsets[$seq+1])?(int)$round['start_ms']+$offsets[$seq+1]:(int)$round['end_ms'];
      $offer=$this->one('SELECT * FROM flight_offers WHERE round_id=? AND sequence_no=?',[$round['id'],$seq]);
      if(!$offer) {
        $id=bin2hex(random_bytes(16));$this->exec('INSERT INTO flight_offers(id,round_id,sequence_no,amount_cents,issued_ms,expires_ms) VALUES(?,?,?,?,?,?)',[$id,$round['id'],$seq,(int)$path[$seq],$nowMs,$expires]);
        $offer=['id'=>$id,'sequence_no'=>$seq,'amount_cents'=>(int)$path[$seq],'issued_ms'=>$nowMs,'expires_ms'=>$expires];
      }
      if((int)$offer['amount_cents']!==(int)$path[$seq] || (int)$offer['expires_ms']!==$expires || (int)$offer['issued_ms']<(int)$round['start_ms']+$offsets[$seq] || (int)$offer['issued_ms']>=$expires || (int)$offer['issued_ms']>$nowMs)throw new SpinError('round_integrity','This flight needs reconciliation.',503);
      $view['offer']=['id'=>$offer['id'],'sequence'=>(int)$offer['sequence_no'],'amount_cents'=>(int)$offer['amount_cents'],'expires_ms'=>(int)$offer['expires_ms']];
      $view['history']=array_slice($path,0,$seq+1);
      $view['history_ms']=array_slice($offsets,0,$seq+1);
    } else {
      $view['receipt']=$this->flightReceipt($round);
      $offer=$round['collected_offer_id']?$this->one('SELECT sequence_no FROM flight_offers WHERE id=?',[$round['collected_offer_id']]):null;
      $view['history']=$offer?array_slice($path,0,(int)$offer['sequence_no']+1):$path;
      $view['history_ms']=array_slice($offsets,0,count($view['history']));
    }
    $totalReturn=$view['offer']?(int)$view['offer']['amount_cents']:(int)$round['payout_cents'];
    $view['amounts']=FlightMath::returnAmounts((int)$round['stake_cents'],$totalReturn);
    if($round['status']==='SETTLED')$view['wallet_movement']=FlightMath::walletMovement(
      (int)$round['cash_after_hold_cents']+(int)$round['stake_cents'],(int)$round['stake_cents'],$totalReturn,(int)$round['cash_after_cents']);
    return $view;
  }
  public function startFlight(string $user,int $stake,string $key): array {
    spin_request_key($key);SpinMath::integer($stake,1,SpinMath::MAX_WALLET,'stake');
    $this->settleExpiredFlights(50);$this->availability();
    return $this->tx(function()use($user,$stake,$key){
      $state=$this->lock();$nowMs=$this->nowMs();$now=intdiv($nowMs,1000);
      $old=$this->one('SELECT * FROM flight_rounds WHERE msisdn=? AND request_key=?',[$user,$key]);
      if($old){if((int)$old['stake_cents']!==$stake)throw new SpinError('idempotency_conflict','This reference belongs to another stake.');return $this->flightViewLocked($old,$nowMs);}
      $this->playable($state,$now);$rules=$this->flightRules($state,true);
      try{FlightMath::assertSafeRules($rules);}catch(SpinError $e){throw new SpinError('configuration_unavailable','New flights are temporarily unavailable. Please try again later.',503);}
      $this->eligible($user,$rules,$now,$stake);
      if($this->one('SELECT id FROM flight_rounds WHERE active_user=?',[$user]))throw new SpinError('flight_in_progress','Your existing flight is still running. Resume it before starting another.');
      $cash=$this->cash($user,true);if($cash['stakeable_cents']<$stake)throw new SpinError('insufficient_funds','Your wallet has insufficient funds for this stake.',402);
      $reserved=$this->reservations();$effectiveBps=$rules['pool_bps'];
      if($reserved['minimum_bps']!==null)$effectiveBps=min($effectiveBps,(int)$reserved['minimum_bps']);
      $cap=FlightMath::cap($stake,(int)$state['pool_cents'],(int)$reserved['reserved'],$effectiveBps,SpinMath::MAX_WALLET-($cash['balance_cents']-$stake));
      $generated=FlightMath::flight($stake,$cap,$rules);$path=$generated['path'];$offsets=$generated['offsets'];
      $json=json_encode($path,JSON_THROW_ON_ERROR);$schedule=json_encode($offsets,JSON_THROW_ON_ERROR);
      $id=bin2hex(random_bytes(16));$ref='FLT-'.$id.'-HOLD';$scheduleHash=$this->flightScheduleHash($id,$schedule);
      $endMs=$nowMs+$rules['steps']*$rules['step_ms'];$terminalMs=$endMs;
      if($path[count($path)-1]===0)$terminalMs=$nowMs+$offsets[count($path)-1];
      $configHash=$this->one('SELECT rules_hash FROM flight_configs WHERE id=?',[$state['flight_config_id']])['rules_hash'];
      $hash=$this->flightCommitment(['id'=>$id,'msisdn'=>$user,'request_key'=>$key,'config_hash'=>$configHash,'engine_version'=>FlightMath::ENGINE_VERSION,'path_json'=>$json,'schedule_json'=>$schedule,'stake_cents'=>$stake,'return_cap_cents'=>$cap,'pool_bps'=>$rules['pool_bps'],'pool_at_start_cents'=>$state['pool_cents'],'start_ms'=>$nowMs,'end_ms'=>$endMs,'terminal_ms'=>$terminalMs,'step_ms'=>$rules['step_ms']]);
      $this->exec('INSERT INTO ledger(msisdn,type,amount_cents,ref,notes) VALUES(?,?,?,?,?)',[$user,'flight_stake',-$stake,$ref,'Stake held for Flight']);
      $this->exec('UPDATE accounts SET balance_cents=balance_cents-? WHERE msisdn=?',[$stake,$user]);
      $this->journal($ref,'flight_hold',$user,['customer_cash_liability'=>-$stake,'held_stake_liability'=>$stake],$now);
      $this->exec("INSERT INTO flight_rounds(id,msisdn,request_key,active_user,config_id,config_hash,status,stake_cents,return_cap_cents,pool_bps,pool_at_start_cents,path_json,path_hash,start_ms,end_ms,terminal_ms,step_ms,cash_after_hold_cents,created_at,engine_version,schedule_json,schedule_hash) VALUES(?,?,?,?,?,?,'ACTIVE',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",[$id,$user,$key,$user,$state['flight_config_id'],$configHash,$stake,$cap,$rules['pool_bps'],$state['pool_cents'],$json,$hash,$nowMs,$endMs,$terminalMs,$rules['step_ms'],$cash['balance_cents']-$stake,$this->date($now),FlightMath::ENGINE_VERSION,$schedule,$scheduleHash]);
      $round=$this->flightRow($user,$id);
      $this->audit($user,'flight_started',$this->flightReceipt($round)+['step_ms'=>$rules['step_ms']],$now);
      return $this->flightViewLocked($round,$nowMs);
    });
  }
  public function activeFlight(string $user,?string $id=null,?string $requestKey=null): ?array {
    return $this->tx(function()use($user,$id,$requestKey){
      $this->lock();
      if($id!==null)$round=$this->flightRow($user,$id);
      elseif($requestKey!==null)$round=$this->one('SELECT * FROM flight_rounds WHERE msisdn=? AND request_key=?',[$user,$requestKey]);
      else $round=$this->one('SELECT * FROM flight_rounds WHERE active_user=?',[$user]);
      return $round?$this->flightViewLocked($round,$this->nowMs()):null;
    });
  }
  public function collectFlight(string $user,string $id,string $offerId,string $key): array {
    spin_request_key($key);if(!preg_match('/^[a-f0-9]{32}$/D',$id) || !preg_match('/^[a-f0-9]{32}$/D',$offerId))throw new SpinError('invalid_offer','Recover the current flight offer.',422);
    return $this->tx(function()use($user,$id,$offerId,$key){
      $this->lock();$nowMs=$this->nowMs();$round=$this->flightRow($user,$id);
      $request=$this->one('SELECT * FROM flight_collect_requests WHERE msisdn=? AND request_key=?',[$user,$key]);
      if($request && ($request['round_id']!==$id || $request['offer_id']!==$offerId))throw new SpinError('idempotency_conflict','This collection reference belongs to another offer.');
      if($round['status']!=='ACTIVE' || $nowMs>=(int)$round['terminal_ms'])return $this->flightViewLocked($round,$nowMs);
      $offer=$this->one('SELECT * FROM flight_offers WHERE id=? AND round_id=?',[$offerId,$id]);
      if(!$offer || $nowMs>=(int)$offer['expires_ms'])throw new SpinError('offer_expired','The return updated before collection was accepted. Choose Collect again.');
      [$path,$offsets]=$this->flightData($round);$sequence=(int)$offer['sequence_no'];
      $expires=isset($offsets[$sequence+1])?(int)$round['start_ms']+$offsets[$sequence+1]:(int)$round['end_ms'];
      if(!isset($path[$sequence]) || (int)$offer['amount_cents']!==$path[$sequence] || (int)$offer['expires_ms']!==$expires || $nowMs<(int)$offer['issued_ms'] || $nowMs<(int)$round['start_ms']+$offsets[$sequence] || $nowMs>=$expires)throw new SpinError('round_integrity','This flight needs reconciliation.',503);
      $this->exec('INSERT INTO flight_collect_requests(msisdn,request_key,round_id,offer_id,accepted_ms,created_at) VALUES(?,?,?,?,?,?)',[$user,$key,$id,$offerId,$nowMs,$this->date(intdiv($nowMs,1000))]);
      $this->exec('UPDATE flight_rounds SET accepted_ms=? WHERE id=?',[$nowMs,$id]);$round['accepted_ms']=$nowMs;
      $round=$this->settleFlightLocked($round,(int)$offer['amount_cents'],'collected',$offerId,$nowMs);
      return $this->flightViewLocked($round,$nowMs);
    });
  }
  public function settleExpiredFlights(int $limit=100): int {
    $limit=max(1,min(500,$limit));$nowMs=$this->nowMs();
    $rows=$this->rows("SELECT id,msisdn FROM flight_rounds WHERE (status='ACTIVE' AND terminal_ms<=?) OR status='PAYOUT_PENDING' ORDER BY CASE WHEN status='ACTIVE' THEN 0 ELSE 1 END,last_retry_ms,terminal_ms LIMIT $limit",[$nowMs]);$count=0;
    foreach($rows as $row){$this->activeFlight($row['msisdn'],$row['id']);$count++;}
    return $count;
  }
  public function flightPreview(int $stake,?array $draft=null): array {
    SpinMath::integer($stake,1,SpinMath::MAX_WALLET,'preview stake');
    $s=$this->one('SELECT * FROM spin_state WHERE id=1');$r=$draft===null?$this->flightRules($s):FlightMath::rules($draft);
    FlightMath::assertSafeRules($r);$reserved=$this->reservations();
    $bps=$reserved['minimum_bps']===null?$r['pool_bps']:min($r['pool_bps'],(int)$reserved['minimum_bps']);
    $cap=FlightMath::cap($stake,(int)$s['pool_cents'],(int)$reserved['reserved'],$bps);
    return FlightMath::preview($stake,$cap,$r);
  }
  private function flightDashboard(array $state,string $filter,array $args,int $offset,array $legacyMetrics): array {
    $rules=$this->flightRules($state);$reserved=$this->reservations();
    $metrics=$this->one("SELECT COUNT(*) spins,COALESCE(SUM(stake_cents),0) stakes_cents,COALESCE(SUM(payout_cents>stake_cents),0) wins,COALESCE(SUM(payout_cents<stake_cents),0) losses,COALESCE(SUM(GREATEST(0,payout_cents-stake_cents)),0) bonuses_cents,COALESCE(SUM(payout_cents),0) credits_cents,COALESCE(SUM(payout_cents),0) wallet_winnings_cents FROM flight_rounds WHERE status='SETTLED'");
    $metrics['actual_win_pct']=(int)$metrics['spins']>0?(int)$metrics['wins']/(int)$metrics['spins']*100:0;
    return ['rules'=>$rules,'edge_model'=>FlightMath::edgeModel($rules),'metrics'=>array_replace($legacyMetrics,$metrics),'reservations'=>$reserved,
      'bonus_ceiling_cents'=>intdiv((int)$state['pool_cents']*$rules['pool_bps'],10000),
      'spins'=>$this->rows('SELECT id,msisdn,stake_cents,payout_cents,return_cap_cents,config_id,status,end_reason,created_at FROM flight_rounds'.$filter." ORDER BY created_at DESC,id DESC LIMIT 50 OFFSET $offset",$args),
      'daily'=>$this->rows("SELECT DATE(settled_at) day,COUNT(*) spins,SUM(stake_cents) stakes_cents,SUM(payout_cents>stake_cents) wins,SUM(GREATEST(0,payout_cents-stake_cents)) bonuses_cents,SUM(payout_cents) credits_cents,SUM(stake_cents-payout_cents) pool_movement_cents FROM flight_rounds WHERE status='SETTLED' GROUP BY DATE(settled_at) ORDER BY day DESC LIMIT 90"),
      'distribution'=>$this->rows("SELECT CASE WHEN payout_cents>stake_cents THEN 'Profit' WHEN payout_cents=stake_cents THEN 'Break even' WHEN payout_cents>0 THEN 'Partial return' ELSE 'Zero return' END outcome,COUNT(*) spins,SUM(payout_cents) returned_cents FROM flight_rounds WHERE status='SETTLED' GROUP BY outcome"),
      'configs'=>$this->rows("SELECT * FROM flight_configs ORDER BY id DESC LIMIT 50 OFFSET $offset")];
  }
  private function flightReconciliation(): array {
    $errors=[];
    $liability=(int)$this->one("SELECT COALESCE(SUM(amount_cents),0) total FROM spin_postings WHERE account='held_stake_liability'")['total'];
    $reservations=$this->reservations();$state=$this->one('SELECT pool_cents FROM spin_state WHERE id=1');
    if($liability!==(int)$reservations['held'])$errors[]='flight_hold_liability_mismatch';
    if((int)$reservations['active_count']>0 && (int)$reservations['reserved']>intdiv((int)$state['pool_cents']*(int)$reservations['minimum_bps'],10000))$errors[]='flight_reservations_exceed_ceiling';
    if($this->rows("SELECT r.id FROM flight_rounds r LEFT JOIN ledger h ON BINARY h.ref=BINARY CONCAT('FLT-',r.id,'-HOLD') LEFT JOIN ledger p ON BINARY p.ref=BINARY CONCAT('FLT-',r.id,'-END') LEFT JOIN spin_pool_movements m ON m.ref=CONCAT('FLT-',r.id,'-END') JOIN flight_configs c ON c.id=r.config_id WHERE h.id IS NULL OR BINARY h.msisdn<>BINARY r.msisdn OR h.amount_cents<>-r.stake_cents OR c.rules_hash<>r.config_hash OR r.return_cap_cents>2*r.stake_cents OR r.return_cap_cents>FLOOR(r.pool_at_start_cents*r.pool_bps/10000) OR (r.status='SETTLED' AND (r.active_user IS NOT NULL OR m.id IS NULL OR m.amount_cents<>r.stake_cents-r.payout_cents OR r.payout_cents<0 OR r.payout_cents>r.return_cap_cents OR (r.payout_cents>0 AND (p.id IS NULL OR BINARY p.msisdn<>BINARY r.msisdn OR p.amount_cents<>r.payout_cents)))) OR (r.status<>'SETTLED' AND (r.active_user<>r.msisdn OR p.id IS NOT NULL OR m.id IS NOT NULL))"))$errors[]='flight_financial_link_mismatch';
    if($this->rows("SELECT r.id FROM flight_rounds r LEFT JOIN flight_offers o ON o.id=r.collected_offer_id WHERE r.end_reason='collected' AND (o.id IS NULL OR o.round_id<>r.id OR o.amount_cents<>r.payout_cents OR r.accepted_ms IS NULL OR r.accepted_ms<o.issued_ms OR r.accepted_ms>=o.expires_ms)"))$errors[]='flight_collected_offer_mismatch';
    $postings="SELECT journal_ref,SUM(CASE WHEN account='customer_cash_liability' THEN amount_cents ELSE 0 END) cash,SUM(CASE WHEN account='held_stake_liability' THEN amount_cents ELSE 0 END) held,SUM(CASE WHEN account='game_result_budget' THEN amount_cents ELSE 0 END) pool,SUM(account NOT IN ('customer_cash_liability','held_stake_liability','game_result_budget')) unexpected FROM spin_postings GROUP BY journal_ref";
    if($this->rows("SELECT r.id FROM flight_rounds r LEFT JOIN spin_journals h ON BINARY h.ref=BINARY CONCAT('FLT-',r.id,'-HOLD') LEFT JOIN ($postings) hp ON hp.journal_ref=h.ref LEFT JOIN spin_journals e ON e.ref=CONCAT('FLT-',r.id,'-END') LEFT JOIN ($postings) ep ON ep.journal_ref=e.ref WHERE h.ref IS NULL OR h.kind<>'flight_hold' OR BINARY h.msisdn<>BINARY r.msisdn OR hp.journal_ref IS NULL OR hp.cash<>-r.stake_cents OR hp.held<>r.stake_cents OR hp.pool<>0 OR hp.unexpected<>0 OR (r.status='SETTLED' AND (e.ref IS NULL OR e.kind<>'flight_settlement' OR e.msisdn<>r.msisdn OR ep.journal_ref IS NULL OR ep.cash<>r.payout_cents OR ep.held<>-r.stake_cents OR ep.pool<>r.stake_cents-r.payout_cents OR ep.unexpected<>0)) OR (r.status<>'SETTLED' AND e.ref IS NOT NULL)"))$errors[]='flight_journal_mismatch';
    return $errors;
  }
}
