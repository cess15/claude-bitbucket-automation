# Provider: GitHub

Implements the four provider operations used by `pr-workflow` for `github.com`
and GitHub Enterprise Cloud hosts (`*.ghe.com`).

## MCP tools

GitHub MCP server (remote `https://api.githubcopilot.com/mcp/`, or
`https://copilot-api.<subdomain>.ghe.com/mcp/` for GHE.com). Tools used:

```
mcp__github__list_pull_requests   → find an open PR for the same head/base
mcp__github__create_pull_request  → create the PR
```

MCP availability comes from the session context flag `BITBUCKET_AUTOMATION_GITHUB_MCP`:
- `available:<server-name>@<server-host>` → tools are `mcp__<server-name>__list_pull_requests` / `mcp__<server-name>__create_pull_request`
- `unavailable` → no API calls; use **manual_fallback**

**Host check:** the MCP server can only reach the git host it serves. If `<server-host>` differs from the `<host>` from parse_remote (and is not `unknown`), treat MCP as `unavailable` for this repo — make no MCP calls — and note `GitHub MCP serves <server-host>, origin is <host>` in the plan.

MCP tools are NOT shell commands. Never call the GitHub API with curl, `gh api` or tokens.

---

## parse_remote

Extract `<host>`, `<owner>` and `<repo>` (strip a trailing `.git`) from the `origin` URL:
- `https://<host>/<owner>/<repo>.git`
- `git@<host>:<owner>/<repo>.git`
- `ssh://git@<host>/<owner>/<repo>.git`

The repository shown in the plan is `<owner>/<repo>` on `<host>`.

---

## prefetch

**PR template** (always, no API): look for a template committed in the repo:

```bash
git ls-files -- ':(icase).github/pull_request_template.md' ':(icase)pull_request_template.md' ':(icase)docs/pull_request_template.md'
```

If a path is printed, Read the first one and store its content as `<pr-template>`. Otherwise `<pr-template>=none`.

**Reviewers**: GitHub assigns reviewers from `CODEOWNERS` when the PR is created. Set `<reviewers>=auto (CODEOWNERS)`; never send a reviewers list.

**Existing PR**:
- **`unavailable`** (or host check failed) → `<existing-pr>=none`.
- **`available:<server-name>@<server-host>`** (host check passed) → one call, do not repeat it later:
  ```
  mcp__<server-name>__list_pull_requests({
    owner: "<owner>",
    repo: "<repo>",
    state: "open",
    head: "<owner>:<source-branch>",
    base: "<target-branch>",
    fields: ["number", "title", "html_url"],
    perPage: 5
  })
  ```
  If a PR is returned, store its `number` and `html_url` as `<existing-pr>`.
  If the call fails, set `<existing-pr>=none` and continue; mention the error in the plan.

---

## create_pr

- **`available:<server-name>@<server-host>`** (host check passed) → call:
  ```
  mcp__<server-name>__create_pull_request({
    owner: "<owner>",
    repo: "<repo>",
    title: "<pr-title>",
    body: "<pr-description>",
    head: "<source-branch>",
    base: "<target-branch>",
    draft: false
  })
  ```
  Report: `✓ Pull request created: #<number> — <html_url>`
  If the call returns an error → run **manual_fallback** with the error header. Do NOT suggest curl, tokens, `gh`, or MCP config changes.
- **`unavailable`** or host check failed → run **manual_fallback**.

---

## manual_fallback

Header: `PR ready — create it manually:` (or, after an MCP error: `The GitHub MCP tool returned an error. Create the PR manually:`)

```
<header>

URL: https://<host>/<owner>/<repo>/compare/<target-branch>...<source-branch>?expand=1

Title (copy-paste):
<pr-title>

Description (copy-paste):
<pr-description>
```
