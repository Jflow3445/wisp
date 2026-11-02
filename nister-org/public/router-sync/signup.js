(function () {
  'use strict';
  function start() {
    var form = document.querySelector('[data-signup-form]');
    if (!form) return;
    var get = function (id) { return document.getElementById(id); };
    var required = form.getAttribute('data-otp-required') !== '0';
    var phone = get('user'), token = get('otp_token'), fields = get('otp_fields');
    var submitting = false, cooldown = null;
    var messages = {
      account_exists: 'This number already has an account. Sign in with your existing password.',
      invalid_phone: 'Enter a valid Ghana phone number, such as 0241234567.',
      invalid_name: 'Enter your full name, between 2 and 80 characters.',
      invalid_referral_code: 'Check your referral code, or leave it blank.',
      otp_required: 'Request a code and verify your phone number before continuing.',
      otp_invalid_or_expired: 'Your verification expired. Request and verify a new code.',
      otp_invalid: 'That code is not correct. Check your SMS and try again.',
      otp_expired: 'That code expired. Request a new code.',
      otp_locked: 'Too many incorrect codes. Request a new code.',
      otp_not_requested: 'Request an SMS code first.',
      rate_limited: 'Too many attempts. Please wait before trying again.',
      rate_limited_ip: 'Too many attempts. Please wait before trying again.',
      cooldown_active: 'Please wait before requesting another code.',
      sms_send_failed: 'We could not send your code. Please try again shortly.',
      sms_paused: 'SMS delivery is paused. Please try again later.',
      password_must_be_6_to_128_characters: 'Choose a password between 6 and 128 characters.'
    };
    function banner(text, good) {
      var box = get('banner'), copy = get('banner-text');
      if (!box || !copy) return;
      copy.textContent = text; box.hidden = !text; box.style.display = text ? 'block' : 'none';
      box.classList.toggle('is-success', !!good); box.setAttribute('role', good ? 'status' : 'alert');
    }
    function message(code) { return messages[code] || 'We could not complete that step. Please try again.'; }
    function request(path, data) {
      var options = {cache: 'no-store', credentials: 'omit'};
      if (data) { options.method = 'POST'; options.headers = {'Content-Type': 'application/json'}; options.body = JSON.stringify(data); }
      return Promise.race([
        fetch('https://api.nister.org/hotspot/' + path, options).then(function (r) {
          return r.json().then(function (j) { if (!r.ok || !j.ok) throw j; return j; });
        }),
        new Promise(function (_, reject) { setTimeout(function () { reject({error: 'timeout'}); }, 12000); })
      ]);
    }
    function applyPolicy(policy) {
      if (typeof policy.otp_required !== 'boolean') throw new Error('Invalid registration policy');
      required = policy.otp_required; fields.hidden = !required;
      var note = get('signup-policy-note');
      if (note) note.textContent = required ? 'We’ll send a code to confirm this number.' : 'You can create your account without an SMS code right now.';
      if (!required) { token.value = ''; if (cooldown) clearInterval(cooldown); cooldown = null; get('otp_send_btn').disabled = false; get('otp_send_btn').textContent = 'Send code'; }
      return policy;
    }
    function refresh() { return request('signup_policy.php').then(applyPolicy); }
    function resetToken() { token.value = ''; if (get('otp_status')) get('otp_status').textContent = ''; }
    function wait(seconds) {
      var button = get('otp_send_btn'), left = Math.max(1, seconds || 60);
      if (cooldown) clearInterval(cooldown);
      button.disabled = true; button.textContent = 'Resend in ' + left + 's';
      cooldown = setInterval(function () {
        left--; button.textContent = 'Resend in ' + left + 's';
        if (left <= 0) { clearInterval(cooldown); cooldown = null; button.disabled = false; button.textContent = 'Resend code'; }
      }, 1000);
    }
    phone.addEventListener('input', resetToken);
    get('otp_send_btn').addEventListener('click', function () {
      if (!phone.value.trim()) { banner('Enter your phone number first.'); phone.focus(); return; }
      var button = this; button.disabled = true; resetToken();
      refresh().then(function () {
        if (!required) return {otp_required: false};
        return request('otp_send.php', {username: phone.value.trim(), purpose: 'signup'});
      }).then(function (result) {
        if (result.otp_required === false) { applyPolicy(result); banner('You can now create your account without an SMS code.', true); button.disabled = false; return; }
        wait(result.cooldown_seconds); banner('Code sent. Enter it below to verify your number.', true); get('otp_code').focus();
      }).catch(function (e) { button.disabled = false; banner(message(e.error)); if (e.cooldown_seconds) wait(e.cooldown_seconds); });
    });
    get('otp_verify_btn').addEventListener('click', function () {
      var button = this, code = get('otp_code').value.trim();
      if (!code) { banner('Enter the verification code from your SMS.'); return; }
      button.disabled = true;
      request('otp_verify.php', {username: phone.value.trim(), code: code}).then(function (result) {
        if (!result.signup_token) throw {error: 'otp_invalid_or_expired'};
        token.value = result.signup_token; get('otp_status').textContent = 'Phone number verified.'; banner('Your number is verified. Finish creating your account.', true);
      }).catch(function (e) { resetToken(); banner(message(e.error)); }).then(function () { button.disabled = false; });
    });
    var toggle = get('toggle_pass');
    if (toggle) toggle.addEventListener('click', function () {
      var input = get('pass'), show = input.type === 'password'; input.type = show ? 'text' : 'password';
      this.textContent = show ? 'Hide' : 'Show'; this.setAttribute('aria-pressed', show ? 'true' : 'false');
    });
    var params = new URLSearchParams(location.search);
    if (form.hasAttribute('data-captive-signup')) {
      ['name', 'username', 'dst', 'location_code', 'mac'].forEach(function (key) {
        var element = get(key === 'username' ? 'user' : key); if (element && params.get(key)) element.value = params.get(key);
      });
      var site = get('location_code'); if (site && !site.value) site.value = params.get('site_code') || window.NISTER_SITE_CODE || '';
      if (params.get('err')) banner(message(params.get('err')));
    }
    form.addEventListener('submit', function (event) {
      event.preventDefault(); if (submitting) return;
      submitting = true;
      refresh().then(function () {
        if (required && !token.value) { banner(message('otp_required')); get('otp_send_btn').focus(); submitting = false; return; }
        if (!form.reportValidity()) { submitting = false; return; }
        var submit = form.querySelector('[type=submit]'); if (submit) { submit.disabled = true; submit.textContent = 'Creating account…'; }
        HTMLFormElement.prototype.submit.call(form);
      }).catch(function () { submitting = false; banner('We could not check registration availability. Please try again.'); });
    });
    function syncPolicy() { refresh().catch(function () { /* Submission always rechecks and fails closed. */ }); }
    window.addEventListener('pageshow', syncPolicy); window.addEventListener('focus', syncPolicy);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) syncPolicy(); });
    syncPolicy();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
