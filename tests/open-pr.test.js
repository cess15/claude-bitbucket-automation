const test = require('node:test');
const assert = require('node:assert');
const {
  MAX_URL_LENGTH, parseInput, buildPlan, openerCandidates, clipboardCandidates, toClipExeBuffer, openUrl,
} = require('../skills/pr-workflow/scripts/open-pr.js');

const input = (overrides = {}, body = '## Summary\nLine with ñ & ?') => {
  const fields = {
    provider: 'github', host: 'vumigroup.ghe.com', owner: 'vumi-it', repo: 'portal',
    source: 'feat/login', target: 'develop', title: 'feat(auth): add login', ...overrides,
  };
  return `${Object.entries(fields).map(([k, v]) => `${k}=${v}`).join('\n')}\n---\n${body}\n`;
};

test('parseInput reads fields and multi-line body, tolerating CRLF', () => {
  const pr = parseInput(input().replace(/\n/g, '\r\n'));
  assert.strictEqual(pr.source, 'feat/login');
  assert.strictEqual(pr.title, 'feat(auth): add login');
  assert.strictEqual(pr.body, '## Summary\nLine with ñ & ?');
});

test('parseInput rejects missing fields, unknown provider and bad host', () => {
  assert.throws(() => parseInput('provider=github\n---\nx'), /missing field/);
  assert.throws(() => parseInput(input({ provider: 'gitlab' })), /unsupported provider/);
  assert.throws(() => parseInput(input({ host: 'evil.com/x?' })), /invalid host/);
});

test('github plan prefills title and body, encoding branches and text', () => {
  const plan = buildPlan(parseInput(input({ source: "fix/it's-$5&co" })));
  assert.ok(plan.url.startsWith('https://vumigroup.ghe.com/vumi-it/portal/compare/develop...fix/it%27s-%245%26co?quick_pull=1&title=feat%28auth%29%3A%20add%20login'));
  assert.ok(plan.url.includes(`&body=${encodeURIComponent('## Summary\nLine with ñ & ?')}`));
  assert.doesNotMatch(plan.url, /[!'()*\s]/);
  assert.strictEqual(plan.prefilled, 'title,body');
  assert.strictEqual(plan.shortUrl, plan.url.slice(0, plan.url.indexOf('&body=')));
  assert.strictEqual(plan.clipboardText, '## Summary\nLine with ñ & ?');
});

test('github plan drops a long body from the URL but keeps it on the clipboard', () => {
  const body = 'x'.repeat(MAX_URL_LENGTH);
  const plan = buildPlan(parseInput(input({}, body)));
  assert.ok(!plan.url.includes('&body='));
  assert.ok(plan.url.length <= MAX_URL_LENGTH);
  assert.strictEqual(plan.prefilled, 'title');
  assert.strictEqual(plan.url, plan.shortUrl);
  assert.strictEqual(plan.clipboardText, body);
});

test('bitbucket plan uses source/dest and always copies the body', () => {
  const plan = buildPlan(parseInput(input({ provider: 'bitbucket', host: 'bitbucket.org', owner: 'vumiteam' })));
  assert.strictEqual(plan.url, 'https://bitbucket.org/vumiteam/portal/pull-requests/new?source=feat%2Flogin&dest=develop');
  assert.strictEqual(plan.shortUrl, plan.url);
  assert.strictEqual(plan.prefilled, 'none');
  assert.strictEqual(plan.clipboardText, '## Summary\nLine with ñ & ?');
});

test('opener per platform', () => {
  const browser = [['rundll32.exe', 'url.dll,FileProtocolHandler']];
  const wsl = openerCandidates('linux', { WSL_DISTRO_NAME: 'Ubuntu' }, '6.6.87.2-microsoft-standard-WSL2');
  assert.deepStrictEqual(wsl, browser);
  assert.deepStrictEqual(openerCandidates('win32', {}, ''), browser);
  assert.deepStrictEqual(openerCandidates('darwin', {}, ''), [['open']]);
  assert.deepStrictEqual(openerCandidates('linux', { DISPLAY: ':0' }, '6.1.0'), [['xdg-open']]);
  assert.deepStrictEqual(openerCandidates('linux', {}, '6.1.0'), []);
});

test('clipboard per platform', () => {
  const tools = (p, env, rel = '') => clipboardCandidates(p, env, rel).map((c) => c.cmd[0]);
  assert.deepStrictEqual(tools('linux', {}, '5.15.0-microsoft-standard'), ['clip.exe']);
  assert.deepStrictEqual(tools('darwin', {}), ['pbcopy']);
  assert.deepStrictEqual(tools('linux', { WAYLAND_DISPLAY: 'wayland-0', DISPLAY: ':0' }), ['wl-copy', 'xclip', 'xsel']);
  assert.deepStrictEqual(tools('linux', {}), []);
});

test('clip.exe buffer is UTF-16LE with CRLF and no BOM', () => {
  const buf = toClipExeBuffer('ñ\nb');
  assert.notDeepStrictEqual([...buf.subarray(0, 2)], [0xff, 0xfe]);
  assert.strictEqual(buf.toString('utf16le'), 'ñ\r\nb');
});

test('openUrl falls through missing binaries and flags uncertain rundll32 exits', () => {
  const win = openerCandidates('win32', {}, '');
  const linux = [['missing-opener'], ['xdg-open']];
  const missingFirst = (cmd) => (cmd[0] === 'missing-opener' ? { ok: false, reason: 'ENOENT' } : { ok: true, status: 0 });
  assert.strictEqual(openUrl('u', linux, missingFirst), 'yes:xdg-open');
  assert.strictEqual(openUrl('u', win, () => ({ ok: true, status: 1 })), 'unknown:rundll32.exe-exit-1');
  assert.strictEqual(openUrl('u', [['xdg-open']], () => ({ ok: true, status: 3 })), 'no:xdg-open-exit-3');
  assert.strictEqual(openUrl('u', [], missingFirst), 'no:no-display');
});
