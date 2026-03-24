#!/usr/bin/env bash
# Hook script: runs after every Bash tool use.
# If the command was a git commit, REQUIRES Claude to review and update docs.

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
    "additionalContext": "MANDATORY DOC REVIEW — DO NOT SKIP. A git commit just landed. You MUST review the changes below and update any relevant docs BEFORE moving to the next task.\n\nCommit: ${COMMIT_MSG}\nFiles changed: ${FILES_CHANGED}\nDiff stat:\n${DIFF_STAT}\n\nDOC CHECKLIST — review each file and update if relevant:\n\n1. STATUS.md — Update if: version bump, feature completion, current state change. Update 'Last updated' date.\n2. CLAUDE.md — Update if: new files, new constants/IDs, new API endpoints, architecture changes, new gotchas. Keep concise.\n3. CHANGELOG.md — Update if: version bump. Add detailed what/why/files entry.\n4. ARCHITECTURE.md — Update if: new API endpoints, schema changes, new data flows.\n5. DEPLOYMENT.md — Update if: new env vars, server config changes, deploy process changes.\n6. README.md — Update if: major feature additions, setup changes.\n7. src/app/updates/page.tsx — Update if: version bump. Add user-facing release notes.\n\nSKIP ALL only if: the commit is a typo fix, CSS-only tweak, test-only change, or doc-only change.\n\nTell the user which docs you updated (or that none needed updating and why)."
  }
}
ENDJSON
