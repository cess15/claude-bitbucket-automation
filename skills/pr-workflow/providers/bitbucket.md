# Provider: Bitbucket

Implements the four provider operations used by `pr-workflow`.

## MCP tools

`@aashari/mcp-server-atlassian-bitbucket` MCP provides 6 generic tools:

```
mcp__bitbucket__bb_get    → GET any Bitbucket API endpoint
mcp__bitbucket__bb_post   → POST to create resources (PRs)
mcp__bitbucket__bb_put    → PUT to replace resources
mcp__bitbucket__bb_patch  → PATCH to update resources
mcp__bitbucket__bb_delete → DELETE resources
mcp__bitbucket__bb_clone  → Clone a repository
```

All paths relative (start with `/repositories/`). `/2.0` prefix added automatically.

**Use: `bb_get` to read, `bb_post` to create PR.** `bb_get` and `bb_post` are MCP tools, NOT shell commands — running them in Bash always fails with exit 127.

**Token optimization — always use `jq` to filter responses.** Default TOON format uses 30–60% fewer tokens than JSON — keep as default. Always pass `jq` expression to extract only needed fields. Never request full response without `jq` filter.

MCP availability comes from the session context flag `PR_AUTOMATION_BITBUCKET_MCP` (`available` | `unavailable`), emitted by the plugin's SessionStart hook.

---

## parse_remote

Extract `<workspace>` and `<repo>` from the `origin` URL:
- `git@bitbucket.org:<workspace>/<repo>.git`
- `https://bitbucket.org/<workspace>/<repo>.git`

---

## prefetch

- **`PR_AUTOMATION_BITBUCKET_MCP=unavailable`** → skip entirely. Set `<reviewers>=[]` and `<existing-pr>=none`.
- **`PR_AUTOMATION_BITBUCKET_MCP=available`** → make exactly TWO `bb_get` calls in parallel. Do NOT call `bb_get` again at any later step.

**Call A — existing open PRs:**

Before building the `jq` expression (which is actually JMESPath — see https://jmespath.org, not jq syntax), escape `<source-branch>` and `<target-branch>` for embedding in the string: replace every `\` with `\\` and every `'` with `\'`.

```
mcp__bitbucket__bb_get({
  path: "/repositories/<workspace>/<repo>/pullrequests",
  queryParams: { state: "OPEN", pagelen: "50" },
  jq: "values[?source.branch.name=='<escaped-source-branch>' && destination.branch.name=='<escaped-target-branch>'].{id: id, title: title, url: links.html.href}"
})
```
If match found, store its `id` and `url` as `<existing-pr>`.

**Call B — default reviewers:**
```
mcp__bitbucket__bb_get({
  path: "/repositories/<workspace>/<repo>/default-reviewers",
  jq: "values[*].{uuid: uuid, name: display_name}"
})
```
Store full list as `<reviewers>`. If empty, proceed without reviewers (don't error).
**Exclude the PR author from the reviewers list before storing** — Bitbucket rejects `POST /pullrequests` with an error if the author's own account is included in `reviewers`. Match each returned reviewer's `name`/`display_name` (and nickname, if present in raw data) against the `git config user.name`/`user.email` captured in Step 1, and drop any match silently — it's expected the author is often also a default reviewer.

---

## create_pr

- **`PR_AUTOMATION_BITBUCKET_MCP=available`** → call `mcp__bitbucket__bb_post`:
  ```
  mcp__bitbucket__bb_post({
    path: "/repositories/<workspace>/<repo>/pullrequests",
    body: {
      "title": "<pr-title>",
      "description": "<pr-description>",
      "source": { "branch": { "name": "<source-branch>" } },
      "destination": { "branch": { "name": "<target-branch>" } },
      "reviewers": [{ "uuid": "<uuid1>" }, { "uuid": "<uuid2>" }],
      "close_source_branch": false
    }
  })
  ```
  Omit `"reviewers"` key entirely if `<reviewers>` is empty.
  Report: `✓ Pull request created: #<id> — <pr-url>`
  If `bb_post` returns an error → run **manual_fallback** with the error header. Do NOT suggest curl, auth commands, or MCP config changes.
- **`PR_AUTOMATION_BITBUCKET_MCP=unavailable`** → run **manual_fallback**.

---

## manual_fallback

Header: `PR ready — create it manually:` (or, after an MCP error: `The Bitbucket MCP tool returned an error. Create the PR manually:`)

```
<header>

URL: https://bitbucket.org/<workspace>/<repo>/pull-requests/new?source=<source-branch>&dest=<target-branch>

Title (copy-paste):
<pr-title>

Description (copy-paste):
<pr-description>
```
