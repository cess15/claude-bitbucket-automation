# Getting started

From zero to your first pull request with `pr-automation`. Takes about 10 minutes.

## 1. Requirements

| Requirement | Check |
|-------------|-------|
| Claude Code ≥ 2.1.261 | `claude --version` |
| Node.js ≥ 16 | `node --version` |
| Git with an `origin` remote | `git remote -v` |
| Windows only: WSL | Run Claude Code and VS Code inside WSL (see step 5) |

## 2. Install the plugin

```bash
claude plugin marketplace add cess15/claude-pr-automation
claude plugin install pr-automation@pr-automation
```

Optional, for consistent commit messages:

```bash
claude plugin marketplace add JuliusBrussee/caveman
claude plugin install caveman@caveman
```

Restart Claude Code or run `/reload-plugins`. `/pr-automation:create-pr` should appear in the `/` menu.

To receive updates automatically: `/plugin` → **Marketplaces** → `pr-automation` → **Enable auto-update**.

## 3. Connect GitHub (recommended)

Without this step the plugin still works: it opens the PR form in your browser instead of creating the PR.

Ask your GitHub admin for:

- the **MCP server URL**: `https://api.githubcopilot.com/mcp/` for `github.com`, or `https://copilot-api.<subdomain>.ghe.com/mcp/` for GitHub Enterprise Cloud
- the **OAuth App client ID** approved for your organization, and how to obtain its client secret

Then, in a terminal (it prompts for the secret, so it never lands in your shell history):

```bash
claude mcp add -s user --transport http --client-id <client-id> --client-secret --callback-port 8765 github <mcp-server-url>
```

- Keep the name `github`: the plugin grants `mcp__github__*` tools by that name.
- In Claude Code run `/mcp` → `github` → **Authenticate**, and sign in (SSO if your organization uses it).
- `claude mcp list` must show `github: … ✔ Connected`.

Bitbucket repos use the `@aashari/mcp-server-atlassian-bitbucket` MCP server instead — see the README.

## 4. Your first PR

```bash
git switch -c feat/my-change
# edit files
git add <files>
```

In Claude Code:

```
/pr-automation:create-pr safe develop
```

1. The plugin shows a plan: commit message, push, PR title and description, existing-PR warning.
2. It asks before each step — answer `yes`, `no` or `cancel`.
3. With MCP: the PR is created, assigned to you and labeled (`feat` → `enhancement`, `fix` → `bug`, `docs` → `documentation`).
4. Without MCP: your browser opens the PR form filled in, and the description is on your clipboard.

Use `auto` instead of `safe` to run every step without confirmations. Without a branch name, the target is `develop`.

## 5. VS Code (Windows + WSL)

Open the project from WSL so the extension runs where Claude Code, Node and Git live:

```bash
cd /path/to/repo
code .
```

The status bar must show **WSL: <distro>**. Install the Claude Code extension with **Install in WSL**. `/mcp` in the extension panel shows the same servers as the CLI.

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `github: ! Needs authentication` | OAuth session missing or expired | `/mcp` → `github` → **Authenticate** |
| `403 … OAuth App access restrictions` | Organization has not approved the OAuth App | Ask an organization owner to approve it under **Third-party access** |
| `Incompatible auth server: does not support dynamic client registration` | Server added without `--client-id` | Remove it and add it again with `--client-id` and `--client-secret` |
| Plan says `GitHub MCP serves <host>, origin is <host>` | Repo is on a different GitHub host than the MCP server | Expected: the browser fallback is used |
| No reviewers on the PR | Repo has no `CODEOWNERS` | Add `.github/CODEOWNERS` to the repo |
| Linux: description not copied | No clipboard tool | `sudo apt install wl-clipboard` (Wayland) or `sudo apt install xclip` (X11) |
| Plugin behaves like an old version | Update not installed | `claude plugin marketplace update pr-automation && claude plugin update pr-automation@pr-automation`, then `/reload-plugins` |
