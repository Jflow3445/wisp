<?php
declare(strict_types=1);

function admin_shell_start(string $active,string $title,string $description,array $env=[]): void {
  require_once __DIR__.'/../lib/spin/security.php';
  $h=static fn($v)=>htmlspecialchars((string)$v,ENT_QUOTES,'UTF-8');
  $links=[
    ['overview','Overview','/admin/index.php?section=overview'],
    ['billing','Billing','/admin/index.php?section=billing'],
    ['withdrawals','Withdrawals','/admin/withdrawals.php'],
    ['plans','Plans','/admin/index.php?section=plans'],
    ['users','Users','/admin/index.php?section=users'],
    ['register','Register a user','/admin/register.php'],
    ['sms','SMS gateways','/admin/sms.php'],
  ];
  if (spin_is_manager((string)($_SESSION['admin_user'] ?? ''),$env)) $links[]=['game','Game management','/admin/spin.php'];
  $links[]=['settings','Settings','/admin/index.php?section=settings'];
  $links[]=['alerts','Alerts','/admin/index.php?section=alerts'];
  $links[]=['forensics','Forensics','/admin/index.php?section=forensics'];
  ?>
  <div class="ops-shell"><header class="ops-topbar"><a class="ops-brand" href="/admin/"><span class="ops-mark" aria-hidden="true"><i></i><i></i><i></i></span><span>Nister <strong>Admin</strong><small>NETWORK OPERATIONS</small></span></a><div class="ops-top-actions"><span class="ops-session">Secure administrator session</span><a href="/admin/index.php?logout=1">Sign out <span aria-hidden="true">↗</span></a></div></header>
  <div class="ops-layout"><aside class="ops-sidebar"><p class="ops-nav-label">WORKSPACE</p><nav aria-label="Admin sections"><?php foreach ($links as [$key,$label,$href]): ?><a href="<?=$h($href)?>" <?=$key===$active?'aria-current="page"':''?>><span><?=$h($label)?></span><span aria-hidden="true" class="ops-nav-arrow">↗</span></a><?php endforeach; ?></nav><div class="ops-sidebar-note"><span class="ops-status-dot"></span> Nister Wi-Fi<p>Customer access and billing remain in your main console.</p></div></aside>
  <main class="ops-content" id="ops-content"><header class="ops-page-heading"><div><p class="ops-eyebrow">NISTER / OPERATIONS</p><h1><?=$h($title)?></h1><p><?=$h($description)?></p></div><a class="ops-back" href="/admin/">Main console <span aria-hidden="true">↗</span></a></header>
  <?php
}

function admin_shell_end(): void { echo '</main></div><footer class="ops-footer">Nister Wi-Fi <span>Connected operations. One workspace.</span></footer></div>'; }
