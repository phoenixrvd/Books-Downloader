---
name: release-start
description: "New release branch workflow."
slash: true
metadata:
  opencode/autoinvoke: false
---

# Release Start

Prepare a local work branch for the next version.

## Rules (BLOCKER)

- Never push.
- Never use destructive Git commands (`reset --hard`, `checkout --`, force push).
- Do not change files; only Git analysis, branch switching, pull, and branch creation.
- Stop and report when there are uncommitted changes.
- Infer the base branch from the project convention; use `main` as fallback.
- If no version is provided, use the next minor version after the highest existing `v<major>.<minor>` local or remote branch. Example: if `v1.0` exists, create `v1.1`.
- Update the base branch only with `git pull --ff-only` when a remote is configured; stop on error.
- Never overwrite or reuse an existing target branch.

## Workflow

1. Run `git status --short --branch`.
2. Check local branches, current remote heads when a remote exists, and identify the base branch.
3. Determine the target release branch. Prefer an explicit user-provided `v<version>` value; otherwise derive the next minor version from all existing local and remote `v<major>.<minor>` branches.
4. If the target branch exists: stop.
5. Check out the base branch and run `git pull --ff-only` when a remote is configured.
6. Run `git checkout -b <target-branch>`.
7. Report the final status.

## Output

- Created branch
- Base branch and commit hash
- Final Git status
- On stop: reason and next step
