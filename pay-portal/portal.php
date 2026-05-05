<?php
declare(strict_types=1);

require_once __DIR__.'/lib/user_auth.php';
user_boot();
user_require_login();
$loginHref = '/login.php';
$siteCode = location_session_get_code();
if ($siteCode !== null && $siteCode !== '') {
  $loginHref .= '?location_code='.rawurlencode($siteCode);
}

$indexPath = __DIR__.'/index.php';
if (is_file($indexPath)) {
  require $indexPath;
  exit;
}
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Nister WiFi | Portal</title>
  <style>
    :root{
      --bg:#f4f1ea;--ink:#1c2329;--muted:#5f6a76;--accent:#0f766e;--card:#fffdfa;--line:#e2d6c8;--shadow:0 20px 60px rgba(27,35,42,.12);--radius:18px;--font:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
    }
    *{box-sizing:border-box}
    body{margin:0;font-family:var(--font);background:linear-gradient(180deg,var(--bg) 0%,#efe8de 100%);color:var(--ink);min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
    .card{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);padding:24px;box-shadow:var(--shadow);width:min(520px,100%)}
    h1{margin:0 0 8px}
    p{margin:0 0 14px}
    .muted{color:var(--muted)}
    .row{display:flex;gap:10px;flex-wrap:wrap}
    .btn{display:inline-flex;align-items:center;justify-content:center;padding:10px 14px;border-radius:12px;text-decoration:none;font-weight:600;border:1px solid var(--line);color:var(--ink);background:#fff}
    .btn.primary{background:linear-gradient(135deg,var(--accent),#0f8a7f);border-color:transparent;color:#fff}
  </style>
</head>
<body>
  <div class="card">
    <h1>Portal is unavailable</h1>
    <p class="muted">Login succeeded, but the portal home page is missing on this server.</p>
    <p class="muted">Use the actions below while the deployment is being corrected.</p>
    <div class="row">
      <a class="btn primary" href="<?=htmlspecialchars($loginHref, ENT_QUOTES, 'UTF-8')?>">Open login</a>
      <a class="btn" href="/logout.php">Logout</a>
      <a class="btn" href="/me.php">Account API</a>
    </div>
  </div>
</body>
</html>
