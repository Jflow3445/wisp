const {test,expect}=require('../../nister-org/node_modules/@playwright/test');
const {execFileSync}=require('node:child_process');
const path=require('node:path');const fs=require('node:fs');
const php=process.env.SPIN_TEST_PHP||'php';
function fixture(action,...args){return JSON.parse(execFileSync(php,[path.join(__dirname,'fixture.php'),action,...args],{encoding:'utf8'}));}
async function form(page,phone){await page.locator('#name').fill('Fixture Customer');await page.locator('#user').fill(phone);await page.locator('#pass').fill('fixture-password');}
async function admin(page){await page.goto('/admin/login.php');await page.locator('#u').fill('operator');await page.locator('#p').fill('test-operator-password');await Promise.all([page.waitForURL(/admin\/index\.php/),page.getByRole('button',{name:'Sign in',exact:true}).click()]);}
async function navigationContrast(page){
  const failures=await page.evaluate(()=>{
    const rgb=value=>(value.match(/[\d.]+/g)||[]).map(Number);
    const blend=(over,under)=>over.slice(0,3).map((v,i)=>v*(over[3]??1)+under[i]*(1-(over[3]??1)));
    const luminance=color=>color.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
    return [...document.querySelectorAll('.user-menu .btn, #menu .btn, .ops-sidebar nav a')].filter(el=>el.getClientRects().length).flatMap(el=>{
      const ancestors=[];for(let node=el;node;node=node.parentElement)ancestors.unshift(node);
      const background=ancestors.reduce((color,node)=>blend(rgb(getComputedStyle(node).backgroundColor),color),[255,255,255]);
      const foreground=blend(rgb(getComputedStyle(el).color),background),a=luminance(foreground),b=luminance(background);
      const contrast=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
      return contrast<4.5?[`${el.textContent.trim()}: ${contrast.toFixed(2)}:1`]:[];
    });
  });
  expect(failures,'Menu text must have at least 4.5:1 contrast').toEqual([]);
}
async function screenshot(page,name,info){const dir=path.resolve(__dirname,'../../artifacts/spin/portal');fs.mkdirSync(dir,{recursive:true});await navigationContrast(page);await page.screenshot({path:path.join(dir,name+'-'+info.project.name+'.png'),fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();}
test.beforeEach(async({page})=>{
  execFileSync(php,[path.join(__dirname,'../spin/web_control.php'),'reset']);fixture('prepare');
  await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//,route=>route.abort());
  await page.route('https://api.nister.org/hotspot/**',async route=>{
    const original=new URL(route.request().url());
    const response=await route.fetch({url:'http://127.0.0.1:8037'+original.pathname+original.search,headers:{...route.request().headers(),origin:'https://pay.nister.org'},maxRedirects:0});
    await route.fulfill({response,headers:{...response.headers(),'access-control-allow-origin':'*'}});
  });
});
test('off-network signup works during SMS pause and remains unpaid',async({page},info)=>{
  await page.goto('/login.php');await page.getByRole('link',{name:'Create an account'}).click();
  await expect(page.locator('#otp_fields')).toBeHidden();await form(page,'0190000001');await screenshot(page,'signup',info);
  await Promise.all([page.waitForURL(/login\.php\?msg=registered/),page.getByRole('button',{name:'Create account',exact:true}).click()]);
  await expect(page.locator('.msg.ok')).toContainText('Your account is ready');
  expect(fixture('account','233190000001')).toEqual({radcheck:6,radusergroup:2,accounts:1,balance:0,otp_challenges:0});
  await page.locator('#password').fill('fixture-password');await Promise.all([page.waitForURL(/portal\.php/),page.getByRole('button',{name:'Open my portal',exact:true}).click()]);
});
test('resuming SMS invalidates a stale bypass and valid OTP permits signup',async({page})=>{
  await page.goto('/register.php');await expect(page.locator('#otp_fields')).toBeHidden();await form(page,'0190000002');
  fixture('resume');await page.getByRole('button',{name:'Create account',exact:true}).click();
  await expect(page.locator('#otp_fields')).toBeVisible();await expect(page.locator('#banner')).toContainText('verify your phone');
  expect(fixture('account','233190000002').accounts).toBe(0);
  const csrf=await page.locator('[name=_csrf]').inputValue();
  const denied=await page.request.post('/register.php',{form:{_csrf:csrf,name:'Fixture Customer',phone:'0190000002',password:'fixture-password',otp_required:'0'},headers:{Origin:'http://127.0.0.1:8037'}});
  expect(await denied.text()).toContain('Phone verification is required');expect(fixture('account','233190000002').accounts).toBe(0);
  const {token}=fixture('token','233190000002');await page.locator('#otp_token').evaluate((el,v)=>el.value=v,token);
  await Promise.all([page.waitForURL(/login\.php\?msg=registered/),page.getByRole('button',{name:'Create account',exact:true}).click()]);
  expect(fixture('account','233190000002').balance).toBe(0);
});
test('captive signup respects SMS pause while password reset stays protected',async({page})=>{
  const policy=await page.request.get('/hotspot/signup_policy.php');expect(await policy.json()).toEqual({ok:true,otp_required:false});
  const paused=await page.request.post('/hotspot/otp_send.php',{data:{username:'0190000003',purpose:'signup'},headers:{Origin:'https://wifi.nister.org'}});expect(await paused.json()).toEqual({ok:true,otp_required:false});
  const reset=await page.request.post('/hotspot/otp_send.php',{data:{username:'0201234567',purpose:'password_reset'},headers:{Origin:'https://wifi.nister.org'}});expect(reset.status()).toBe(503);expect((await reset.json()).error).toBe('sms_paused');
  await page.goto('/captive/signup.html');await expect(page.locator('#otp_fields')).toBeHidden();
  const created=await page.request.post('/hotspot/signup.php',{form:{name:'Captive Fixture',username:'0190000003',password:'fixture-password',link_login_only:'http://192.168.88.1/login'},headers:{Origin:'https://wifi.nister.org'},maxRedirects:0});
  expect(created.status()).toBe(200);expect(await created.text()).toContain('http://192.168.88.1/login.html');expect(fixture('account','233190000003').balance).toBe(0);
});
test('four admin modules share navigation and fit desktop and mobile',async({page},info)=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));await admin(page);
  for(const [url,heading,key] of [['/admin/sms.php','SMS gateways','sms'],['/admin/register.php','Register a user','register'],['/admin/withdrawals.php','Withdrawals','withdrawals'],['/admin/spin.php','Game management','game']]){
    await page.goto(url);await expect(page.getByRole('heading',{name:heading,exact:true,level:1})).toBeVisible();await expect(page.locator('.ops-sidebar [aria-current=page]')).toHaveCount(1);await screenshot(page,'admin-'+key,info);
  }
  expect(errors).toEqual([]);
});
test('Flight is prominent on the account page and hidden when ghosted',async({page},info)=>{
  await page.goto('/');await expect(page.locator('.flight-promo')).toBeVisible();await expect(page.locator('.flight-nav')).toBeVisible();await expect(page.locator('.flight-promo')).toContainText('You can lose your stake');await screenshot(page,'portal',info);
  execFileSync(php,[path.join(__dirname,'../spin/web_control.php'),'ghost']);await page.evaluate(()=>{window.dispatchEvent(new Event('pagehide'));window.dispatchEvent(new Event('pageshow'));});await expect(page.locator('.flight-promo')).toBeHidden();await expect(page.locator('.flight-nav')).toBeHidden();
});

