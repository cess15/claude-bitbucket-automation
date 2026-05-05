# bitbucket-automation plugin

Provides Bitbucket PR automation for Claude Code: staged-change commits + PR creation via MCP, without credentials exposure.

---

## Command provided

| Command | Usage |
|---------|-------|
| `/bitbucket-workflow` | `/bitbucket-workflow [auto\|safe] [branch]` |

Triggers: "create a PR", "open a pull request", "PR to \<branch\>", "commit and PR".

## Agent provided

| Agent | When used |
|-------|-----------|
| `bitbucket-agent` | Spawned by `bitbucket-workflow` skill in auto mode |

---

## Hard rules — always enforce

- **Never add AI attribution** (`Co-Authored-By: Claude` or similar) to commits or PRs
- **Never run MCP tool names as bash commands** — `bb_get`, `bb_post` are MCP tools only
- **Never use curl** with tokens — MCP handles auth
- **Default target branch: `develop`** — never `master` unless user says so

---

## MCP dependency

Requires `@aashari/mcp-server-atlassian-bitbucket` MCP server configured and authenticated.
Tools used: `mcp__bitbucket__bb_get`, `mcp__bitbucket__bb_post`.
