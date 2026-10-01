# bitbucket-automation

Claude Code plugin — commit staged changes and create Bitbucket pull requests via MCP without exposing credentials.

## What it does

- Detects staged changes, generates a conventional commit message, and commits
- Pushes the branch (with `-u` if new on remote)
- Fetches default reviewers and checks for duplicate open PRs via MCP
- Creates the PR on Bitbucket, or provides a copy-paste fallback if MCP is unavailable
- Two modes: **auto** (no confirmations) and **safe** (confirm each step)

## Prerequisites

| Requirement | Notes |
|-------------|-------|
| [Claude Code](https://claude.ai/code) | CLI or desktop app |
| [`@aashari/mcp-server-atlassian-bitbucket`](https://github.com/aashari/mcp-server-atlassian-bitbucket) | MCP server — handles Bitbucket auth. Plugin works without it but PR creation falls back to copy-paste. |
| [caveman plugin](https://github.com/JuliusBrussee/caveman) *(optional)* | Provides `caveman-commit` skill for consistent conventional commit generation. Without it, commit messages are generated inline by the model. |
| Node.js ≥ 16 | Required for the `check-deps.js` SessionStart hook |

## Installation

```bash
claude plugin marketplace add cess15/claude-bitbucket-automation && claude plugin install bitbucket-automation@bitbucket-automation
```

## Usage

```
/bitbucket-workflow              # asks for mode first
/bitbucket-workflow auto         # execute all steps immediately
/bitbucket-workflow safe         # confirm each step
/bitbucket-workflow auto staging # PR to staging instead of develop
```

**Default target branch: `develop`.** Never `master` unless you specify it.

You can also trigger it naturally:

> "create a PR", "open a pull request", "PR to develop", "commit and PR"

### Modes

| Mode | Behaviour |
|------|-----------|
| `auto` | Commit → push → create PR with no further prompts |
| `safe` | Shows full plan, then confirms commit / push / PR one at a time |

## GitHub

The provider is picked from the `origin` host: `bitbucket.org` → Bitbucket, `github.com` or `*.ghe.com` → GitHub.

With the GitHub MCP server, the plugin checks for an open PR on the same branches and creates the PR; without it, it prints a compare URL plus title and description to copy.

| Host | MCP server URL |
|------|----------------|
| `github.com` | `https://api.githubcopilot.com/mcp/` |
| `<subdomain>.ghe.com` | `https://copilot-api.<subdomain>.ghe.com/mcp/` |

```bash
claude mcp add -s user --transport http --client-id <oauth-app-client-id> --client-secret --callback-port 8765 github <server-url>
```

- Name the server `github`: the agent and command grant `mcp__github__*` tools by that name.
- GitHub's OAuth server does not support dynamic client registration, so an OAuth App (callback `http://localhost:8765/callback`) is required; organizations with OAuth App restrictions must approve it.
- The MCP server only serves its own host; for an `origin` on another host the plugin uses the compare URL.
- Reviewers come from `CODEOWNERS`; a committed `pull_request_template.md` shapes the description.

## Structure

| Path | Role |
|------|------|
| `commands/bitbucket-workflow.md` | Parses args, asks for mode, runs safe mode inline or delegates auto mode to the agent |
| `agents/bitbucket-agent.md` | Auto-mode subagent; loads the `pr-workflow` skill |
| `skills/pr-workflow/SKILL.md` | Shared commit + push + PR workflow (single source of truth) |
| `skills/pr-workflow/providers/bitbucket.md` | Bitbucket-specific operations: remote parsing, duplicate/reviewer lookup, PR creation, manual fallback |
| `skills/pr-workflow/providers/github.md` | GitHub operations: remote parsing, template and duplicate lookup, PR creation, compare-URL fallback |
| `hooks/check-deps.js` | SessionStart dependency check |

## MCP configuration

A SessionStart hook runs `hooks/check-deps.js` to detect whether the Bitbucket MCP server is configured. It scans these files in order:

| File | Platform |
|------|----------|
| `~/.claude/settings.json` | All platforms (Claude Code default) |
| `~/.claude.json` | Linux / macOS |
| `%USERPROFILE%/.claude.json` | Windows / WSL (reads `USERPROFILE` env var) |

A server entry is recognised as Bitbucket if its key contains `"bitbucket"` **or** its `command`/`args` contain `"atlassian-bitbucket"`.

**`~/.claude/settings.json`** (recommended — Claude Code default):

```json
{
  "mcpServers": {
    "bitbucket": {
      "command": "npx",
      "args": ["-y", "@aashari/mcp-server-atlassian-bitbucket"]
    }
  }
}
```

**`~/.claude.json`** (alternative, Linux/macOS):

```json
{
  "mcpServers": {
    "bitbucket": {
      "command": "npx",
      "args": ["-y", "@aashari/mcp-server-atlassian-bitbucket"]
    }
  }
}
```

The hook emits two flags into the session context:

- `BITBUCKET_AUTOMATION_MCP=available|unavailable`
- `BITBUCKET_AUTOMATION_CAVEMAN_COMMIT=available|missing`

These flags control fallback behaviour — no extra configuration needed beyond having the MCP server entry present.

## Hard rules

- Never adds `Co-Authored-By: Claude` or any AI attribution to commits or PRs
- Never runs MCP tool names as shell commands
- Never uses `curl` with tokens — MCP handles all auth
- Never reads or writes `master` as default target branch

## Limitations

- Bitbucket and GitHub only (no GitLab)
- Requires at least one `git remote` named `origin`
- Branch names containing jq-special characters (`"`, `\`) are escaped automatically; other exotic characters may still cause issues in edge cases

## License

MIT © [Cesar Lata](https://github.com/cess15)
