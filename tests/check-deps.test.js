const test = require('node:test');
const assert = require('node:assert');
const {
  isBitbucketServer, isGithubServer, collectServers, findServer, githubHost,
} = require('../hooks/check-deps.js');

test('detects Bitbucket server by key or package name', () => {
  assert.ok(isBitbucketServer('bitbucket', {}));
  assert.ok(isBitbucketServer('atl', { command: 'npx', args: ['-y', '@aashari/mcp-server-atlassian-bitbucket'] }));
  assert.ok(!isBitbucketServer('Snyk', { command: 'snyk', args: ['mcp'] }));
});

test('detects GitHub server by key, remote URL or local binary', () => {
  assert.ok(isGithubServer('github', {}));
  assert.ok(isGithubServer('gh', { type: 'http', url: 'https://api.githubcopilot.com/mcp/' }));
  assert.ok(isGithubServer('work', { type: 'http', url: 'https://copilot-api.example.ghe.com/mcp/' }));
  assert.ok(isGithubServer('local', { command: 'docker', args: ['run', 'ghcr.io/github/github-mcp-server'] }));
  assert.ok(!isGithubServer('bitbucket', { command: 'npx', args: ['@aashari/mcp-server-atlassian-bitbucket'] }));
});

test('merges user-scope and current-project servers only', () => {
  const data = {
    mcpServers: { bitbucket: { command: 'npx' } },
    projects: {
      '/work/repo': { mcpServers: { github: { url: 'https://copilot-api.example.ghe.com/mcp/' } } },
      '/other': { mcpServers: { gitlab: { url: 'https://gitlab.example.com/mcp' } } },
    },
  };
  assert.deepStrictEqual(Object.keys(collectServers(data, '/work/repo')).sort(), ['bitbucket', 'github']);
  assert.deepStrictEqual(Object.keys(collectServers(data, '/elsewhere')), ['bitbucket']);
});

test('findServer returns the configured server name', () => {
  const servers = { Snyk: {}, 'work-github': { url: 'https://copilot-api.example.ghe.com/mcp/' } };
  assert.strictEqual(findServer(servers, isGithubServer), 'work-github');
  assert.strictEqual(findServer({}, isGithubServer), null);
});

test('githubHost maps remote MCP endpoints to their git host', () => {
  assert.strictEqual(githubHost({ url: 'https://api.githubcopilot.com/mcp/' }), 'github.com');
  assert.strictEqual(githubHost({ url: 'https://copilot-api.example.ghe.com/mcp/' }), 'example.ghe.com');
  assert.strictEqual(githubHost({ command: 'github-mcp-server' }), 'unknown');
  assert.strictEqual(githubHost({ url: 'https://evil.example.com/copilot-api.x.ghe.com/mcp' }), 'unknown');
});
