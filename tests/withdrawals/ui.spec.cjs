const {test,expect}=require('../../nister-org/node_modules/@playwright/test');
const {execFileSync}=require('node:child_process');const path=require('node:path');const fs=require('node:fs');
const php=process.env.SPIN_TEST_PHP||'php';
async function openWithdrawals(page){
  await expect(page.locator('#withdrawal-form')).toBeHidden();
  await page.locator('#wallet-withdrawals > summary').click();
  await expect(page.locator('#withdrawal-form')).toBeVisible();
}
async function login(page,phone='0201234567'){
  await page.goto('/login.php');await page.locator('[name=msisdn]').fill(phone);await page.locator('[name=password]').fill('test-customer-password');
  await Promise.all([page.waitForURL(/portal\.php/),page.getByRole('button',{name:'Open my portal',exact:true}).click()]);
  await page.goto('/portal.php#wallet_section');await expect(page.locator('#withdrawal-minimum')).toHaveText('GHS 100.00');
  await openWithdrawals(page);
}
async function request(page,amount='100.00'){
  await page.locator('#withdrawal-form [name=name]').fill('Test MoMo Holder');await page.locator('#withdrawal-form [name=network]').selectOption('MTN');await page.locator('#withdrawal-form [name=amount]').fill(amount);await page.locator('#withdrawal-submit').click();
  await expect(page.locator('#withdrawal-history')).toContainText('Awaiting approval');await expect(page.locator('#withdrawal-held')).toHaveText('GHS '+Number(amount).toFixed(2));
}
async function admin(page){
  await page.goto('/admin/login.php');await page.locator('#u').fill('operator');await page.locator('#p').fill('test-operator-password');
  await Promise.all([page.waitForURL(/admin\/index\.php/),page.getByRole('button',{name:'Sign in',exact:true}).click()]);
  await page.getByRole('link',{name:'Withdrawals',exact:true}).click();await expect(page.locator('#withdrawal-admin-minimum')).toHaveValue('100.00');
}
test.beforeEach(async({page})=>{
  execFileSync(php,['-d','extension=pdo_mysql',path.resolve(__dirname,'../spin/web_control.php'),'reset']);
  await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//,route=>route.abort());
});
test('request holds wallet funds, admin approves and records manual MoMo payment',async({page},info)=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await login(page);
  await expect(page.locator('#withdrawal-phone')).toHaveValue('0201234567');await expect(page.locator('#withdrawal-phone')).toHaveAttribute('readonly','');
  await expect(page.locator('#wallet-withdrawals')).toContainText('maximum of 48 hours');await request(page);
  await expect(page.locator('#balance .stat, #balance_stat').first()).toHaveText('GHS 900.00');
  await expect(page.locator('#withdrawal-submit')).toBeDisabled();
  fs.mkdirSync(path.resolve(__dirname,'../../artifacts/withdrawals'),{recursive:true});await page.screenshot({path:path.resolve(__dirname,'../../artifacts/withdrawals/customer-'+info.project.name+'.png'),fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
  await admin(page);await expect(page.locator('#withdrawal-queue')).toContainText('0201234567');await expect(page.locator('#withdrawal-queue')).toContainText('Test MoMo Holder');
  await page.locator('#withdrawal-queue').getByRole('button',{name:'Approve',exact:true}).click();await expect(page.locator('#withdrawal-decision')).toContainText('Approval does not send money');await page.locator('#withdrawal-apply').click();await expect(page.locator('#withdrawal-decision')).toBeHidden();
  await page.locator('#withdrawal-status').selectOption('approved');await page.locator('#withdrawal-filters button').click();await page.locator('#withdrawal-queue').getByRole('button',{name:'Mark paid',exact:true}).click();await page.locator('#withdrawal-payout-ref').fill('MOMO-LOCAL-0001');await page.locator('#withdrawal-apply').click();await expect(page.locator('#withdrawal-decision')).toBeHidden();
  await page.locator('#withdrawal-status').selectOption('paid');await page.locator('#withdrawal-filters button').click();await expect(page.locator('#withdrawal-queue')).toContainText('MOMO-LOCAL-0001');
  await page.screenshot({path:path.resolve(__dirname,'../../artifacts/withdrawals/admin-'+info.project.name+'.png'),fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
  await page.goto('/portal.php#wallet_section');await openWithdrawals(page);await expect(page.locator('#withdrawal-history .withdrawal-status')).toHaveText('Paid');await expect(page.locator('#withdrawal-held')).toHaveText('GHS 0.00');await expect(page.locator('#balance .stat, #balance_stat').first()).toHaveText('GHS 900.00');expect(errors).toEqual([]);
});
test('admin decline restores the exact held amount once and shows the reason',async({page})=>{
  await login(page);await request(page);await admin(page);await page.locator('#withdrawal-queue').getByRole('button',{name:'Decline',exact:true}).click();await page.locator('#withdrawal-decline-reason').fill('Please confirm your MoMo account name');await page.locator('#withdrawal-apply').click();await expect(page.locator('#withdrawal-decision')).toBeHidden();
  await page.goto('/portal.php#wallet_section');await openWithdrawals(page);await expect(page.locator('#withdrawal-history')).toContainText('Declined · refunded');await expect(page.locator('#withdrawal-history')).toContainText('Please confirm your MoMo account name');await expect(page.locator('#withdrawal-available')).toHaveText('GHS 1000.00');await expect(page.locator('#balance .stat, #balance_stat').first()).toHaveText('GHS 1000.00');
});
test('admin controls the minimum and customer validation uses the saved value',async({page})=>{
  await admin(page);await page.locator('#withdrawal-admin-minimum').fill('150.00');await page.locator('#withdrawal-config button').click();await expect(page.locator('#withdrawal-admin-message')).toContainText('Minimum withdrawal saved');
  await page.goto('/login.php');await page.locator('[name=msisdn]').fill('0201234567');await page.locator('[name=password]').fill('test-customer-password');await page.getByRole('button',{name:'Open my portal',exact:true}).click();await page.goto('/portal.php#wallet_section');await expect(page.locator('#withdrawal-minimum')).toHaveText('GHS 150.00');
  await openWithdrawals(page);
  await page.locator('#withdrawal-form [name=name]').fill('Test Customer');await page.locator('#withdrawal-form [name=network]').selectOption('TELECEL');await page.locator('#withdrawal-form [name=amount]').fill('100.00');await page.locator('#withdrawal-submit').click();await expect(page.locator('#withdrawal-message')).toContainText('minimum withdrawal is GHS 150.00');await expect(page.locator('#withdrawal-available')).toHaveText('GHS 1000.00');await request(page,'200.00');
});
test('withdrawal APIs enforce existing login, CSRF, own number, amount, and account privacy',async({page})=>{
  expect((await page.request.get('/withdrawal-api.php')).status()).toBe(401);expect((await page.request.get('/admin/withdrawal-api.php')).status()).toBe(401);
  await login(page);const token=await page.locator('#wallet-withdrawals').getAttribute('data-csrf');const origin=new URL(page.url()).origin;const payload={amount:'100.00',name:'Test Account',network:'MTN',account_number:'0201234567',request_key:'withdrawal-security-key-0001'};
  expect((await page.request.post('/withdrawal-api.php',{headers:{Origin:origin},data:payload})).status()).toBe(419);
  expect((await page.request.post('/withdrawal-api.php',{headers:{Origin:'https://evil.invalid','X-CSRF-Token':token},data:payload})).status()).toBe(403);
  const headers={Origin:origin,'X-CSRF-Token':token};
  const bad=await page.request.post('/withdrawal-api.php',{headers,data:{...payload,account_number:'0201234568'}});expect(bad.status()).toBe(422);expect((await bad.json()).error).toBe('account_mismatch');
  const a=await page.request.post('/withdrawal-api.php',{headers,data:payload}),b=await page.request.post('/withdrawal-api.php',{headers,data:payload});expect(a.status()).toBe(200);expect((await a.json()).withdrawal.id).toBe((await b.json()).withdrawal.id);expect((await page.request.get('/admin/withdrawal-api.php')).status()).toBe(401);
  await login(page,'0201234568');const other=await(await page.request.get('/withdrawal-api.php')).json();expect(other.snapshot.withdrawals).toHaveLength(0);expect(other.snapshot.wallet.balance_cents).toBe(100000);
});
test('a lost response and refresh recover one request without another debit',async({page})=>{
  await login(page);let interrupted=false;
  await page.route('**/withdrawal-api.php',async route=>{if(!interrupted&&route.request().method()==='POST'){interrupted=true;const response=await route.fetch();expect(response.status()).toBe(200);await route.abort('connectionreset');}else await route.continue();});
  await page.locator('#withdrawal-form [name=name]').fill('Recovery Test');await page.locator('#withdrawal-form [name=network]').selectOption('AT');await page.locator('#withdrawal-form [name=amount]').fill('100.00');await page.locator('#withdrawal-submit').click();await expect(page.locator('#withdrawal-submit')).toHaveText('Retry this request');await page.reload();await openWithdrawals(page);await expect(page.locator('#withdrawal-history')).toContainText('Awaiting approval');await expect(page.locator('#withdrawal-submit')).toBeDisabled();
  const snapshot=(await(await page.request.get('/withdrawal-api.php')).json()).snapshot;expect(snapshot.withdrawals).toHaveLength(1);expect(snapshot.wallet.balance_cents).toBe(90000);expect(snapshot.wallet.held_cents).toBe(10000);
});
