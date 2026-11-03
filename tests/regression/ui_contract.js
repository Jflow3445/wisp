// Functional presentation boundaries shared by humans, assistive tools and agents.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const hotspot = path.join(root, 'hotspot');
const mirrors = path.join(root, 'nister-org/public/router-sync');

for (const file of [
  'hotspot/common.css', 'pay-portal/assets/premium.css',
  'pay-portal/assets/admin-shell.css', 'pay-portal/assets/portal-discovery.css',
  'pay-portal/assets/signup.css', 'nister-org/src/app/globals.css',
  'nister-flight/src/app/flight.css',
]) {
  const css = fs.readFileSync(path.join(root, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, '');
  let depth = 0;
  for (const token of css) {
    if (token === '{') depth++;
    if (token === '}') depth--;
    assert.ok(depth >= 0, `${file}: unexpected closing style block`);
  }
  assert.equal(depth, 0, `${file}: unclosed style block can swallow responsive rules`);
}

function sourceFiles(directory, prefix = '') {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (entry.name.startsWith('.')) return [];
    const name = path.join(prefix, entry.name);
    return entry.isDirectory() ? sourceFiles(path.join(directory, entry.name), name) : [name];
  });
}
for (const name of sourceFiles(hotspot)) {
  if (!/\.(html|css|js|json)$/.test(name)) continue;
  const source = path.join(hotspot, name);
  const mirror = path.join(mirrors, name);
  if (fs.existsSync(mirror)) {
    assert.deepEqual(fs.readFileSync(mirror), fs.readFileSync(source), `${name}: router mirror drift`);
  }
}

const fields = {
  'login.html': ['user', 'pass'],
  'signup.html': ['name', 'user', 'pass', 'otp_code'],
  'reset-password.html': ['user', 'pass', 'pass2', 'otp_code'],
};
for (const name of [...Object.keys(fields), 'status.html', 'logout.html', 'change-password.html', 'registration-success.html']) {
  const html = fs.readFileSync(path.join(hotspot, name), 'utf8')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
  assert.equal((html.match(/<h1\b/gi) || []).length, 1, `${name}: one task heading`);
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(ids.length, new Set(ids).size, `${name}: unique control IDs`);
  for (const id of fields[name] || []) {
    assert.ok(ids.includes(id), `${name}: ${id} remains addressable`);
    assert.match(html, new RegExp(`<label\\b[^>]*for="${id}"[^>]*>[^<]+</label>`), `${name}: ${id} has a persistent label`);
  }
}
console.log('PASS captive presentation contract and router mirror parity');
