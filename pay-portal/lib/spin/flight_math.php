<?php
declare(strict_types=1);
require_once __DIR__.'/math.php';

final class FlightMath {
  public const ENGINE_VERSION=5;
  public const PPM=1000000;
  public const PEAK_MS=1000;
  public static function assertSafeRules(array $rules): void {
    if(($rules['movement_model']??'legacy')==='legacy' && $rules['up_bps']>5000)throw new SpinError('unsafe_rules','Upward movement must be at most 50% to preserve the stopping-strategy bound.',422);
  }
  public static function returnAmounts(int $stake,int $totalReturn): array {
    return ['stake_cents'=>$stake,'stake_returned_cents'=>min($stake,$totalReturn),
      'profit_cents'=>max(0,$totalReturn-$stake),'loss_cents'=>max(0,$stake-$totalReturn),'total_return_cents'=>$totalReturn];
  }
  public static function walletMovement(int $before,int $stake,int $totalReturn,int $after): array {
    return ['before_cents'=>$before,'stake_cents'=>$stake,'returned_cents'=>$totalReturn,
      'other_activity_cents'=>$after-($before-$stake+$totalReturn),'after_cents'=>$after];
  }
  public static function defaults(): array {
    return ['movement_model'=>'balanced','min_house_edge_ppm'=>64250,'zero_bps'=>150,'min_move_pct'=>10,'max_move_pct'=>40,'distribution'=>'uniform','weights'=>[],
      'pool_bps'=>1000,'min_stake_cents'=>100,'steps'=>8,'step_ms'=>1500,'daily_stake_cents'=>0,'daily_loss_cents'=>0,'interval_seconds'=>0];
  }
  public static function rules(array $rules,bool $allowLegacy=false): array {
    if($allowLegacy && !array_key_exists('min_house_edge_ppm',$rules)) {
      $zero=SpinMath::integer($rules['zero_bps']??null,0,10000,'zero_bps');
      // Historical profiles used a 95% opening. Preserve their edge without rewriting them.
      $rules['min_house_edge_ppm']=min(self::PPM-1,self::PPM-95*(10000-$zero));
    }
    if($allowLegacy && !array_key_exists('movement_model',$rules))$rules['movement_model']='legacy';
    if(!in_array($rules['movement_model']??null,['balanced','legacy'],true))throw new SpinError('invalid_rules','Unknown flight movement model.',422);
    $keys=array_keys(self::defaults());if($rules['movement_model']==='legacy')$keys[]='up_bps';
    if(array_diff(array_keys($rules),$keys) || array_diff($keys,array_keys($rules))) throw new SpinError('invalid_rules','Supply the complete flight rule set.',422);
    foreach(['min_house_edge_ppm'=>[0,self::PPM-1],'zero_bps'=>[0,10000],'min_move_pct'=>[1,100],'max_move_pct'=>[1,100],
      'pool_bps'=>[1,1000],'min_stake_cents'=>[1,SpinMath::MAX_WALLET],'steps'=>[4,20],'step_ms'=>[1000,3000],
      'daily_stake_cents'=>[0,SpinMath::MAX_WALLET],'daily_loss_cents'=>[0,SpinMath::MAX_WALLET],'interval_seconds'=>[0,3600]] as $key=>$range) SpinMath::integer($rules[$key],$range[0],$range[1],$key);
    if($rules['movement_model']==='legacy')SpinMath::integer($rules['up_bps'],0,10000,'up_bps');
    if($rules['min_move_pct']>$rules['max_move_pct'] || !in_array($rules['distribution'],['uniform','weighted'],true) || !is_array($rules['weights'])) throw new SpinError('invalid_rules','Invalid movement distribution.',422);
    $weights=[];
    if($rules['distribution']==='uniform' && $rules['weights']!==[]) throw new SpinError('invalid_rules','Uniform movement does not take weights.',422);
    if($rules['distribution']==='weighted') {
      foreach($rules['weights'] as $pct=>$weight) {
        if(!preg_match('/^[1-9][0-9]{0,2}$/D',(string)$pct) || (int)$pct<$rules['min_move_pct'] || (int)$pct>$rules['max_move_pct']) throw new SpinError('invalid_rules','Movement percentage outside its range.',422);
        $weights[(int)$pct]=SpinMath::integer($weight,1,100000,'weight');
      }
      if(!$weights || !isset($weights[$rules['min_move_pct']],$weights[$rules['max_move_pct']]) || array_sum($weights)>1000000) throw new SpinError('invalid_rules','Weights must include both endpoints.',422);
      ksort($weights,SORT_NUMERIC);
    }
    $rules['weights']=$weights;$out=[];foreach($keys as $key)$out[$key]=$rules[$key];return $out;
  }
  public static function weights(array $r): array {
    return $r['distribution']==='weighted'?$r['weights']:array_fill_keys(range($r['min_move_pct'],$r['max_move_pct']),1);
  }
  public static function openingPpm(array $r): int {
    $survival=10000-$r['zero_bps'];
    if($survival===0)return 0;
    // Integer floor guarantees survival * opening <= 1 - the selected minimum edge.
    return min(self::PPM-1,intdiv((self::PPM-$r['min_house_edge_ppm'])*10000,$survival));
  }
  public static function openingAmount(int $stake,int $cap,array $r): int {
    return intdiv(min($stake,$cap)*self::openingPpm($r),self::PPM);
  }
  public static function edgeModel(array $r): array {
    $opening=self::openingPpm($r);$numerator=10000000000-$opening*(10000-$r['zero_bps']);
    return ['selected_min_edge_ppm'=>$r['min_house_edge_ppm'],'opening_return_ppm'=>$opening,
      'model_min_edge_pct'=>$numerator/100000000];
  }
  public static function maximumReachable(int $stake,int $cap,array $r): int {
    if($r['zero_bps']===10000)return 0;
    $value=self::openingAmount($stake,$cap,$r);
    if($r['movement_model']==='legacy' && $r['up_bps']===0)return $value;
    for($i=1;$i<$r['steps'] && $value>0 && $value<$cap;$i++)$value=self::move($value,$cap,$r['max_move_pct'],true);
    return $value;
  }
  /** The pool ceiling limits the ENTIRE return. Reserved return envelopes are unavailable. */
  public static function cap(int $stake,int $pool,int $reserved,int $bps,int $walletRoom=SpinMath::MAX_WALLET): int {
    return max(0,min(2*$stake,intdiv($pool*$bps,10000)-$reserved,$walletRoom));
  }
  public static function move(int $value,int $cap,int $pct,bool $up): int {
    $delta=max(1,intdiv($value*$pct,100));
    return $up?min($cap,$value+$delta):max(0,$value-$delta);
  }
  /** Randomness for real paths is exclusively random_int. The optional source is for analysis/tests. */
  public static function flight(int $stake,int $cap,array $r,?callable $random=null): array {
    if($r['movement_model']==='balanced')return self::balancedFlight($stake,$cap,$r,$random);
    $random??=static fn(int $lo,int $hi):int=>random_int($lo,$hi);
    $value=min($stake,$cap);$path=[];$offsets=[];$weights=self::weights($r);$sum=array_sum($weights);
    $advance=static function(int $current)use($random,$r,$weights,$sum,$cap,$stake):int {
      if($current===0 || $random(1,10000)<=$r['zero_bps'])return 0;
      $pick=$random(1,$sum);$pct=0;
      foreach($weights as $percentage=>$weight){$pick-=$weight;if($pick<=0){$pct=(int)$percentage;break;}}
      $up=$random(1,10000)<=$r['up_bps'];
      // The next move off the absolute maximum is always down, even under a test-only 100% up rule.
      return self::move($current,$cap,$pct,$current===2*$stake?false:$up);
    };
    for($i=0;$i<$r['steps'];$i++) {
      if($i===0)$value=$value===0 || $random(1,10000)<=$r['zero_bps']?0:self::openingAmount($stake,$cap,$r);
      else $value=$advance($value);
      $path[]=$value;$offsets[]=$i*$r['step_ms'];if($value===0)break;
      if($value===2*$stake && $r['step_ms']>self::PEAK_MS) {
        $value=$advance($value);$path[]=$value;$offsets[]=$i*$r['step_ms']+self::PEAK_MS;
        if($value===0)break;
      }
    }
    // Fixed nominal deadline avoids leaking the number/position of future peaks through duration.
    return ['path'=>$path,'offsets'=>$offsets];
  }
  /** Fair ordinary transitions. The only later negative drift is one pesewa at a funded ceiling. */
  public static function balancedTransition(int $value,int $cap,int $pct,array $r): array {
    if($value<=0)return ['zero_bps'=>10000,'down'=>0,'up'=>0,'up_numerator'=>0,'up_denominator'=>1];
    if($value===$cap)return ['zero_bps'=>0,'down'=>max(0,$value-1),'up'=>max(0,$value-1),'up_numerator'=>0,'up_denominator'=>1];
    $down=self::move($value,$cap,$pct,false);$up=self::move($value,$cap,$pct,true);
    // q <= 1 - value/up makes a fair surviving up/down draw feasible beneath the cap.
    $zero=min($r['zero_bps'],intdiv(($up-$value)*10000,$up));$survival=10000-$zero;
    return ['zero_bps'=>$zero,'down'=>$down,'up'=>$up,
      'up_numerator'=>$value*10000-$down*$survival,'up_denominator'=>($up-$down)*$survival];
  }
  private static function balancedAdvance(int $value,int $cap,array $r,callable $random,array $weights,int $sum): int {
    if($value===0)return 0;
    if($value===$cap)return max(0,$value-1);
    $pick=$random(1,$sum);$pct=0;
    foreach($weights as $percentage=>$weight){$pick-=$weight;if($pick<=0){$pct=(int)$percentage;break;}}
    $t=self::balancedTransition($value,$cap,$pct,$r);
    if($random(1,10000)<=$t['zero_bps'])return 0;
    return $random(1,$t['up_denominator'])<=$t['up_numerator']?$t['up']:$t['down'];
  }
  private static function balancedFlight(int $stake,int $cap,array $r,?callable $random): array {
    $random??=static fn(int $lo,int $hi):int=>random_int($lo,$hi);
    $weights=self::weights($r);$sum=array_sum($weights);$path=[];$offsets=[];
    $value=$cap===0 || $random(1,10000)<=$r['zero_bps']?0:self::openingAmount($stake,$cap,$r);
    for($i=0;$i<$r['steps'];$i++) {
      if($i>0)$value=self::balancedAdvance($value,$cap,$r,$random,$weights,$sum);
      $path[]=$value;$offsets[]=$i*$r['step_ms'];if($value===0)break;
      if($value===2*$stake && $r['step_ms']>self::PEAK_MS) {
        $value=max(0,$value-1);$path[]=$value;$offsets[]=$i*$r['step_ms']+self::PEAK_MS;
        if($value===0)break;
      }
    }
    return ['path'=>$path,'offsets'=>$offsets];
  }
  public static function path(int $stake,int $cap,array $r,?callable $random=null): array {
    return self::flight($stake,$cap,$r,$random)['path'];
  }
  public static function openingExpectation(int $stake,int $cap,array $r): float {
    return self::openingAmount($stake,$cap,$r)*(10000-$r['zero_bps'])/10000;
  }
  public static function transitionExpectation(int $value,int $cap,int $absoluteMax,array $r): float {
    if($r['movement_model']==='balanced') {
      if($value===0)return 0.0;
      return (float)($value===$cap?$value-1:$value);
    }
    if($value===0)return 0.0;$sum=0.0;$weights=self::weights($r);$up=$value===$absoluteMax?0:$r['up_bps'];
    foreach($weights as $pct=>$weight)$sum+=$weight*($up*self::move($value,$cap,(int)$pct,true)+(10000-$up)*self::move($value,$cap,(int)$pct,false));
    return $sum/array_sum($weights)/10000*(10000-$r['zero_bps'])/10000;
  }
  public static function preview(int $stake,int $cap,array $r,int $samples=4000): array {
    $sums=['first_offer'=>0.0,'first_profit'=>0.0,'wait_to_end'=>0.0,'target_1_5x'=>0.0];$squares=$sums;$count=0;$dipSum=0;$dipSquares=0;
    // A reproducible analysis stream, never used to generate a real round.
    $seed=hash('sha256',json_encode([$stake,$cap,$r]));$counter=0;
    $rng=static function(int $lo,int $hi)use($seed,&$counter):int{
      $range=$hi-$lo+1;$space=4503599627370496;$ceiling=intdiv($space,$range)*$range;
      do{$bytes=unpack('Nhi/Nlo',substr(hash('sha256',$seed.':'.($counter++),true),0,8));$v=($bytes['hi']&1048575)*4294967296+$bytes['lo'];}while($v>=$ceiling);
      return $lo+$v%$range;
    };
    for($i=0;$i<$samples;$i++) {
      $path=self::path($stake,$cap,$r,$rng);$last=$path[count($path)-1];$firstProfit=$last;$target=$last;$found=false;$targetFound=false;
      $dips=0;for($j=1;$j<count($path);$j++)if($path[$j-1]===$cap)$dips++;
      $dipSum+=$dips;$dipSquares+=$dips*$dips;
      foreach($path as $value){if(!$found && $value>$stake){$firstProfit=$value;$found=true;}if(!$targetFound && $value*2>=$stake*3){$target=$value;$targetFound=true;}}
      foreach(['first_offer'=>$path[0],'first_profit'=>$firstProfit,'wait_to_end'=>$last,'target_1_5x'=>$target] as $policy=>$amount){$sums[$policy]+=$amount;$squares[$policy]+=$amount*$amount;}
      $count++;
    }
    $policies=[];
    foreach($sums as $name=>$sum){$mean=$sum/$count;$variance=max(0,($squares[$name]-$count*$mean*$mean)/max(1,$count-1));$policies[$name]=['estimated_return_pct'=>$mean/$stake*100,'standard_error_pct'=>sqrt($variance/$count)/$stake*100];}
    $openingPct=self::openingExpectation($stake,$cap,$r)/$stake*100;$reachable=self::maximumReachable($stake,$cap,$r);
    $auto=$policies['wait_to_end'];$auto['estimated_edge_pct']=100-$auto['estimated_return_pct'];
    if($r['movement_model']==='balanced') {
      // Ordinary moves preserve expectation exactly. Only forced one-pesewa dips reduce it.
      // Estimate that small cost directly, avoiding payout variance in the calibration estimate.
      $meanDip=$dipSum/$count;$variance=max(0,($dipSquares-$count*$meanDip*$meanDip)/max(1,$count-1));
      $auto=['estimated_return_pct'=>$openingPct-$meanDip/$stake*100,'standard_error_pct'=>sqrt($variance/$count)/$stake*100,
        'estimated_edge_pct'=>100-$openingPct+$meanDip/$stake*100,'expected_ceiling_cost_cents'=>$meanDip];
    }
    return ['engine_version'=>self::ENGINE_VERSION,'peak_ms'=>self::PEAK_MS,'cap_cents'=>$cap,
      'movement_model'=>$r['movement_model'],'edge_model'=>self::edgeModel($r),'opening_amount_cents'=>self::openingAmount($stake,$cap,$r),'opening_return_pct'=>$openingPct,
      'stake_min_edge_pct'=>100-$openingPct,'max_reachable_cents'=>$reachable,'profit_reachable'=>$reachable>$stake,
      'automatic_finish'=>$auto,'max_ceiling_dip_cents'=>$r['movement_model']==='balanced'?2*$r['steps']:null,
      'two_x_reachable'=>$reachable===2*$stake,'policies'=>$policies,'samples'=>$count,
      'note'=>'Policy estimates are not a promised win probability. Stop timing changes returns. Balanced ordinary moves preserve their current expected value exactly. A ceiling rebound costs one pesewa. Opening rounding and pool restrictions can increase the effective edge. Accepted round randomness is independent of preview.'];
  }
}
