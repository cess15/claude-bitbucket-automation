---
description: Create a Bitbucket PR — commit staged changes and open pull request
argument-hint: [auto|safe] [branch]
allowed-tools: [Bash, mcp__bitbucket__bb_get, mcp__bitbucket__bb_post]
---

## Argument parsing

Args provided by user: $ARGUMENTS

Parse in order:

- `auto` → mode=auto
- `safe` or `normal` → mode=safe
- a branch name (anything that isn't a mode keyword) → use as `<TARGET>`
- no arg → mode=unset

If `<TARGET>` is not specified, default to `develop`. Never use `master` as a default.

Examples:
- `/bitbucket-workflow auto` → mode=auto, target=develop
- `/bitbucket-workflow safe` → mode=safe, target=develop
- `/bitbucket-workflow auto staging` → mode=auto, target=staging
- `/bitbucket-workflow safe release/2.0` → mode=safe, target=release/2.0
- `/bitbucket-workflow` → mode=unset, target=develop

---

## Mode: unset — ask first

If no mode was given, ask the user before doing anything:

```
Which mode?

  auto   → execute all steps immediately, no confirmations
  safe   → confirm each step before executing
  cancel → abort

Reply: auto | safe | cancel
```

If user replies `cancel` → report "Cancelled. No changes made." and stop.
Otherwise wait for the reply, then proceed with the chosen mode below.

---

## Mode: AUTO — delegate to agent

Invoke the `bitbucket-agent` Agent with this prompt (fill in the real `<TARGET>`):

```
Create a pull request from the current branch to <TARGET>. Mode is pre-set to: AUTO — execute all steps immediately without confirmation.
```

Do not do any git work yourself. The agent handles everything.

---

## Mode: SAFE — run inline (YOU execute this, do not use an agent)

**Critical: do NOT spawn a sub-agent for safe mode. Sub-agents cannot receive user replies between steps. Run the entire workflow yourself in this conversation.**

### Step 1 — Gather context silently (no user interaction)

Run these bash commands:

```bash
git diff --cached --stat
git diff --cached --name-only
git branch --show-current
git remote get-url origin
git log origin/<TARGET>..<SOURCE> --oneline
git log origin/<TARGET>..<SOURCE> --pretty=format:"%h %s%n%b"
# Detect if branch has a remote tracking ref
git rev-parse --verify origin/<SOURCE> 2>/dev/null && echo "HAS_REMOTE" || echo "__NO_REMOTE_TRACKING__"
# Only run if above printed HAS_REMOTE:
git log origin/<SOURCE>..HEAD --oneline 2>/dev/null
```

Extract `<workspace>` and `<repo>` from the remote URL.
`<SOURCE>` = current branch from `git branch --show-current`.
`<TARGET>` = the value parsed from args above (default: `develop`).

If `git rev-parse` outputs `__NO_REMOTE_TRACKING__`, treat branch as new on remote → push will use `git push -u origin <SOURCE>`. Run the `git log` only when remote ref exists.

### Step 2 — Fetch PR data and default reviewers (MCP optional)

Check session context for `BITBUCKET_AUTOMATION_MCP`:

- **`unavailable`** → skip this step entirely. Set `<reviewers>=[]` and `<existing-pr>=none`. Continue to Step 3.
- **`available`** → make two parallel `bb_get` calls:

**Call A — existing open PRs:**

Before building the `jq` expression, escape `<SOURCE>` and `<TARGET>` for embedding in a jq string: replace every `\` with `\\` and every `"` with `\"`.

```
mcp__bitbucket__bb_get({
  path: "/repositories/<workspace>/<repo>/pullrequests",
  queryParams: { state: "OPEN", pagelen: "50" },
  jq: "[.values[] | select(.source.branch.name == \"<escaped-SOURCE>\" and .destination.branch.name == \"<escaped-TARGET>\") | {id: .id, title: .title, url: .links.html.href}]"
})
```

**Call B — default reviewers:**
```
mcp__bitbucket__bb_get({
  path: "/repositories/<workspace>/<repo>/default-reviewers",
  jq: "[.values[] | {uuid: .uuid, name: .display_name}]"
})
```

Store both results. Do not call bb_get again after this step.
If the reviewers list is empty, proceed without reviewers.

### Step 3 — Generate commit message (only if staged changes exist; skip if none)

Check session context for `BITBUCKET_AUTOMATION_CAVEMAN_COMMIT`:

- **`available`** → invoke caveman-commit skill to generate the message from `git diff --cached`
- **`missing`** → generate inline: derive a conventional commit message directly from the diff
  - Format: `<type>(<scope>): <description>`
  - Types: `feat`, `fix`, `refactor`, `docs`, `chore`, `perf`, `test`
  - Imperative mood, under 50 chars, no AI attribution, no trailing period

### Step 4 — Generate PR title and description

Synthesize all commits (`<TARGET>..<SOURCE>` plus pending staged commit if any) into:
- **Title**: one conventional commit line
- **Description**:
  ```markdown
  ## Summary
  <Concise overview derived from the actual commits>

  ## Issue
  <Problem these commits solve — what was broken, missing, or needed>

  ## Changes
  - <real change 1 from commits>
  - <real change 2 from commits>

  ## Impacted areas
  - <module, service, function, or process affected by the changes>

  ## Additional notes
  <Relevant context that didn't fit in commit messages — constraints, decisions, known limitations>

  ## Testing
  <Concrete steps to verify based on what changed>
  ```
  Omit a section entirely if there is nothing meaningful to write for it.

### Step 5 — Show plan and confirm each step

Show the full plan, then confirm each step one at a time:

---

**STEP A — Commit** *(skip if no staged changes)*

```
Ready to commit:
  <commit-message>
  Files: <staged files>

Proceed? (yes / no / cancel)
```

Wait for reply.
- `yes` → `git commit -m "<commit-message>"` → report result.
- `no` → skip, continue to STEP B.
- `cancel` → report "Cancelled. No changes made." and stop.

---

**STEP B — Push** *(skip if branch is already up to date on remote)*

```
Ready to push:
  <SOURCE> → origin

Proceed? (yes / no / cancel)
```

Wait for reply.
- `yes` → `git push origin <SOURCE>` (or `git push -u origin <SOURCE>` if new) → report result.
- `no` → skip, continue to STEP C.
- `cancel` → report "Cancelled. No further changes made." and stop.

---

**STEP C — Create Pull Request**

```
Ready to create pull request:
  <pr-title>
  <SOURCE> → <TARGET>  |  <workspace>/<repo>

Proceed? (yes / no / cancel)
```

Wait for reply.
- `cancel` → report "Cancelled. No further changes made." and stop.
- `no` → report "PR creation skipped." and stop.
- `yes` → check `BITBUCKET_AUTOMATION_MCP`:
  - **`available`** → call `mcp__bitbucket__bb_post`:
    ```
    mcp__bitbucket__bb_post({
      path: "/repositories/<workspace>/<repo>/pullrequests",
      body: {
        "title": "<pr-title>",
        "description": "<pr-description>",
        "source": { "branch": { "name": "<SOURCE>" } },
        "destination": { "branch": { "name": "<TARGET>" } },
        "reviewers": [{ "uuid": "<uuid1>" }, { "uuid": "<uuid2>" }],
        "close_source_branch": false
      }
    })
    ```
    Omit `"reviewers"` entirely if the list fetched in Step 2 was empty.
    Report: `✓ Pull request created: #<id> — <url>`
  - **`unavailable`** → show manual fallback:
    ```
    PR ready — create it manually:

    URL: https://bitbucket.org/<workspace>/<repo>/pull-requests/new?source=<SOURCE>&dest=<TARGET>

    Title (copy-paste):
    <pr-title>

    Description (copy-paste):
    <pr-description>
    ```

Note: `cancel` at any step stops execution immediately with no further changes.
