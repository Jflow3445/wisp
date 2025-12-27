<?php
declare(strict_types=1);
require_once __DIR__.'/common.php';
$ENV = app_boot();
$PDO = db_pdo($ENV);
