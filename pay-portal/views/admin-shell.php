<?php
declare(strict_types=1);

function admin_shell_start(string $active,string $title,array $env=[]): void {
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
  <div class="ops-shell"><a class="ops-skip" href="#ops-content">Skip to content</a><header class="ops-topbar"><a class="ops-brand" href="/admin/"><span class="ops-mark" aria-hidden="true"><i></i><i></i><i></i></span><span>Nister <strong>Admin</strong></span></a><div class="ops-top-actions"><a href="/admin/index.php?logout=1">Sign out <span aria-hidden="true">↗</span></a></div></header>
  <div class="ops-layout"><aside class="ops-sidebar"><nav aria-label="Admin sections"><?php foreach ($links as [$key,$label,$href]): ?><a href="<?=$h($href)?>" <?=$key===$active?'aria-current="page"':''?>><span><?=$h($label)?></span><span aria-hidden="true" class="ops-nav-arrow">↗</span></a><?php endforeach; ?></nav></aside>
  <main class="ops-content" id="ops-content"><header class="ops-page-heading"><div><h1><?=$h($title)?></h1></div><a class="ops-back" href="/admin/">Main console <span aria-hidden="true">↗</span></a></header>
  <?php
}

function admin_shell_end(): void { echo '</main></div><footer class="ops-footer">Nister Wi-Fi </footer></div>'; }
