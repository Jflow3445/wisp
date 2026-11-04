<?php
declare(strict_types=1);
// Used only by the extracted shell functions in idempotence.php.
$dsn=(string)getenv('QUOTA_TEST_DSN');
if ($dsn!=='mysql:host=127.0.0.1;port=33079;dbname=nister_quota_storage_test;charset=utf8mb4') throw new RuntimeException('Isolated quota fixture required');
$db=new PDO($dsn,'root','spin-test-only',[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
$sql=stream_get_contents(STDIN);
if (($argv[1] ?? '')==='one') {
  $value=$db->query($sql)->fetchColumn();
  if ($value!==false) echo $value.PHP_EOL;
} else $db->exec($sql);
