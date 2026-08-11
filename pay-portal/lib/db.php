<?php
declare(strict_types=1);
require_once __DIR__.'/common.php';
if (isset($GLOBALS['PDO']) && $GLOBALS['PDO'] instanceof PDO) {
  $PDO = $GLOBALS['PDO'];
  $ENV = (isset($GLOBALS['ENV']) && is_array($GLOBALS['ENV'])) ? $GLOBALS['ENV'] : [];
} else {
  $ENV = app_boot();
  $PDO = db_pdo($ENV);
}
