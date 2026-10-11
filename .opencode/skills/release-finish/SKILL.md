---
name: release-finish
description: "Release finishing workflow."
slash: true
metadata:
  opencode/autoinvoke: false
---

# Release Finish

## Rules (BLOCKER)

- **NEVER push.** Local commit only.
- Never use destructive Git commands.
- No code changes outside the release workflow.
- Determine release, build, test, and dependency rules.
- Do not invent release commands; stop if ambiguous.
- Use the project's target branch; use `main` as fallback.
- Release branches use the `v<version>` format, for example `v1.0`.
- Do not create Git tags or GitHub releases unless the user explicitly requests them.

## Workflow

Run the local release workflow without push:

1. Check the working tree; stop if it has uncommitted changes.
2. Validate the release branch, target branch, and version; stop if they are missing, identical, or inconsistent.
3. Determine required release checks and the release commit subject from project rules and changes. If the subject is not safely inferable, ask before changing Git state.
4. Run required release checks; stop on failure.
5. Switch to the target branch.
6. If it has a configured upstream, run `git pull --ff-only`; stop on failure.
7. Run `git merge --squash <release-branch>`. If configured `merge.ff=false` causes a `--no-ff` conflict, retry once with `git -c merge.ff=true merge --squash <release-branch>` without changing Git configuration. On conflicts or other failures, stop without further changes and report the state.
8. Verify that the squash staged changes; if not, stop without creating a commit.
9. Create exactly one local release commit from the staged squash result.
10. Report the result.

## Commit Format

Use the project convention if one exists. Otherwise use [TEMPLATE.md](TEMPLATE.md).

## Output

- Commit subject
- Short description
- Release notes, if included
- Branch, commit, file count
