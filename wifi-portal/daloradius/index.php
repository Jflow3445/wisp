<?php
$targets = [
  'app/operators/login.php',  // new layout
  'app/login.php',            // fallback
  'login.php'                 // very old layout
];
foreach ($targets as $t) {
  if (file_exists(__DIR__ . '/' . $t)) {
    header('Location: ' . $t, true, 302);
    exit;
  }
}
http_response_code(500);
echo "daloRADIUS login not found.";
