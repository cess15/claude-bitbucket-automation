#!/usr/bin/env node
// Opens the provider's "new pull request" page with title and description
// prefilled where the provider allows it, and copies the description to the
// clipboard when it cannot travel in the URL.
//
// Input on stdin (no shell quoting needed; branch names may contain ' $ & ;):
//   provider=github|bitbucket
//   host=<git host>
//   owner=<owner or workspace>
//   repo=<repo>
//   source=<source branch>
//   target=<target branch>
//   title=<pr title>
//   ---
//   <pr description, any number of lines>
//
// Output: KEY=value lines (URL, PREFILLED, OPENED, CLIPBOARD) for the caller.
// Flag --dry-run prints the plan without opening or copying anything.

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');

// Browsers and proxies start truncating or rejecting URLs past ~8 KB.
const MAX_URL_LENGTH = 8000;
const SPAWN_TIMEOUT_MS = 5000;

function parseInput(text) {
  const normalized = text.replace(/\r\n/g, '\n');
  const sep = normalized.indexOf('\n---\n');
  const head = sep === -1 ? normalized : normalized.slice(0, sep);
  const body = sep === -1 ? '' : normalized.slice(sep + 5).replace(/\n+$/, '');
  const fields = {};
  for (const line of head.split('\n')) {
    const eq = line.indexOf('=');
    if (eq > 0) fields[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  for (const key of ['provider', 'host', 'owner', 'repo', 'source', 'target', 'title']) {
    if (!fields[key]) throw new Error(`missing field: ${key}`);
  }
  if (!['github', 'bitbucket'].includes(fields.provider)) {
    throw new Error(`unsupported provider: ${fields.provider}`);
  }
  if (!/^[a-z0-9.-]+$/i.test(fields.host)) throw new Error(`invalid host: ${fields.host}`);
  return { ...fields, body };
}

// encodeURIComponent leaves !'()* as is; terminals end clickable links at
// those characters, so the rest of a prefilled URL would be lost on click.
function enc(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function encodeBranch(branch) {
  return branch.split('/').map(enc).join('/');
}

// GitHub's compare page accepts quick_pull, title and body as query params.
function buildGithub(pr) {
  const base = `https://${pr.host}/${enc(pr.owner)}/${enc(pr.repo)}/compare/`
    + `${encodeBranch(pr.target)}...${encodeBranch(pr.source)}?quick_pull=1`
    + `&title=${enc(pr.title)}`;
  const full = pr.body ? `${base}&body=${enc(pr.body)}` : base;
  if (full.length <= MAX_URL_LENGTH) {
    return { url: full, prefilled: pr.body ? 'title,body' : 'title', clipboardText: null };
  }
  return { url: base, prefilled: 'title', clipboardText: pr.body };
}

// Bitbucket's new-PR page only takes source and destination branches.
function buildBitbucket(pr) {
  const url = `https://${pr.host}/${enc(pr.owner)}/${enc(pr.repo)}/pull-requests/new`
    + `?source=${enc(pr.source)}&dest=${enc(pr.target)}`;
  return { url, prefilled: 'none', clipboardText: pr.body || null };
}

function buildPlan(pr) {
  return pr.provider === 'github' ? buildGithub(pr) : buildBitbucket(pr);
}

function isWsl(platform, env, release) {
  return platform === 'linux' && (Boolean(env.WSL_DISTRO_NAME) || /microsoft/i.test(release));
}

function hasDisplay(env) {
  return Boolean(env.DISPLAY || env.WAYLAND_DISPLAY);
}

// explorer.exe treats long or query-heavy URLs as paths and opens File
// Explorer; FileProtocolHandler hands the URL straight to the default browser.
const WINDOWS_OPENER = ['rundll32.exe', 'url.dll,FileProtocolHandler'];

// Candidates are tried in order; a missing binary (ENOENT) moves to the next.
function openerCandidates(platform, env, release) {
  if (isWsl(platform, env, release) || platform === 'win32') return [WINDOWS_OPENER];
  if (platform === 'darwin') return [['open']];
  if (platform === 'linux' && hasDisplay(env)) return [['xdg-open']];
  return [];
}

function clipboardCandidates(platform, env, release) {
  if (isWsl(platform, env, release) || platform === 'win32') return [{ cmd: ['clip.exe'], utf16: true }];
  if (platform === 'darwin') return [{ cmd: ['pbcopy'], utf16: false }];
  if (platform === 'linux') {
    const list = [];
    if (env.WAYLAND_DISPLAY) list.push({ cmd: ['wl-copy'], utf16: false });
    if (env.DISPLAY) {
      list.push({ cmd: ['xclip', '-selection', 'clipboard'], utf16: false });
      list.push({ cmd: ['xsel', '--clipboard', '--input'], utf16: false });
    }
    return list;
  }
  return [];
}

// clip.exe garbles UTF-8 (console code page) but detects UTF-16LE input; a BOM
// would be kept as an invisible first character, so none is sent.
function toClipExeBuffer(text) {
  return Buffer.from(text.replace(/\r?\n/g, '\r\n'), 'utf16le');
}

function run(cmd, input) {
  const [bin, ...args] = cmd;
  const res = spawnSync(bin, args, { input, timeout: SPAWN_TIMEOUT_MS, stdio: ['pipe', 'ignore', 'ignore'] });
  if (res.error) return { ok: false, reason: res.error.code || res.error.message };
  return { ok: true, status: res.status };
}

function openUrl(url, candidates, runner = run) {
  if (candidates.length === 0) return 'no:no-display';
  for (const cmd of candidates) {
    const res = runner([...cmd, url]);
    if (res.reason === 'ENOENT') continue;
    if (!res.ok) return `no:${res.reason}`;
    if (res.status === 0) return `yes:${cmd[0]}`;
    // rundll32 sometimes exits 1 after the browser has opened the URL.
    if (cmd === WINDOWS_OPENER) return `unknown:${cmd[0]}-exit-${res.status}`;
    return `no:${cmd[0]}-exit-${res.status}`;
  }
  return 'no:no-opener';
}

function copyText(text, candidates) {
  if (candidates.length === 0) return 'no:no-clipboard';
  for (const c of candidates) {
    const res = run(c.cmd, c.utf16 ? toClipExeBuffer(text) : Buffer.from(text, 'utf8'));
    if (res.reason === 'ENOENT') continue;
    if (res.ok && res.status === 0) return `yes:${c.cmd[0]}`;
    return `no:${res.reason || `${c.cmd[0]}-exit-${res.status}`}`;
  }
  return 'no:no-clipboard-tool';
}

function main() {
  const dryRun = process.argv.includes('--dry-run');
  let pr;
  try {
    pr = parseInput(fs.readFileSync(0, 'utf8'));
  } catch (e) {
    console.log(`ERROR=${e.message}`);
    process.exit(2);
  }
  const plan = buildPlan(pr);
  const env = process.env;
  const release = os.release();
  const lines = [`URL=${plan.url}`, `PREFILLED=${plan.prefilled}`];

  if (dryRun) {
    lines.push('OPENED=no:dry-run');
    lines.push(`CLIPBOARD=${plan.clipboardText ? 'no:dry-run' : 'none'}`);
  } else {
    lines.push(`OPENED=${openUrl(plan.url, openerCandidates(process.platform, env, release))}`);
    lines.push(`CLIPBOARD=${plan.clipboardText ? copyText(plan.clipboardText, clipboardCandidates(process.platform, env, release)) : 'none'}`);
  }
  console.log(lines.join('\n'));
}

if (require.main === module) main();

module.exports = {
  MAX_URL_LENGTH, parseInput, buildPlan, openerCandidates, clipboardCandidates, toClipExeBuffer, openUrl,
};
