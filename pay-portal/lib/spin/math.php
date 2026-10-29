<?php
declare(strict_types=1);

final class SpinError extends RuntimeException {
  public function __construct(public string $errorCode, string $message, public int $httpStatus = 409) {
    parent::__construct($message);
  }
}

/** Monetary amounts are integer pesewas. Percentages are whole %, odds/exposure are basis points. */
final class SpinMath {
  public const MAX_MONEY = 1000000000000;
  public const MAX_WALLET = 2147483647;
  public static function integer(mixed $v, int $min, int $max, string $name): int {
    if (!is_int($v) || $v < $min || $v > $max) throw new SpinError('invalid_input', "Invalid $name.", 422);
    return $v;
  }
  public static function rules(array $r): array {
    $keys = ['win_bps','min_bonus_pct','max_bonus_pct','distribution','weights','pool_bps',
      'min_stake_cents','daily_stake_cents','daily_loss_cents','interval_seconds','delivery_cost_bps'];
    // Retain readable historical versions; the old per-spin maximum no longer controls play.
    unset($r['max_stake_cents']);
    if (array_diff(array_keys($r), $keys) || array_diff($keys, array_keys($r))) throw new SpinError('invalid_rules', 'Supply the complete supported rule set.', 422);
    foreach (['win_bps'=>[0,10000], 'min_bonus_pct'=>[1,100], 'max_bonus_pct'=>[1,100], 'pool_bps'=>[1,10000],
      'min_stake_cents'=>[1,self::MAX_WALLET],
      'daily_stake_cents'=>[0,self::MAX_WALLET], 'daily_loss_cents'=>[0,self::MAX_WALLET],
      'interval_seconds'=>[0,3600], 'delivery_cost_bps'=>[0,10000]] as $k=>$range) self::integer($r[$k], $range[0], $range[1], $k);
    if ($r['min_bonus_pct'] > $r['max_bonus_pct']) throw new SpinError('invalid_rules', 'Rule boundaries are inconsistent.', 422);
    if (!in_array($r['distribution'], ['uniform','weighted'], true) || !is_array($r['weights'])) throw new SpinError('invalid_rules', 'Choose uniform or weighted bonuses.', 422);
    $weights = [];
    if ($r['distribution'] === 'uniform') {
      if ($r['weights'] !== []) throw new SpinError('invalid_rules', 'Uniform bonuses do not take weights.', 422);
    } else {
      foreach ($r['weights'] as $pct=>$weight) {
        if (!preg_match('/^[1-9][0-9]{0,2}$/', (string)$pct) || (int)$pct < $r['min_bonus_pct'] || (int)$pct > $r['max_bonus_pct']) throw new SpinError('invalid_rules', 'Bonus weight outside the advertised range.', 422);
        $weights[(int)$pct] = self::integer($weight, 1, 100000, 'weight');
      }
      if (!$weights || !isset($weights[$r['min_bonus_pct']], $weights[$r['max_bonus_pct']]) || array_sum($weights) > 1000000) throw new SpinError('invalid_rules', 'Weighted bonuses must include both advertised endpoints; total weight at most 1,000,000.', 422);
      ksort($weights, SORT_NUMERIC);
    }
    $r['weights'] = $weights;
    $out = []; foreach ($keys as $k) $out[$k] = $r[$k];
    return $out;
  }
  public static function weights(array $r): array {
    return $r['distribution'] === 'weighted' ? $r['weights'] : array_fill_keys(range($r['min_bonus_pct'], $r['max_bonus_pct']), 1);
  }
  public static function ceiling(int $pool, array $r): int { return intdiv($pool * $r['pool_bps'], 10000); }
  public static function minimum(int $stake, array $r): int { return intdiv($stake * $r['min_bonus_pct'] + 99, 100); }
  public static function bonus(int $stake, int $pool, int $pct, array $r): int {
    $cap = self::ceiling($pool, $r);
    $min = self::minimum($stake, $r);
    if ($cap < $min) throw new SpinError('pool_minimum_unavailable', 'The pool cannot support the advertised minimum bonus for this stake. No funds were charged.');
    return min(max($min, intdiv($stake * $pct, 100)), $cap);
  }
  /** Exact enumeration includes the current pool cap, actual stake, weights and currency rounding. */
  public static function expectation(int $stake, int $pool, array $r): array {
    $weighted = 0; $total = 0;
    foreach (self::weights($r) as $pct=>$weight) {
      $weighted += self::bonus($stake, $pool, (int)$pct, $r) * $weight;
      $total += $weight;
    }
    $mean = $weighted / $total;
    $rtp = ($r['win_bps'] / 10000) * ($stake + $mean) / $stake * 100;
    return ['expected_bonus_if_win_cents'=>$mean, 'rtp_pct'=>$rtp, 'house_edge_pct'=>100-$rtp,
      'basis'=>'Expected wallet return at the selected stake and current pool.',
      'min_bonus_cents'=>self::minimum($stake,$r), 'max_bonus_cents'=>self::bonus($stake,$pool,$r['max_bonus_pct'],$r)];
  }
  public static function draw(array $r): array {
    if (random_int(1,10000) > $r['win_bps']) return ['outcome'=>'loss','bonus_pct'=>0];
    $weights = self::weights($r); $pick = random_int(1,array_sum($weights));
    foreach ($weights as $pct=>$weight) { $pick -= $weight; if ($pick <= 0) return ['outcome'=>'win','bonus_pct'=>(int)$pct]; }
    throw new LogicException('Invalid distribution');
  }
}
