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

- Bitbucket only (no GitHub / GitLab)
- Requires at least one `git remote` named `origin`
- Branch names containing jq-special characters (`"`, `\`) are escaped automatically; other exotic characters may still cause issues in edge cases

## License

MIT © [Cesar Lata](https://github.com/cess15)
