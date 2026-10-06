---
description: Create a Bitbucket or GitHub PR — commit staged changes and open pull request
argument-hint: [auto|safe] [branch]
allowed-tools: [Bash, Read, Skill, mcp__bitbucket__bb_get, mcp__bitbucket__bb_post, mcp__github__list_pull_requests, mcp__github__create_pull_request, mcp__github__get_me, mcp__github__get_label, mcp__github__issue_write]
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
- `/create-pr auto` → mode=auto, target=develop
- `/create-pr safe` → mode=safe, target=develop
- `/create-pr auto staging` → mode=auto, target=staging
- `/create-pr safe release/2.0` → mode=safe, target=release/2.0
- `/create-pr` → mode=unset, target=develop

---

## Mode: unset — ask first

If no mode was given, ask the user before doing anything. Do not run any git command or inspect the working tree before the user picks a mode — the workflow rules (including the ban on bare `git status`/`git diff`) load with the skill.

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

Invoke the `pr-automation:pr-agent` Agent with this prompt. Fill in the real `<TARGET>` and copy each `PR_AUTOMATION_*` line verbatim from this session's SessionStart context; write `absent` for a flag that is not there:

```
Create a pull request from the current branch to <TARGET>. Mode is pre-set to: AUTO — execute all steps immediately without confirmation.

Session flags:
PR_AUTOMATION_BITBUCKET_MCP=<value>
PR_AUTOMATION_GITHUB_MCP=<value>
PR_AUTOMATION_CAVEMAN_COMMIT=<value>
```

A subagent starts with an empty context and never sees the SessionStart hook output, so the flags must travel in the prompt.

Do not do any git work yourself. The agent handles everything.

---

## Mode: SAFE — run inline (YOU execute this, do not use an agent)

**Critical: do NOT spawn a sub-agent for safe mode. Sub-agents cannot receive user replies between steps. Run the entire workflow yourself in this conversation.**

Invoke the Skill tool with skill `pr-automation:pr-workflow` and args `safe <TARGET>`, then follow the loaded instructions exactly, confirming each step with the user.

Note: `cancel` at any step stops execution immediately with no further changes.
