<?php
require __DIR__.'/app/common/includes/daloradius.conf.php';
$mysqli = @new mysqli($configValues['CONFIG_DB_HOST'], $configValues['CONFIG_DB_USER'],
                      $configValues['CONFIG_DB_PASS'], $configValues['CONFIG_DB_NAME']);
if ($mysqli->connect_error) { http_response_code(500); die("DB FAIL: ".$mysqli->connect_error); }
$r = $mysqli->query("SELECT COUNT(*) FROM operators");
$n = $r ? $r->fetch_row()[0] : 'n/a';
echo "DB OK, operators=".$n;
