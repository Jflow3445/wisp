<div class="card withdrawal-card" id="wallet-withdrawals" data-csrf="<?=htmlspecialchars(withdrawal_csrf(),ENT_QUOTES,'UTF-8')?>" data-account="<?=htmlspecialchars(hash('sha256',user_msisdn()),ENT_QUOTES,'UTF-8')?>">
  <div class="card-head"><h3>Withdraw to MoMo</h3><span class="pill soft">Manual payout</span></div>
  <p class="muted">Withdrawals are processed during working hours, within a maximum of 48 hours.</p>
  <p class="sub">Minimum withdrawal: <strong id="withdrawal-minimum">Loading…</strong>. Funds are held when you request a withdrawal.</p>
  <div class="withdrawal-summary" aria-label="Withdrawal balances"><div><span>Available to withdraw</span><strong id="withdrawal-available">—</strong></div><div><span>Awaiting payout</span><strong id="withdrawal-held">—</strong></div></div>
  <form id="withdrawal-form" class="withdrawal-form">
    <label>Account number (registered phone)<input class="input" name="account_number" id="withdrawal-phone" type="tel" autocomplete="tel" required readonly value="<?=htmlspecialchars(user_msisdn_display(),ENT_QUOTES,'UTF-8')?>"></label>
    <label>MoMo account name<input class="input" name="name" autocomplete="name" required minlength="2" maxlength="120" placeholder="Full name on the MoMo account"></label>
    <label>MoMo network<select class="input" name="network" required><option value="">Choose network</option><option value="MTN">MTN MoMo</option><option value="TELECEL">Telecel Cash</option><option value="AT">AT Money</option></select></label>
    <label>Amount (GHS)<input class="input" name="amount" inputmode="decimal" autocomplete="off" required pattern="[0-9]+([.][0-9]{1,2})?" placeholder="100.00"></label>
    <div class="withdrawal-form-actions"><button class="btn primary" type="submit" id="withdrawal-submit" disabled>Request withdrawal</button><button class="btn outline" type="button" id="withdrawal-refresh">Refresh requests</button></div>
  </form>
  <p class="withdrawal-message" id="withdrawal-message" role="status" hidden></p>
  <h4>Your withdrawals</h4><div id="withdrawal-history" class="withdrawal-history" aria-live="polite">Loading your requests…</div>
</div>
