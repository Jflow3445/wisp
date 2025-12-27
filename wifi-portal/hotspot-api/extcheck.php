<?php header('Content-Type:text/plain');
echo "SAPI=".php_sapi_name()."\n";
echo "pdo_mysql=".(extension_loaded('pdo_mysql')?'yes':'no')."\n";
