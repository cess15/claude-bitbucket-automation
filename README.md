# pr-automation

Claude Code plugin — commit staged changes and create Bitbucket or GitHub pull requests via MCP without exposing credentials.

Formerly **bitbucket-automation** — see [Migrating from bitbucket-automation](#migrating-from-bitbucket-automation).

## What it does

- Detects staged changes, generates a conventional commit message, and commits
- Pushes the branch (with `-u` if new on remote)
- Checks for duplicate open PRs and fetches default reviewers (Bitbucket) via MCP
- Creates the PR on Bitbucket or GitHub, or provides a copy-paste fallback if MCP is unavailable
- Two modes: **auto** (no confirmations) and **safe** (confirm each step)

## Prerequisites

| Requirement | Notes |
|-------------|-------|
| [Claude Code](https://claude.ai/code) | CLI or desktop app |
| [`@aashari/mcp-server-atlassian-bitbucket`](https://github.com/aashari/mcp-server-atlassian-bitbucket) | MCP server — handles Bitbucket auth. Plugin works without it but PR creation falls back to copy-paste. |
| [caveman plugin](https://github.com/JuliusBrussee/caveman) *(optional)* | Provides `caveman-commit` skill for consistent conventional commit generation. Without it, commit messages are generated inline by the model. |
| GitHub MCP server *(optional)* | For GitHub repos — see [GitHub](#github). Without it, PR creation falls back to a compare URL. |
| Node.js ≥ 16 | Required for the `check-deps.js` SessionStart hook |

## Installation

```bash
claude plugin marketplace add cess15/claude-pr-automation && claude plugin install pr-automation@pr-automation
```

## Usage

```
/create-pr              # asks for mode first
/create-pr auto         # execute all steps immediately
/create-pr safe         # confirm each step
/create-pr auto staging # PR to staging instead of develop
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
- The MCP server only serves its own host; for an `origin` on another host the plugin falls back to the browser.
- Fallback (no MCP, other host, or MCP error): the new-PR page opens in the browser with title and description prefilled; long descriptions, and all Bitbucket descriptions, are copied to the clipboard instead (`clip.exe`, `pbcopy`, `wl-copy`, `xclip` or `xsel`). Without a browser or clipboard, title and description are printed for copy-paste.
- Reviewers come from `CODEOWNERS` (add one per repo; without it no reviewers are requested); a committed `pull_request_template.md` shapes the description.
- After creation the PR is assigned to its author and labeled from the title type: `feat` → `enhancement`, `fix` → `bug`, `docs` → `documentation` (skipped if the label does not exist).

## Structure

| Path | Role |
|------|------|
| `commands/create-pr.md` | Parses args, asks for mode, runs safe mode inline or delegates auto mode to the agent |
| `agents/pr-agent.md` | Auto-mode subagent; loads the `pr-workflow` skill |
| `skills/pr-workflow/SKILL.md` | Shared commit + push + PR workflow (single source of truth) |
| `skills/pr-workflow/providers/bitbucket.md` | Bitbucket-specific operations: remote parsing, duplicate/reviewer lookup, PR creation, manual fallback |
| `skills/pr-workflow/providers/github.md` | GitHub operations: remote parsing, template and duplicate lookup, PR creation, compare-URL fallback |
| `skills/pr-workflow/scripts/open-pr.js` | Fallback: opens the new-PR page prefilled and copies the description to the clipboard (WSL, Windows, macOS, Linux) |
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

- `PR_AUTOMATION_BITBUCKET_MCP=available|unavailable`
- `PR_AUTOMATION_CAVEMAN_COMMIT=available|missing`

These flags control fallback behaviour — no extra configuration needed beyond having the MCP server entry present.

## Migrating from bitbucket-automation

v2.0.0 renamed the plugin, its marketplace and repository. Claude Code treats it as a new plugin, so existing installs do not update by themselves:

```bash
claude plugin uninstall bitbucket-automation@bitbucket-automation
claude plugin marketplace remove bitbucket-automation
claude plugin marketplace add cess15/claude-pr-automation
claude plugin install pr-automation@pr-automation
```

Then run `/reload-plugins`.

| Before | After |
|--------|-------|
| `/bitbucket-workflow` | `/create-pr` |
| `bitbucket-agent` | `pr-agent` |
| `BITBUCKET_AUTOMATION_MCP` | `PR_AUTOMATION_BITBUCKET_MCP` |
| `BITBUCKET_AUTOMATION_GITHUB_MCP` | `PR_AUTOMATION_GITHUB_MCP` |
| `BITBUCKET_AUTOMATION_CAVEMAN_COMMIT` | `PR_AUTOMATION_CAVEMAN_COMMIT` |

Arguments and modes are unchanged.

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
