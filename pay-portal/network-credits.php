<?php
declare(strict_types=1);
require_once __DIR__.'/lib/user_auth.php';
require_once __DIR__.'/lib/spin/http.php';
spin_headers();$env=user_boot();user_require_login();
try { (new SpinService(db_pdo($env),$env))->consolidateCredits(normalize_msisdn(user_msisdn())); }
catch(Throwable $e) { error_log('[spin] legacy_wallet_transfer_deferred'); }
header('Location: /#activity_section');
