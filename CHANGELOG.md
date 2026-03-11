# Changelog

## 0.5.4

- Add MIT LICENSE file for open-source compliance
- Update README with improved setup instructions and MCP directory metadata
- Add glama.json for MCP directory listing discovery
- Add public repo sync workflow for community repository

## 0.5.2

- Use smart summary and next-step generation in CLI `--save-checkpoint` handler

## 0.5.1

- Add branch-aware filtering to statusline shell script, preferring tasks matching the current git branch
- Fix stale session pruning to include both active and finished sessions

## 0.5.0

- Add `get_current_task` tool for reading live session state from `current-tasks.json`
- Add `--update-task` and `--print-current` CLI flags for shell hook integration
- Add multi-session storage with `upsertSession` and stale session pruning
- Add variant-aware license activation returning add-on labels
- Consolidate CLI handlers from 7 files to 3 for maintainability
- Harden CLI handlers with stdin timeout, deduplication, and improved flag matching

## 0.4.0

- Add MCP prompts for decisions summary and progress overview
- Add worktree-aware scoping to MCP tools and storage reader
- Add multi-session reader with active task tracking and conflict detection

## 0.3.1

- Update pricing URL to point to /add-ons page

## 0.3.0

- Add `activate_license` and `deactivate_license` tools for device-wide license management
- Gate Decision Detection behind Pro license
- Fix `.keepgoing/` storage path resolution in git worktrees

## 0.2.2

- Resolve workspace path to git root to prevent duplicate `.keepgoing` directories

## 0.2.1

- Add `get_decisions` tool to retrieve recent decision records
- Integrate automatic decision detection into `save_checkpoint` flow
- Add Claude Code setup support to `setup_project` tool (session hooks and CLAUDE.md)
- Separate decision storage from session checkpoints for cleaner data management

## 0.2.0

- Add `save_checkpoint` tool for saving development checkpoints directly from AI agents
- Add `setup_project` tool for automated project onboarding (configures session hooks and CLAUDE.md)
- Make MCP server standalone with built-in checkpoint persistence
- Add session pruning to keep checkpoint history manageable

## 0.1.2

- Add `save_checkpoint` tool for creating checkpoints from AI agents
- Bundle shared package with tsup for self-contained distribution

## 0.1.1

- Add README and npm publishing metadata
- Remove shared package from npm dependencies

## 0.1.0

- Initial release
- Add `get_momentum` tool to view current developer momentum
- Add `get_session_history` tool to retrieve recent checkpoints
- Add `get_reentry_briefing` tool for synthesized re-entry context
