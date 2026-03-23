#!/usr/bin/env bash
# Hook script: runs after every Bash tool use.
# If the command was a git commit, injects context telling Claude
# to review the diff and update STATUS.md / CLAUDE.md if needed.

set -e

# Read stdin (JSON from Claude Code)
INPUT=$(cat)

# Extract the bash command that just ran
CMD=$(echo "$INPUT" | jq -r '.tool_input.command // ""' 2>/dev/null)

# Only trigger on successful git commits (not amends, not "git commit" in comments)
if ! echo "$CMD" | grep -qE '^\s*git\s+commit\s'; then
  exit 0
fi

# Check we're in the right repo
cd /Users/ashkannaderi/CEOGTMOPS/ceo-dashboard 2>/dev/null || exit 0

# Get the diff summary for context
DIFF_STAT=$(git diff --stat HEAD~1 2>/dev/null || echo "no diff available")
COMMIT_MSG=$(git log -1 --pretty=format:"%s" 2>/dev/null || echo "unknown")
FILES_CHANGED=$(git diff --name-only HEAD~1 2>/dev/null | tr '\n' ', ')

# Build the context injection
cat <<ENDJSON
{
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "additionalContext": "POST-COMMIT DOC CHECK: A git commit just landed.\n\nCommit: ${COMMIT_MSG}\nFiles changed: ${FILES_CHANGED}\nDiff stat:\n${DIFF_STAT}\n\nReview these changes and determine if STATUS.md or CLAUDE.md need updating. Rules:\n- UPDATE if: new features, new constants/IDs, new API endpoints, architecture changes, new gotchas, version bump, branch changes\n- SKIP if: typo fixes, CSS tweaks, formatting, test-only changes, doc-only changes (already updated)\n- If updating STATUS.md, also update the 'Last updated' date\n- If updating CLAUDE.md, keep it concise — it's auto-loaded every session\n- Tell the user what you updated and why (or that no update was needed)"
  }
}
ENDJSON
