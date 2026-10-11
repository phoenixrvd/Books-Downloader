---
name: release-commit
description: "Git commit workflow."
slash: true
metadata:
  opencode/autoinvoke: false
---

# Release Commit

Create local Git commits when explicitly requested.

## Rules

- Never push.
- Never edit files.
- Never use destructive Git commands.
- Never amend existing commits.
- Never commit secrets.
- Commit messages must be English.
- Follow the project's commit convention. Otherwise use `<type>: <description>` with `feature`, `fix`, `refactor`, or `add`.
- Create separate commits for changes with different purposes.

## Workflow

1. Inspect Git status, diffs, and recent commit messages.
2. Stop if there are no changes.
3. Group changes by purpose and stage only relevant, understood files.
4. Create one local commit per purpose.
5. Report commit subjects, hashes, and remaining Git status.
