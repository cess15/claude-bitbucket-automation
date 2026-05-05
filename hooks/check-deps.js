#!/usr/bin/env node
// bitbucket-automation — SessionStart dependency check
//
// Checks: caveman-commit skill availability + Bitbucket MCP configuration.
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

function hasBitbucketMcp(obj) {
  const servers = obj.mcpServers || {};
  return Object.entries(servers).some(([key, val]) => {
    const keyMatch = key.toLowerCase().includes('bitbucket');
    const serverStr = [val.command, ...(val.args || [])].filter(Boolean).join(' ').toLowerCase();
    const cmdMatch = serverStr.includes('atlassian-bitbucket');
    return keyMatch || cmdMatch;
  });
}

function mcpConfigured() {
  const candidates = [
    path.join(claudeDir, 'settings.json'),   // ~/.claude/settings.json
    path.join(os.homedir(), '.claude.json'), // ~/.claude.json (Linux/Mac)
  ];

  // Windows home via USERPROFILE (available in WSL when inherited from Windows)
  if (process.env.USERPROFILE) {
    candidates.push(path.join(process.env.USERPROFILE, '.claude.json'));
  }

  for (const p of candidates) {
    try {
      if (!fs.existsSync(p)) continue;
      const data = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (hasBitbucketMcp(data)) return true;
    } catch (e) {
      // Unreadable or invalid JSON — skip
    }
  }
  return false;
}

const lines = [];

if (!skillExists()) {
  lines.push('BITBUCKET_AUTOMATION_CAVEMAN_COMMIT=missing');
  lines.push('bitbucket-automation: caveman-commit skill not found — commit messages will be generated inline by the model (higher token cost, less consistency). To optimize: claude plugin install caveman@caveman');
} else {
  lines.push('BITBUCKET_AUTOMATION_CAVEMAN_COMMIT=available');
}

if (!mcpConfigured()) {
  lines.push('BITBUCKET_AUTOMATION_MCP=unavailable');
  lines.push('bitbucket-automation: Bitbucket MCP not configured — PR will be shown as a manual preview (copy-paste). Reviewers and duplicate PR checks will be skipped.');
} else {
  lines.push('BITBUCKET_AUTOMATION_MCP=available');
}

console.log(lines.join('\n'));
