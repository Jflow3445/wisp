<?php
declare(strict_types=1);
// Isolate fixture rate limits from ordinary local accounts and repeated test runs.
if (!getenv('SPIN_TEST_RUNTIME')) throw new RuntimeException('Test runtime required.');
function nister_rate_limit_dir(): string {
  $runtime=realpath((string)getenv('SPIN_TEST_RUNTIME'));
  if ($runtime===false) throw new RuntimeException('Test runtime directory missing.');
  $dir=$runtime.DIRECTORY_SEPARATOR.'rate-limits';
  if (!is_dir($dir) && !mkdir($dir,0700) && !is_dir($dir)) throw new RuntimeException('Test rate-limit directory unavailable.');
  return $dir;
}