test('captive tasks retain headings, labelled fields and phone layouts',async({page},info)=>{
  for(const name of ['login','signup','reset-password','change-password','status','logout','registration-success']){
    await page.goto('/captive/'+name+'.html');
    await expect(page.getByRole('heading',{level:1})).toHaveCount(1);
    await screenshot(page,'captive-'+name,info);
  }
  await page.goto('/captive/login.html');
  await page.getByLabel('Phone number',{exact:true}).fill('0201234567');
  await page.getByLabel('Password',{exact:true}).fill('fixture-password');
  await page.getByRole('button',{name:'Show',exact:true}).click();
  await expect(page.locator('#pass')).toHaveAttribute('type','text');
  await page.getByRole('button',{name:'Hide',exact:true}).click();
  await expect(page.locator('#pass')).toHaveAttribute('type','password');
});

test('signed-in account and administration sections remain navigable',async({page},info)=>{
  await page.goto('/login.php');
  await page.locator('#msisdn').fill('0201234567');
  await page.locator('#password').fill('test-customer-password');
  await Promise.all([page.waitForURL(/portal\.php/),page.getByRole('button',{name:'Open my portal',exact:true}).click()]);
  for(const section of ['account','wallet','plans','rewards','activity']){
    await page.locator('.user-menu [href="#'+section+'_section"]').click();
    await expect(page.locator('#'+section+'_section')).toBeVisible();
    await expect(page.getByRole('heading',{level:1})).toBeVisible();
    await screenshot(page,'account-'+section,info);
  }
  await admin(page);
  for(const section of ['overview','billing','plans','settings','alerts','users','forensics']){
    await page.locator('#menu [data-section="'+section+'"]').click();
    await expect(page.locator('#menu [data-section="'+section+'"]')).toHaveClass(/active/);
    await screenshot(page,'console-'+section,info);
  }
});
