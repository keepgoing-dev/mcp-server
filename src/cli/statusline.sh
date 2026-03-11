#!/bin/bash
# KeepGoing statusline script for Claude Code
# Reads .keepgoing/current-tasks.json and displays the current task summary.
# Invoked by Claude Code's statusLine feature after each assistant message.
# Receives JSON session data on stdin per the statusline protocol.

input=$(cat)
DIR=$(echo "$input" | jq -r '.workspace.current_dir // .cwd // empty')

if [ -z "$DIR" ]; then
  exit 0
fi

TASKS_FILE="$DIR/.keepgoing/current-tasks.json"

if [ ! -f "$TASKS_FILE" ]; then
  exit 0
fi

# Detect current git branch for branch-aware filtering
CURRENT_BRANCH=$(git -C "$DIR" rev-parse --abbrev-ref HEAD 2>/dev/null)

# Single jq call: prefer current branch tasks, fall back to most recent active
RESULT=$(jq -r --arg branch "$CURRENT_BRANCH" '
  (.tasks // [])
  | map(select(.sessionActive == true))
  | if length == 0 then empty
    else
      (map(select(.branch == $branch)) | sort_by(.updatedAt) | last) //
      (sort_by(.updatedAt) | last)
    end
  | [(.branch // ""), (.taskSummary // "")]
  | @tsv
' "$TASKS_FILE")

if [ -z "$RESULT" ]; then
  exit 0
fi

BRANCH=$(echo "$RESULT" | cut -f1)
SUMMARY=$(echo "$RESULT" | cut -f2)

if [ -z "$SUMMARY" ]; then
  exit 0
fi

if [ -n "$BRANCH" ]; then
  echo "[KG] $BRANCH: $SUMMARY"
else
  echo "[KG] $SUMMARY"
fi
