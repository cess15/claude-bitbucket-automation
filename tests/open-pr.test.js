const test = require('node:test');
const assert = require('node:assert');
const {
  MAX_URL_LENGTH, parseInput, buildPlan, openerCandidates, clipboardCandidates, toClipExeBuffer,
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
  assert.ok(plan.url.startsWith('https://vumigroup.ghe.com/vumi-it/portal/compare/develop...fix/it\'s-%245%26co?quick_pull=1&title='));
  assert.ok(plan.url.includes(`&body=${encodeURIComponent('## Summary\nLine with ñ & ?')}`));
  assert.strictEqual(plan.prefilled, 'title,body');
  assert.strictEqual(plan.clipboardText, null);
});

test('github plan moves a long body to the clipboard', () => {
  const body = 'x'.repeat(MAX_URL_LENGTH);
  const plan = buildPlan(parseInput(input({}, body)));
  assert.ok(!plan.url.includes('&body='));
  assert.ok(plan.url.length <= MAX_URL_LENGTH);
  assert.strictEqual(plan.prefilled, 'title');
  assert.strictEqual(plan.clipboardText, body);
});

test('bitbucket plan uses source/dest and always copies the body', () => {
  const plan = buildPlan(parseInput(input({ provider: 'bitbucket', host: 'bitbucket.org', owner: 'vumiteam' })));
  assert.strictEqual(plan.url, 'https://bitbucket.org/vumiteam/portal/pull-requests/new?source=feat%2Flogin&dest=develop');
  assert.strictEqual(plan.prefilled, 'none');
  assert.strictEqual(plan.clipboardText, '## Summary\nLine with ñ & ?');
});

test('opener per platform', () => {
  const wsl = openerCandidates('linux', { WSL_DISTRO_NAME: 'Ubuntu' }, '6.6.87.2-microsoft-standard-WSL2');
  assert.deepStrictEqual(wsl, [['wslview'], ['explorer.exe']]);
  assert.deepStrictEqual(openerCandidates('win32', {}, ''), [['explorer.exe']]);
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
