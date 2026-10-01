# bitbucket-automation — developer guide

This file guides work **on this repository**. It is not shipped with the plugin:
Claude Code loads it only when someone works inside this repo, never in the
sessions of people who install the plugin.

---

## Where rules live

Anything the plugin must do or refuse at runtime belongs in the shipped
components below. A rule written only here does not reach plugin users.

| Path | Shipped | Role |
|------|---------|------|
| `skills/pr-workflow/SKILL.md` | yes | Single source of the commit + push + PR flow and its hard rules |
| `skills/pr-workflow/providers/<provider>.md` | yes | Provider operations: `parse_remote`, `prefetch`, `create_pr`, `manual_fallback` |
| `commands/bitbucket-workflow.md` | yes | Parses `[auto\|safe] [branch]`, asks for mode, runs safe mode inline, delegates auto mode to the agent |
| `agents/bitbucket-agent.md` | yes | Auto-mode subagent; loads `bitbucket-automation:pr-workflow` |
| `hooks/check-deps.js` | yes | SessionStart check; emits `BITBUCKET_AUTOMATION_MCP` and `BITBUCKET_AUTOMATION_CAVEMAN_COMMIT` |
| `.claude-plugin/plugin.json`, `marketplace.json` | yes | Manifest and marketplace entry |
| `CLAUDE.md`, `README.md` | no | Development guide and user docs |

- Change shared behavior in `SKILL.md`, never in the command or agent.
- Keep the command and agent thin: mode and target-branch parsing, then invoke the skill.
- Runtime hard rules (no AI attribution, no MCP tool names in Bash, no curl with tokens, `develop` as default target, no bare `git status`/`git diff`) stay in `SKILL.md`; repeat them in the agent only as a short reminder.

---

## Versioning

- Bump `version` in `.claude-plugin/plugin.json` in every PR that changes a shipped file. Claude Code detects plugin updates by that string; without a bump, installed users never receive the change.
- Semver: patch for fixes, minor for new behavior that keeps compatibility, major for breaking changes (rename, removed command, changed arguments).
- Tag `v<version>` on the merge commit only when the user asks for it.

---

## Testing a change

Load the working copy without installing it, from a directory outside this repo:

```bash
claude -p --plugin-dir /path/to/bitbucket-automation "<prompt>"
```

- Check registration: ask it to list skills and agents containing `pr-workflow` or `bitbucket`.
- Run a flow end to end only with `/bitbucket-workflow` and no mode: it stops at the plan without committing, pushing or creating a PR.
- `claude plugin validate .` validates the marketplace manifest.

---

## Working on this repo

- PRs for this repo target `main` (it has no `develop`). The plugin's own default target for users stays `develop`.
- Commits follow Conventional Commits and carry no AI attribution.
- Commits are GPG-signed with Windows `gpg.exe`; signing fails from WSL, so commit from Windows Git.
