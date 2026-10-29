const { test, expect } = require('../../nister-org/node_modules/@playwright/test');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const php = process.env.SPIN_TEST_PHP || 'php';
function control(action) { return JSON.parse(execFileSync(php, ['-d', 'extension=pdo_mysql', path.join(__dirname, 'web_control.php'), action], { encoding: 'utf8' })); }
async function login(page) {
  await page.goto('/login.php'); await page.locator('input[name="msisdn"]').fill('0201234567'); await page.locator('input[name="password"]').fill('test-customer-password');
  await Promise.all([page.waitForURL(/portal\.php/), page.getByRole('button', { name: 'Open my portal', exact: true }).click()]);
}
async function adminLogin(page) {
  await page.goto('/admin/login.php'); await page.locator('#u').fill('operator'); await page.locator('#p').fill('test-operator-password');
  await Promise.all([page.waitForURL(/admin\/index\.php/), page.getByRole('button', { name: 'Sign in', exact: true }).click()]);
  await page.goto('/admin/spin.php'); await expect(page.locator('#admin-state')).toHaveText('ACTIVE');
  await page.locator('[data-tab="rules"]').click();
}
test('admin previews unsaved minimum edge and the server rejects unsafe or malformed drafts', async ({ page }, info) => {
  await adminLogin(page);
  const before = (await (await page.request.get('/admin/spin-api.php')).json()).dashboard;
  await expect(page.locator('#min-house-edge')).toHaveValue('5.0000');
  await page.locator('#min-house-edge').fill('10.0000'); await page.locator('[name="zero_bps"]').fill('150');
  await expect(page.locator('#edge-summary')).toContainText('Derived nonzero opening: 91.3705%');
  const calculated = page.waitForResponse(r => r.url().endsWith('/admin/spin-api.php') && r.request().postDataJSON()?.action === 'preview');
  await page.locator('#preview-form button').click(); const response = await calculated;
  expect(response.status()).toBe(200); const preview = (await response.json()).preview;
  expect(preview.edge_model.selected_min_edge_ppm).toBe(100000); expect(preview.edge_model.opening_return_ppm).toBe(913705);
  expect(preview.opening_amount_cents).toBe(913); expect(preview.stake_min_edge_pct).toBeGreaterThanOrEqual(10);
  await expect(page.locator('#preview-result')).toContainText('91.3705%');
  await expect(page.locator('#preview-result')).toContainText('GHS 9.13');
  const after = (await (await page.request.get('/admin/spin-api.php')).json()).dashboard;
  expect(after.state.flight_config_id).toBe(before.state.flight_config_id);
  expect(after.state.audit_head).toBe(before.state.audit_head); expect(after.rules).toEqual(before.rules);
  const csrf = await page.locator('#spin-admin').getAttribute('data-csrf');
  const headers = { Origin: new URL(page.url()).origin, 'X-CSRF-Token': csrf };
  const omitted = { ...before.rules }; delete omitted.min_house_edge_ppm;
  for (const rules of [{ ...before.rules, min_house_edge_ppm: -1 }, { ...before.rules, min_house_edge_ppm: 1000000 },
    { ...before.rules, min_house_edge_ppm: '100000' }, { ...before.rules, up_bps: 5001 }, { ...before.rules, unknown: 1 }, omitted]) {
    const denied = await page.request.post('/admin/spin-api.php', { headers, data: { action: 'preview', stake_cents: 1000, rules } });
    expect(denied.status()).toBe(422);
  }
  expect((await page.request.post('/admin/spin-api.php', { headers: { Origin: new URL(page.url()).origin }, data: { action: 'preview', rules: before.rules, stake_cents: 1000 } })).status()).toBe(419);
  await page.screenshot({ path: path.resolve(__dirname, '../../artifacts/spin/admin-house-edge-' + info.project.name + '.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
});
test('admin edge activation requires review and the existing admin session, persists, and changes subsequent openings', async ({ page }) => {
  await adminLogin(page);
  const before = (await (await page.request.get('/admin/spin-api.php')).json()).dashboard;
  await page.locator('#min-house-edge').fill('10.0000');
  await page.locator('[name="step_ms"]').fill('3000');
  await page.locator('#rules-form button[type="submit"]').click();
  await expect(page.locator('#admin-confirm')).toBeVisible();
  await expect(page.locator('#admin-change-preview')).toContainText('Selected minimum expected edge: 10.0000%');
  await expect(page.locator('#admin-change-preview')).toContainText('Derived nonzero opening: 90.0000%');
  expect((await (await page.request.get('/admin/spin-api.php')).json()).dashboard.state.flight_config_id).toBe(before.state.flight_config_id);
  await page.locator('#admin-reason').fill('Browser QA explicit ten percent minimum expected edge');
  await expect(page.locator('#admin-mfa')).toHaveCount(0);
  await page.locator('#admin-apply').click();
  await expect(page.locator('#admin-confirm')).toBeHidden(); await expect(page.locator('#admin-message')).toContainText('Change recorded.');
  const saved = (await (await page.request.get('/admin/spin-api.php')).json()).dashboard;
  expect(saved.rules.min_house_edge_ppm).toBe(100000); expect(saved.state.flight_config_id).not.toBe(before.state.flight_config_id);
  await page.reload(); await expect(page.locator('#admin-state')).toHaveText('ACTIVE'); await page.locator('[data-tab="rules"]').click();
  await expect(page.locator('#min-house-edge')).toHaveValue('10.0000');
  await login(page); await page.goto('/spin.php'); await firstSpin(page, '10.00');
  await expect(page.locator('#flight-multiplier')).toHaveText('0.90x');
  await expect(page.locator('#flight-return')).toHaveText('GHS 9.00 current return');
  await page.locator('#collect-flight').click(); await expect(page.locator('#cash-balance')).toHaveText('GHS 999.00');
});
async function firstSpin(page, amount = '5.00') {
  await page.locator('#stake').fill(amount); await page.locator('#review-stake').click();
  await expect(page.locator('#confirm-dialog')).toBeVisible(); await expect(page.locator('#confirm-spin')).toBeDisabled();
  await expect(page.locator('#confirm-dialog')).not.toContainText(/funding|pool|configuration/i);
  await page.locator('#ack-risk').check(); await page.locator('#confirm-spin').click();
}
test.beforeEach(async ({ page }) => {
  control('reset');
  await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, route => route.abort());
});
test('existing WISP users play with their current login and wallet without game registration', async ({ page }) => {
  control('existing-user');await login(page);const before=control('account-integration');
  await page.goto('/spin.php');await expect(page.locator('#review-stake')).toBeEnabled();
  await expect(page.locator('#account-number')).toHaveText('0201234567');
  await firstSpin(page,'10.00');await expect(page.locator('#cash-balance')).toHaveText('GHS 990.00');
  await page.locator('#collect-flight').click();await expect(page.locator('#result')).toBeVisible();
  const after=control('account-integration');expect(after.wallets).toBe(before.wallets);expect(after.credentials).toBe(before.credentials);
  expect(after.game_birth_date).toBeNull();expect(after.game_verified).toBeNull();expect(control('consents')).toBe(1);
  await page.goto('/');await expect(page.locator('[data-spin-discovery]')).toBeVisible();
});
test('a direct game link returns to Flight through the existing WISP login', async ({ page }) => {
  await page.goto('/spin.php');await expect(page).toHaveURL(/\/login\.php/);
  await page.locator('input[name="msisdn"]').fill('0201234567');await page.locator('input[name="password"]').fill('test-customer-password');
  await Promise.all([page.waitForURL(/\/spin\.php$/),page.getByRole('button',{name:'Open my portal',exact:true}).click()]);
  await expect(page.locator('#account-number')).toHaveText('0201234567');await expect(page.locator('#review-stake')).toBeEnabled();
});

test('Flight uses the WISP portal shell and keeps account navigation connected', async ({ page }, info) => {
  await login(page); await page.goto('/portal.php');
  const shellStyles = () => ['body','.user-topbar','.user-topbar .brand-text .name','.user-topbar .brand-text .tag','.nister-global-nav','.nister-global-nav a.active','.user-top-actions','.user-top-actions .btn.ghost','.user-layout','.user-menu-card','.menu-title','.user-menu','.user-menu .btn.active','.user-menu .btn:not(.active)','.user-pocket'].map(selector => {
    const css = getComputedStyle(document.querySelector(selector));
    return {selector,styles:Object.fromEntries(['fontFamily','fontSize','fontWeight','lineHeight','color','backgroundImage','backgroundColor','borderRadius','padding','gap','display','gridTemplateColumns'].map(key => [key,css[key]]))};
  });
  const portal = await page.evaluate(shellStyles);
  await page.screenshot({path:path.resolve(__dirname,'../../artifacts/spin/wisp-portal-'+info.project.name+'.png'),fullPage:true});
  await page.locator('[data-spin-discovery]').click(); await expect(page).toHaveURL(/\/spin\.php$/);
  await expect(page.locator('#review-stake')).toBeEnabled();
  await page.mouse.move(0,0);
  expect(await page.evaluate(shellStyles)).toEqual(portal);
  await expect(page.locator('.user-menu [aria-current="page"]')).toHaveText('Flight');
  expect(await page.locator('.user-menu [aria-current="page"]').evaluate(el => {
    const active=el.getBoundingClientRect(),menu=el.parentElement.getBoundingClientRect();
    return active.left>=menu.left && active.right<=menu.right;
  })).toBeTruthy();
  await expect(page.locator('.user-top-actions')).toContainText('Top up');
  await page.screenshot({path:path.resolve(__dirname,'../../artifacts/spin/flight-portal-'+info.project.name+'.png'),fullPage:true});
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.locator('.user-menu a', {hasText:/^Wallet$/}).click();
  await expect(page).toHaveURL(/\/portal\.php#wallet_section$/); await expect(page.locator('#wallet_section')).toBeVisible();
  await page.goto('/spin.php');await page.locator('.user-menu a', {hasText:/^Rewards$/}).click();
  await expect(page).toHaveURL(/\/portal\.php#rewards_section$/);await expect(page.locator('#rewards_section')).toBeVisible();
});
test('one consent, held stake, exact collection, refresh recovery and account theme', async ({ page }, info) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const logins = control('login-events'); await login(page); await page.goto('/spin.php');
  await expect(page.locator('#game-state')).toHaveText('Ready to fly'); expect(control('login-events')).toBe(logins);
  await expect(page.locator('#account-number')).toHaveText('0201234567');
  await expect(page.locator('.game-intro h1')).toHaveCSS('color', 'rgb(28, 35, 41)');
  await expect(page.locator('#cash-balance')).toHaveText('GHS 1000.00');
  await expect(page.locator('#stake')).not.toHaveAttribute('max');
  const text = await page.locator('body').innerText();
  for (const hidden of ['Win chance', 'Configuration v', 'Play within your limits', 'Network credits', '50%', 'available funding']) expect(text).not.toContain(hidden);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await firstSpin(page, '10.00');
  await expect(page.locator('#held-balance')).toHaveText('GHS 10.00 stake held');
  await expect(page.locator('#cash-balance')).toHaveText('GHS 990.00');
  await page.reload();
  await expect(page.locator('#collect-flight')).toBeEnabled();
  await expect(page.locator('#confirm-dialog')).toBeHidden();
  fs.mkdirSync(path.resolve(__dirname, '../../artifacts/spin'), { recursive: true });
  await page.screenshot({ path: path.resolve(__dirname, '../../artifacts/spin/flight-' + info.project.name + '.png'), fullPage: true });
  const collected = page.waitForResponse(r => r.url().endsWith('/spin-api.php') && r.request().method() === 'POST' && r.request().postDataJSON()?.action === 'collect');
  await page.locator('#collect-flight').click(); const response = await collected; expect(response.status()).toBe(200);
  const view = (await response.json()).flight;
  expect(view.status).toBe('SETTLED'); expect(view.wallet_cents).toBe(99000 + Number(view.receipt.payout_cents));
  await expect(page.locator('#result')).toContainText('returned to your wallet');
  await expect(page.locator('#cash-balance')).toHaveText('GHS ' + (view.wallet_cents / 100).toFixed(2));
  await expect(page.locator('#review-stake')).toBeEnabled();
  await page.locator('#stake').fill('20.00'); await page.locator('#review-stake').click();
  await expect(page.locator('#confirm-dialog')).toBeHidden(); await expect(page.locator('#collect-flight')).toBeEnabled();
  expect(control('consents')).toBe(1);
  await page.locator('#collect-flight').click(); await expect(page.locator('#review-stake')).toBeEnabled();
  expect(errors).toEqual([]);
});
test('full loss recovers a lost start response without another charge', async ({ page }) => {
  control('loss'); await page.emulateMedia({ reducedMotion: 'reduce' }); await login(page); await page.goto('/spin.php');
  let interrupted = false;
  await page.route('**/spin-api.php', async route => {
    if (!interrupted && route.request().method() === 'POST' && route.request().postDataJSON().action === 'start') {
      interrupted = true; const response = await route.fetch(); expect(response.status()).toBe(200); await route.abort('connectionreset');
    } else await route.continue();
  });
  await firstSpin(page, '10.00'); await expect(page.locator('#pending-box')).toBeVisible();
  await page.reload(); await expect(page.locator('#result')).toContainText('Flight ended at zero');
  await expect(page.locator('#cash-balance')).toHaveText('GHS 990.00');
  expect(control('balances').cash).toBe(99000); expect(control('balances').credit ?? 0).toBe(0);
  await expect(page.locator('#pending-box')).toBeHidden(); await expect(page.locator('#review-stake')).toBeEnabled();
  await page.locator('#stake').fill('5.00'); await page.locator('#review-stake').click();
  await expect(page.locator('#confirm-dialog')).toBeHidden(); await expect(page.locator('#cash-balance')).toHaveText('GHS 985.00');
});
test('opening below the stake cannot be turned into instant profit by immediate collection', async ({ page }) => {
  await login(page); await page.goto('/spin.php'); await firstSpin(page, '10.00');
  await expect(page.locator('#flight-multiplier')).toHaveText('0.95x');
  await expect(page.locator('#flight-return')).toHaveText('GHS 9.50 current return');
  await expect(page.locator('#collect-flight')).toHaveAttribute('data-outcome', 'loss');
  await expect(page.locator('#collect-flight')).toHaveCSS('background-color', 'rgb(162, 103, 33)');
  await page.locator('#collect-flight').click();
  await expect(page.locator('#cash-balance')).toHaveText('GHS 999.50');
  await expect(page.locator('#result')).toContainText('GHS 9.50 returned.');
  await expect(page.locator('.wallet-equation')).toContainText('GHS 1000.00 − GHS 10.00 stake + GHS 9.50 returned = GHS 999.50');
});
test('receipt separates another wallet purchase from the flight return', async ({ page }) => {
  control('limits'); await login(page); await page.goto('/spin.php'); await firstSpin(page, '10.00');
  await expect(page.locator('#held-balance')).toHaveText('GHS 10.00 stake held');
  const result = await page.evaluate(async () => {
    const response = await fetch('/purchase.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan_code: 'PLAN_TEST' }) });
    return { status: response.status, data: await response.json() };
  });
  expect(result.status).toBe(200); expect(result.data.status).toBe('applied');
  const collected = page.waitForResponse(r => r.url().endsWith('/spin-api.php') && r.request().method() === 'POST' && r.request().postDataJSON()?.action === 'collect');
  await page.locator('#collect-flight').click(); const view = (await (await collected).json()).flight;
  await expect(page.locator('#result')).toBeVisible();
  await expect(page.locator('.wallet-equation')).toContainText('GHS 5.00 other activity');
  expect(view.wallet_movement.other_activity_cents).toBe(-500);
  await expect(page.locator('#cash-balance')).toHaveText('GHS ' + ((98500 + Number(view.receipt.payout_cents)) / 100).toFixed(2));
  await expect(page.locator('.return-breakdown')).toContainText('Total credited');
});
test('read/start flooding cannot consume the collection quota', async ({ page }) => {
  control('limits'); await login(page); await page.goto('/spin.php');
  const response = page.waitForResponse(r => r.url().endsWith('/spin-api.php') && r.request().method() === 'POST' && r.request().postDataJSON()?.action === 'start');
  await firstSpin(page, '10.00'); const view = (await (await response).json()).flight;
  control('exhaust-game-reads-starts');
  const result = await page.evaluate(async view => {
    const headers = { 'Content-Type': 'application/json', 'X-CSRF-Token': document.querySelector('#spin-app').dataset.csrf };
    const post = data => fetch('/spin-api.php', { method: 'POST', headers, body: JSON.stringify(data) });
    const starts = [post({ action: 'start', stake_cents: 1000, request_key: crypto.randomUUID() }).then(r => r.status)];
    const reads = [fetch('/spin-api.php?action=flight&id=' + view.id).then(r => r.status)];
    const [startStatuses, readStatuses] = await Promise.all([Promise.all(starts), Promise.all(reads)]);
    const collect = await post({ action: 'collect', round_id: view.id, offer_id: view.offer.id, request_key: crypto.randomUUID() });
    return { startStatuses, readStatuses, status: collect.status, data: await collect.json() };
  }, view);
  expect(result.startStatuses).toContain(429); expect(result.readStatuses).toContain(429);
  expect(result.status).toBe(200); expect(result.data.flight.status).toBe('SETTLED');
  expect(control('balances').cash).toBe(99000 + Number(result.data.flight.receipt.payout_cents));
});
test('near-2x values do not round to 2x and forged client amounts cannot raise a payout', async ({ page }) => {
  control('limits'); await login(page); await page.goto('/spin.php');
  const realOffers = new Map();
  await page.route(/\/spin-api\.php(?:\?|$)/, async route => {
    if ((route.request().method() === 'POST' && route.request().postDataJSON().action === 'start') || (route.request().method() === 'GET' && route.request().url().includes('action=flight'))) {
      const response = await route.fetch(); const data = await response.json();
      if (data.flight?.offer) {
        realOffers.set(data.flight.offer.id, data.flight.offer.amount_cents);
        data.flight.offer.amount_cents = 1999; data.flight.history[data.flight.history.length - 1] = 1999; // Malicious client view, not a server offer.
      }
      await route.fulfill({ response, json: data });
    } else await route.continue();
  });
  await firstSpin(page, '10.00');
  await expect(page.locator('#flight-multiplier')).toHaveText('≈ 1.99x');
  await expect(page.locator('#collect-flight')).toHaveAttribute('data-outcome', 'profit');
  await expect(page.locator('#collect-flight')).toHaveCSS('background-image', /linear-gradient/);
  await expect(page.locator('#collect-breakdown')).toContainText('GHS 10.00 stake + GHS 9.99 profit');
  const forged = await page.evaluate(async () => {
    const app = document.querySelector('#spin-app');
    const current = await (await fetch('/spin-api.php?action=flight')).json();
    const response = await fetch('/spin-api.php', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': app.dataset.csrf },
      body: JSON.stringify({ action: 'collect', round_id: current.flight.id, offer_id: current.flight.offer.id, payout_cents: 1999, request_key: crypto.randomUUID() }) });
    return response.status;
  });
  expect(forged).toBe(422); expect(control('balances').cash).toBe(99000);
  const collected = page.waitForResponse(r => r.url().endsWith('/spin-api.php') && r.request().method() === 'POST' && r.request().postDataJSON()?.action === 'collect' && !r.request().postDataJSON()?.payout_cents);
  await page.locator('#collect-flight').click(); const receipt = (await (await collected).json()).flight.receipt;
  expect(Number(receipt.payout_cents)).toBe(realOffers.get(receipt.collected_offer_id));
  expect(Number(receipt.payout_cents)).not.toBe(1999); await expect(page.locator('#result')).toBeVisible();
});
test('plane coasts, banks through climbs and dips, and freezes during collection', async ({ page }) => {
  await login(page); await page.goto('/spin.php'); await expect(page.locator('#game-state')).toHaveText('Ready to fly');
  await page.evaluate(() => {
    const now = Date.now();
    window.motionTest = new window.NisterFlightMotion(document.querySelector('#flight-stage'));
    window.motionView = { id: 'motion-only', status: 'ACTIVE', stake_cents: 1000, start_ms: now, end_ms: now + 20000, server_ms: now, step_ms: 5000,
      offer: { id: 'first', amount_cents: 800, expires_ms: now + 5000 }, history: [800] };
    window.motionTest.update(window.motionView);
  });
  const start = await page.locator('#flight-plane').getAttribute('transform');
  const acceleration = await page.evaluate(() => {
    const m = window.motionTest, v = window.motionView;
    return { early: m.progress(v.start_ms + 500) - m.progress(v.start_ms), late: m.progress(v.end_ms) - m.progress(v.end_ms - 500),
      start: m.progress(v.start_ms), end: m.progress(v.end_ms), duration: v.end_ms - v.start_ms };
  });
  expect(acceleration.late).toBeGreaterThan(acceleration.early * 2);
  expect(acceleration.start).toBe(80); expect(acceleration.end).toBe(630); expect(acceleration.duration).toBe(20000);
  await page.waitForTimeout(180); expect(await page.locator('#flight-plane').getAttribute('transform')).not.toBe(start);
  await expect(page.locator('#flight-trail')).toHaveAttribute('d', /C/);
  await page.evaluate(() => { window.motionView.offer.amount_cents = 1500; window.motionView.server_ms = Date.now(); window.motionTest.update(window.motionView); });
  await expect.poll(async () => Number((await page.locator('#flight-plane').getAttribute('transform')).match(/rotate\(([-.\d]+)\)/)[1])).toBeLessThan(-2);
  await page.evaluate(() => { window.motionView.offer.amount_cents = 200; window.motionView.server_ms = Date.now(); window.motionTest.update(window.motionView); });
  await expect.poll(async () => Number((await page.locator('#flight-plane').getAttribute('transform')).match(/rotate\(([-.\d]+)\)/)[1])).toBeGreaterThan(2);
  await page.evaluate(() => window.motionTest.freeze(true));
  const held = await page.locator('#flight-plane').getAttribute('transform');
  await page.waitForTimeout(180); expect(await page.locator('#flight-plane').getAttribute('transform')).toBe(held);
  expect(control('balances').cash).toBe(100000); // Rendering never places a stake.
});
test('reduced motion keeps the plane still between real collectable offers', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await login(page); await page.goto('/spin.php'); await firstSpin(page);
  await expect(page.locator('#collect-flight')).toBeEnabled();
  const position = await page.locator('#flight-plane').getAttribute('transform');
  await page.waitForTimeout(200);
  expect(await page.locator('#flight-plane').getAttribute('transform')).toBe(position);
  await expect(page.locator('.flight-wind path').first()).toHaveCSS('animation-name', 'none');
  await page.locator('#collect-flight').click(); await expect(page.locator('#result')).toBeVisible();
});
test('large stake permits partial return, never credits the stake twice', async ({ page }) => {
  control('partial'); await login(page); await page.goto('/spin.php'); await firstSpin(page, '150.00');
  await expect(page.locator('#cash-balance')).toHaveText('GHS 850.00');
  await expect(page.locator('#flight-return')).toHaveText('GHS 95.00 current return');
  await page.locator('#collect-flight').click();
  await expect(page.locator('#result')).toContainText('GHS 95.00 returned.');
  await expect(page.locator('#cash-balance')).toHaveText('GHS 945.00');
  expect(control('balances').pool).toBe(105500);
});
test('lost collect response retries the same exact receipt', async ({ page }) => {
  await login(page); await page.goto('/spin.php'); await firstSpin(page);
  await expect(page.locator('#collect-flight')).toBeEnabled();
  let interrupted = false;
  await page.route('**/spin-api.php', async route => {
    if (!interrupted && route.request().method() === 'POST' && route.request().postDataJSON().action === 'collect') {
      interrupted = true; const response = await route.fetch(); expect(response.status()).toBe(200); await route.abort('connectionreset');
    } else await route.continue();
  });
  await page.locator('#collect-flight').click(); await expect(page.locator('#pending-box')).toBeVisible();
  await expect(page.locator('#game-message')).toContainText('Check my flight');
  const balance = control('balances').cash;
  await page.reload(); await expect(page.locator('#result')).toContainText('returned to your wallet');
  expect(control('balances').cash).toBe(balance); await expect(page.locator('#pending-box')).toBeHidden();
});
test('expired collection asks again and never silently accepts the newer return', async ({ page }) => {
  control('partial'); await login(page); await page.goto('/spin.php'); await firstSpin(page, '150.00');
  await expect(page.locator('#collect-flight')).toBeEnabled();
  let delayed = false;
  await page.route('**/spin-api.php', async route => {
    if (!delayed && route.request().method() === 'POST' && route.request().postDataJSON().action === 'collect') {
      delayed = true; await new Promise(resolve => setTimeout(resolve, 2300)); await route.continue();
    } else await route.continue();
  });
  await page.locator('#collect-flight').click();
  await expect(page.locator('#game-message')).toContainText('Choose Collect again');
  expect(control('balances').cash).toBe(85000);
  await page.waitForResponse(async r => {
    if(!r.url().includes('action=flight') || r.request().method()!=='GET' || r.status()!==200)return false;
    const data=await r.json();return data.flight?.offer && data.flight.offer.expires_ms-data.flight.server_ms>1500;
  });
  await expect(page.locator('#collect-flight')).toBeEnabled();
  await page.locator('#collect-flight').click(); await expect(page.locator('#result')).toBeVisible();
  expect(control('balances').cash).toBeGreaterThan(85000); expect(control('balances').cash).toBeLessThanOrEqual(95000);
});
test('flight finishes automatically and accepted flight survives ghost mode refresh', async ({ page }) => {
  control('auto'); await login(page); await page.goto('/spin.php'); await firstSpin(page);
  await expect(page.locator('#collect-flight')).toBeEnabled(); control('ghost'); await page.reload();
  await expect(page.locator('#collect-flight')).toBeVisible();
  await expect(page.locator('#result')).toBeVisible({ timeout: 8000 });
  await expect(page.locator('#flight-time')).toHaveText('AUTOMATIC FINISH');
  await expect(page.locator('#review-stake')).toBeDisabled();
  await expect(page.locator('#held-balance')).toHaveText('No stake held');
});
test('admin configuration, no per-spin maximum, reconciliation and session-authorized ghost control', async ({ page }, info) => {
  const logins = control('login-events');
  await page.goto('/admin/login.php'); await page.locator('#u').fill('operator'); await page.locator('#p').fill('test-operator-password');
  await Promise.all([page.waitForURL(/admin\/index\.php/), page.getByRole('button', { name: 'Sign in', exact: true }).click()]);
  await page.goto('/admin/spin.php'); await expect(page.locator('#admin-state')).toHaveText('ACTIVE');
  expect(control('login-events')).toBe(logins + 1);
  await page.screenshot({ path: path.resolve(__dirname, '../../artifacts/spin/admin-flight-' + info.project.name + '.png'), fullPage: true });
  await expect(page.locator('[name="max_stake_cents"]')).toHaveCount(0);
  for (const name of ['Prize pool', 'Game rules', 'Players & wallets', 'Analytics', 'Ghost Mode', 'Security & audit', 'Overview']) {
    await page.locator('[data-tab]').filter({ hasText: name }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  }
  await page.locator('#reconcile').click(); await expect(page.locator('#reconcile-result')).toContainText('"ok": true');
  await page.locator('#ghost-control').click(); await page.locator('#admin-reason').fill('Browser QA manual ghost verification');
  await page.locator('#admin-apply').click(); await expect(page.locator('#admin-confirm')).toBeHidden(); await expect(page.locator('#admin-state')).toHaveText('GHOSTED');
});
test('regular wallet and internet purchase remain available while the game is ghosted', async ({ page }) => {
  await login(page); const before = control('balances'); control('ghost');
  expect((await page.goto('/spin.php')).status()).toBe(404);
  await page.goto('/'); await expect(page.locator('[data-spin-discovery]')).toHaveCount(0);
  await expect(page.locator('a[href="/network-credits.php"]')).toHaveCount(0);
  expect(control('balances')).toEqual(before);
  const result = await page.evaluate(async () => {
    const response = await fetch('/purchase.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan_code: 'PLAN_TEST' }) });
    return { status: response.status, result: await response.json() };
  });
  expect(result.status).toBe(200); expect(result.result.status).toBe('applied'); expect(control('balances').cash).toBe(before.cash - 500);
});
test('direct APIs enforce authentication, consent, CSRF and origin checks', async ({ page, request }) => {
  expect((await request.get('/spin-api.php')).status()).toBe(401); await login(page); await page.goto('/spin.php');
  await expect(page.locator('#review-stake')).toBeEnabled();
  const csrf = await page.locator('#spin-app').getAttribute('data-csrf');
  const missing = await page.evaluate(async () => (await fetch('/spin-api.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'quote', stake_cents: 500 }) })).status);
  expect(missing).toBe(419);
  const withoutConsent = await page.request.post('/spin-api.php', { headers: { Origin: new URL(page.url()).origin, 'X-CSRF-Token': csrf }, data: { action: 'start', stake_cents: 500, request_key: 'test-without-consent-key' } });
  expect(withoutConsent.status()).toBe(403); expect((await withoutConsent.json()).error).toBe('terms_required');
  const forged = await page.request.post('/spin-api.php', { headers: { Origin: 'https://untrusted.example', 'X-CSRF-Token': csrf }, data: { action: 'spin', quote_id: 'f'.repeat(32), request_key: 'untrusted-'.repeat(3), outcome: 'win' } });
  expect(forged.status()).toBe(403);
});
test('captive announcement follows actual feature state, appears once after login, and is dismissible', async ({ page, baseURL }) => {
  const notice = fs.readFileSync(path.resolve(__dirname, '../../hotspot/spin-notice.js'), 'utf8');
  let user = '0201234567';
  await page.route('https://pay.nister.org/spin-feature.php', async route => {
    const response = await page.request.get(baseURL + '/spin-feature.php'); await route.fulfill({ response });
  });
  await page.route('http://captive.test/notice-test', route => route.fulfill({ contentType: 'text/html', body: '<html><head></head><body><a href="#">Continue browsing</a><div id="nister-spin-notice-context" data-user="' + user + '" data-logged-in="yes" data-logout="http://wifi.nister.org/logout"></div><script>' + notice + '</script></body></html>' }));
  await page.goto('http://captive.test/notice-test'); await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Try Flight' })).toHaveAttribute('href', 'https://pay.nister.org/spin.php');
  await page.getByRole('button', { name: 'Keep browsing' }).click(); await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload(); await expect(page.getByRole('dialog')).toHaveCount(0);
  control('ghost'); user = '0201234568'; await page.reload(); await page.waitForTimeout(500); await expect(page.getByRole('dialog')).toHaveCount(0);
});
