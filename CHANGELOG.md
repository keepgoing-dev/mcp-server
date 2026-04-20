# Changelog

## 0.14.2

- Improve `get_decisions` tool description with explicit trigger guidance so AI tools call it at the right moments

## 0.14.1

- Prevent temp dirs and common home subdirectories (Downloads, Desktop, etc.) from being auto-registered as projects

## 0.14.0

- Improve Continue On export to focus on what AI tools cannot discover on their own: intent, blockers, decision rationale, and parallel-session conflicts. Git history and file trees are now represented as short pointers rather than full dumps, reducing token waste and highlighting what only the human knows.

## 0.13.0

- `save_checkpoint` now records `lastCheckpointAt` on the session task so the statusline can show time since last save
- Fix `save_checkpoint` to correctly join sessions created by the hook handler, preventing duplicate session rows

## 0.12.2

- Internal cleanup: remove unused variable in save_checkpoint handler
- Shared package updates: settings.local.json routing and storage refactors

## 0.12.1

- Improve setup.ts to prefer native kg binary when available for shell integration
- Add kg binary detection in hook setup to prevent duplicate hook entries

## 0.12.0

- Initialize GlobalDatabase in read-only mode at startup for unified SQLite access
- Add BYO API key support: auto-trigger background refinement after decision detection
- Show decision count teaser for free users
- Wire summary-text-first heuristic into save_checkpoint for more accurate decision detection
- Fix SQLite writes, contrast regex, and migration safety in decision detection

## 0.11.1

- Update hook constants to use keepgoing CLI instead of npx mcp-server
- Add doctor detection for stale npx-based hooks

## 0.11.0

- Filter Claude Code framework messages from session labels
- Add staleness detection to SessionStart briefing (PR status, branch transitions)
- Reframe briefing to lead with next step instead of last worked on
- Add cold project detection and nudge state persistence
- Fix shell injection vulnerability in shared utilities
- Fix race condition in nudge state atomic writes

## 0.10.0

- Rewrite decision detection from keyword matching to structural signal analysis
- Pass file status and stats from git diff-tree to decision classifier for richer signals

## 0.9.5

- Enrich `continue_on` prompt with session timeline, key decisions, and smart truncation by priority
- Auto-copy `continue_on` prompt to clipboard on macOS, Linux, and Windows
- Add concise checkpoint text guidance with character limits on tool descriptions

## 0.9.4

- Fix session labels truncating mid-word by breaking at word boundaries

## 0.9.3

- Add HMAC-SHA256 signing to license store for tamper detection
- Shorten license revalidation interval from 24 hours to 6 hours

## 0.9.2

- Prune stale project paths that no longer exist on disk during registration
- Refactor storage root resolution to avoid redundant path lookups

## 0.9.1

- Fix Stop hook creating ghost session duplicates by matching sessions on workspace path and branch instead of a hash that could mismatch Claude's session IDs

## 0.9.0

- Add plan mode checkpoint support for structured planning sessions
- Evolve color palette to warm coral tones with Space Grotesk typography
- Unify design tokens for consistent theme across surfaces

## 0.8.0

- Add ContextSnapshot tools for surfacing momentum data to MCP clients
- Strip agent framework XML tags from session labels and task summaries
- Add unit tests for storage, transcript utilities, and CLI handlers

## 0.7.2

- Update statusline label dynamically from the latest user message instead of only the first prompt
- Show last meaningful checkpoint as fallback when no active session is running
- Suppress git stderr output in non-git directories to avoid spurious error messages
- Add session start welcome behavior to setup rules

## 0.7.1

- Add 24-hour license revalidation for Pro feature gates (decisions, session awareness)
- Distinguish network errors from API rejections for offline tolerance during revalidation

## 0.7.0

- Add always-on decision detection via global git post-commit hook
- Delegate project setup logic to shared package for cross-app reuse
- Add SessionEnd hook support for lifecycle management
- Reposition Session Awareness as bird's eye view and fix sessionLabel display

## 0.6.1

- Expand statusline label budget to 55 chars when no action verb is shown, filling the available slack
- Show "done" state in the statusline when the AI finishes its turn, instead of falling back to the last tool verb
- Cache session label on first hook fire and store it in `current-tasks.json` so it is never overwritten
- Ungate statusline setup from Pro: all per-project `setup_project` calls now install the statusline config

## 0.6.0

- Add `continue_on` tool to export your development context as a formatted prompt for any AI tool
- Add token-aware briefing tiers with `tier` and `model` params on `get_momentum` and `get_reentry_briefing`

## 0.5.7

- Extract setup logic and KeepGoingReader to shared package for cross-app reuse (d78b203, ec65abe)

## 0.5.6

- Add global scope option to `setup_project` tool for project-wide MCP configuration

## 0.5.5

- Replace copied statusline shell script with auto-updating TypeScript statusline via npx
- Extract shared statusline migration logic into dedicated `cli/migrate.ts` module
- Tighten legacy statusline detection and remove tsup copy step

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
