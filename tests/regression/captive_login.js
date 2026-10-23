// Exercise the actual router page scripts with expanded HotSpot macros.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148';
const android = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36';
let checks = 0;

function page(file, {scheme = 'http:', actionScheme = scheme, ua = iphone, touch = 0, chap = true, host = 'wifi.nister.org'} = {}) {
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  const scripts = [...html.matchAll(/<script\s*>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
  const action = actionScheme + '//' + host + '/login';
  const macros = {'link-login-only': action, 'chap-id': chap ? '\\001' : '',
    'chap-challenge': chap ? 'test-challenge' : '', 'link-orig': 'http://captive.apple.com/hotspot-detect.html',
    'link-status': scheme + '//wifi.nister.org/status', 'logged-in': 'no'};
  let source = scripts;
  for (const [key, value] of Object.entries(macros)) source = source.split('$(' + key + ')').join(value);
  const submitted = [];
  const elements = {};
  function element(id) {
    return elements[id] ||= {value: '', textContent: '', style: {}, className: '',
      addEventListener() {}, focus() {}, setAttribute() {}, getAttribute() { return ''; }};
  }
  function form() {
    const f = {action, target: '', style: {}, appendChild(input) { this[input.name] = input; },
      submit() { submitted.push({action: this.action, target: this.target,
        username: this.username.value, password: this.password.value}); }};
    for (const name of ['username', 'password', 'dst', 'popup']) f[name] = {value: ''};
    f.elements = f;
    return f;
  }
  const loginForm = form();
  const document = {forms: {0: loginForm, miklogin: loginForm}, body: {appendChild() {}},
    getElementById: element, querySelector: () => element('button'), querySelectorAll: () => [],
    addEventListener() {}, createElement: tag => tag === 'form' ? form() : {}};
  const navigation = [];
  const location = {href: scheme + '//wifi.nister.org/login', protocol: scheme, search: '',
    replace: url => navigation.push(url)};
  const context = {document, location, navigator: {userAgent: ua, maxTouchPoints: touch},
    URL, URLSearchParams, Date, console, setTimeout: () => 1, clearTimeout() {},
    hexMD5: value => 'CHAP:' + value, localStorage: {getItem() { throw new Error('storage denied'); }}};
  context.window = context;
  vm.createContext(context);
  vm.runInContext(source, context, {filename: file});
  return {context, loginForm, submitted, navigation};
}

function check(name, fn) { fn(); checks++; console.log('PASS captive_' + name); }

for (const prefix of ['hotspot', 'nister-org/public/router-sync']) {
  const file = prefix + '/login.html';
  check(prefix + '_iphone_http_chap_top_level', () => {
    const p = page(file);
    p.context.loginAttempts = p.context.buildLoginAttempts(['0240000000']);
    p.context.loginRawPassword = 'test-password';
    p.context.loginPending = true;
    p.context.submitLoginAttempt();
    assert.equal(p.submitted[0].target, '_top');
    assert.match(p.submitted[0].password, /^CHAP:/);
    assert.equal(p.submitted[0].action, 'http://wifi.nister.org/login');
  });
  check(prefix + '_iphone_https_password', () => {
    const p = page(file, {scheme: 'https:'});
    p.context.loginAttempts = p.context.buildLoginAttempts(['0240000000']);
    p.context.loginRawPassword = 'test-password';
    p.context.submitLoginAttempt();
    assert.deepEqual(p.submitted[0], {action: 'https://wifi.nister.org/login', target: '_top',
      username: '0240000000', password: 'test-password'});
  });
  check(prefix + '_http_page_with_https_router_action_uses_password', () => {
    const p = page(file, {actionScheme: 'https:'});
    p.context.loginAttempts = p.context.buildLoginAttempts(['0240000000']);
    p.context.loginRawPassword = 'test-password';
    p.context.submitLoginAttempt();
    assert.equal(p.submitted[0].password, 'test-password');
    assert.equal(p.submitted[0].action, 'https://wifi.nister.org/login');
  });
  check(prefix + '_no_md5_requires_https', () => {
    const p = page(file);
    delete p.context.hexMD5;
    p.context.loginAttempts = p.context.buildLoginAttempts(['0240000000']);
    p.context.loginRawPassword = 'test-password';
    p.context.submitLoginAttempt();
    assert.equal(p.submitted[0].action, 'https://wifi.nister.org/login');
    assert.equal(p.submitted[0].password, 'test-password');
  });
  check(prefix + '_fallback_upgrades_ip_url', () => {
    const p = page(file, {host: '192.168.88.1'});
    p.context.loginAttempts = [{username: '0240000000', mode: 'chap'}];
    p.context.loginRawPassword = 'test-password';
    assert.equal(p.context.tryTopLevelLoginFallback(), true);
    assert.equal(p.submitted[0].action, 'https://wifi.nister.org/login');
  });
  check(prefix + '_android_keeps_chap_frame', () => {
    const p = page(file, {ua: android});
    p.context.loginAttempts = p.context.buildLoginAttempts(['0240000000']);
    p.context.loginRawPassword = 'test-password';
    p.context.submitLoginAttempt();
    assert.equal(p.submitted[0].target, 'authframe');
    assert.match(p.submitted[0].password, /^CHAP:/);
  });
  check(prefix + '_desktop_ipad_uses_top_level', () => {
    const p = page(file, {ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/605.1.15', touch: 5});
    assert.equal(p.context.isAppleMobileClient(), true);
  });
  check(prefix + '_normalizes_phone_before_navigation', () => {
    const p = page(file);
    for (const phone of ['024 000 0000', '+233 24 000 0000', '00233 24 000 0000', '2330240000000']) {
      assert.equal(p.context.usernameCandidates(phone)[0], '0240000000');
    }
    assert.equal(p.context.usernameCandidates('invalid').length, 0);
  });
  check(prefix + '_rejects_unexpected_password_destination', () => {
    const p = page(file, {host: 'example.com'});
    assert.equal(p.context.routerLoginAction('pap'), '');
  });
  check(prefix + '_polls_expanded_session_api', () => {
    const p = page(file);
    let requested = '';
    p.context.XMLHttpRequest = function () {
      this.open = (method, url) => { requested = url; };
      this.send = () => {};
    };
    p.context.loginPending = true;
    p.context.checkLoginState();
    assert.match(requested, /^\/api\?_t=\d+$/);
  });
  for (const [state, payload, navigates] of [
    ['unpaid_authenticated', {captive: true, 'x-nister-authenticated': true}, true],
    ['paid_authenticated', {captive: false, 'x-nister-authenticated': true}, true],
    ['legacy_authenticated', {captive: false}, true],
    ['not_authenticated', {captive: true, 'x-nister-authenticated': false}, false],
  ]) {
    check(prefix + '_' + state + '_status_navigation', () => {
      const p = page(file);
      p.context.XMLHttpRequest = function () {
        this.open = () => {};
        this.send = () => {
          this.readyState = 4; this.status = 200; this.responseText = JSON.stringify(payload);
          this.onreadystatechange();
        };
      };
      p.context.loginPending = true;
      p.context.loginStartAt = Date.now();
      p.context.checkLoginState();
      assert.equal(p.navigation.length > 0, navigates);
      if (navigates) assert.match(p.navigation[0], /\/status\?/);
    });
  }
  check(prefix + '_autologin_password_requires_https', () => {
    const p = page(prefix + '/alogin.html', {chap: false, host: '192.168.88.1'});
    p.loginForm.username.value = '0240000000';
    p.loginForm.password.value = 'test-password';
    p.context.doLogin();
    assert.equal(p.submitted[0].action, 'https://wifi.nister.org/login');
    assert.equal(p.submitted[0].target, '_top');
  });
}
console.log('Captive login behavior checks passed (' + checks + ').');
