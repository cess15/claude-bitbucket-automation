#!/usr/bin/env node
// bitbucket-automation — SessionStart dependency check
//
// Checks: caveman-commit skill availability + Bitbucket and GitHub MCP configuration.
// Emits status flags consumed by /bitbucket-workflow command and bitbucket-agent.
// Non-blocking — workflow continues with fallbacks regardless of results.

const fs = require('fs');
const path = require('path');
const os = require('os');

const claudeDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');

function skillExists() {
  // 1. Global skills directory
  const globalSkill = path.join(claudeDir, 'skills', 'caveman-commit');
  if (fs.existsSync(globalSkill)) return true;

  // 2. Any installed plugin cache (caveman plugin provides it)
  const cacheRoot = path.join(claudeDir, 'plugins', 'cache');
  if (!fs.existsSync(cacheRoot)) return false;

  let publishers;
  try {
    publishers = fs.readdirSync(cacheRoot);
  } catch (e) {
    return false; // cacheRoot unreadable
  }

  for (const publisher of publishers) {
    const publisherDir = path.join(cacheRoot, publisher);
    let plugins;
    try { plugins = fs.readdirSync(publisherDir); } catch (e) { continue; }

    for (const plugin of plugins) {
      const pluginDir = path.join(publisherDir, plugin);
      let versions;
      try { versions = fs.readdirSync(pluginDir); } catch (e) { continue; }

      for (const version of versions) {
        const skillPath = path.join(pluginDir, version, 'skills', 'caveman-commit');
        if (fs.existsSync(skillPath)) return true;
      }
    }
  }

  return false;
}

function serverString(val) {
  return [val.command, ...(val.args || []), val.url].filter(Boolean).join(' ').toLowerCase();
}

function isBitbucketServer(key, val) {
  return key.toLowerCase().includes('bitbucket') || serverString(val).includes('atlassian-bitbucket');
}

function isGithubServer(key, val) {
  const s = serverString(val);
  return key.toLowerCase().includes('github')
    || s.includes('githubcopilot.com')
    || /\.ghe\.com\/mcp/.test(s)
    || s.includes('github-mcp-server');
}

// User-scope servers live at the top level; `claude mcp add` without -s stores
// them per project under projects[<dir>], and -s project writes <dir>/.mcp.json.
function collectServers(data, projectDir) {
  const project = (data.projects && data.projects[projectDir]) || {};
  return { ...(data.mcpServers || {}), ...(project.mcpServers || {}) };
}

function findServer(servers, predicate) {
  const hit = Object.entries(servers).find(([key, val]) => predicate(key, val || {}));
  return hit ? hit[0] : null;
}

function configuredServers(projectDir) {
  const candidates = [
    path.join(claudeDir, 'settings.json'),   // ~/.claude/settings.json
    path.join(os.homedir(), '.claude.json'), // ~/.claude.json (Linux/Mac)
    path.join(projectDir, '.mcp.json'),      // project-scoped servers
  ];

  // Windows home via USERPROFILE (available in WSL when inherited from Windows)
  if (process.env.USERPROFILE) {
    candidates.push(path.join(process.env.USERPROFILE, '.claude.json'));
  }

  let servers = {};
  for (const p of candidates) {
    try {
      if (!fs.existsSync(p)) continue;
      const data = JSON.parse(fs.readFileSync(p, 'utf8'));
      servers = { ...servers, ...collectServers(data, projectDir) };
    } catch (e) {
      // Unreadable or invalid JSON — skip
    }
  }
  return servers;
}

function main() {
  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const servers = configuredServers(projectDir);
  const bitbucket = findServer(servers, isBitbucketServer);
  const github = findServer(servers, isGithubServer);
  const lines = [];

  if (!skillExists()) {
    lines.push('BITBUCKET_AUTOMATION_CAVEMAN_COMMIT=missing');
    lines.push('bitbucket-automation: caveman-commit skill not found — commit messages will be generated inline by the model (higher token cost, less consistency). To optimize: claude plugin install caveman@caveman');
  } else {
    lines.push('BITBUCKET_AUTOMATION_CAVEMAN_COMMIT=available');
  }

  if (!bitbucket) {
    lines.push('BITBUCKET_AUTOMATION_MCP=unavailable');
    lines.push('bitbucket-automation: Bitbucket MCP not configured — PR will be shown as a manual preview (copy-paste). Reviewers and duplicate PR checks will be skipped.');
  } else {
    lines.push('BITBUCKET_AUTOMATION_MCP=available');
  }

  if (!github) {
    lines.push('BITBUCKET_AUTOMATION_GITHUB_MCP=unavailable');
  } else {
    lines.push(`BITBUCKET_AUTOMATION_GITHUB_MCP=available:${github}`);
  }

  console.log(lines.join('\n'));
}

if (require.main === module) main();

module.exports = { isBitbucketServer, isGithubServer, collectServers, findServer };
