# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Dev

From the monorepo root:

```bash
npm run mcp:build    # Build with tsup
npm run mcp:watch    # Watch mode
npm run mcp:test     # Run tests
```

Locally (from this directory):

```bash
npx tsup             # Build
npx tsup --watch     # Watch
node --import tsx --test $(find src/test -name '*.test.ts' | tr '\n' ' ')  # Run tests
tsc --noEmit         # Type-check only
```

No linter is configured for this package.

## Architecture

This package (`@keepgoingdev/mcp-server`) has two runtime roles driven by a single entry point (`src/index.ts`):

1. **MCP server** (default): Connects via stdio to MCP hosts (Claude Code, Cursor, etc.). Exposes tools and prompts.
2. **Legacy CLI mode**: When invoked with flags like `--save-checkpoint`, `--heartbeat`, etc., runs a one-shot handler and exits. These flags are deprecated - the server now tries to delegate to the `keepgoing` CLI binary and falls back to built-in handlers if unavailable.

### Entry Point Dispatch

`src/index.ts` checks `process.argv` for known CLI flags first. If a flag matches, it checks whether the standalone `keepgoing` CLI is on PATH and delegates to it with a deprecation notice. If the CLI is unavailable, the legacy handler in `src/cli/` runs directly. If no flag matches, the MCP server starts.

### Tools (`src/tools/`)

Each file exports a `register<Name>(server, reader, workspacePath?)` function. All tools follow the same pattern: validate input with zod, read data via `KeepGoingReader` (or call shared utilities for git data), and return `{ content: [{ type: 'text', text }] }`.

Key tools:
- `save_checkpoint` - writes via `KeepGoingWriter` from shared, also runs decision detection and triggers background `keepgoing refine` if auto-refine is enabled
- `get_momentum` / `get_reentry_briefing` - both delegate to `generateEnrichedBriefing` from shared; `get_momentum` without `tier`/`model` uses a simpler legacy format for backward compatibility
- `get_context_snapshot` - ultra-compact single-line orientation using `generateContextSnapshot` from shared
- `get_current_task` - multi-session awareness (Pro feature, gated by license)

### Prompts (`src/prompts/`)

Each file exports a `register<Name>Prompt(server)` function. Prompts are canned user messages that instruct the LLM to call specific tools in sequence. They do not call tools themselves.

### CLI Handlers (`src/cli/`)

Used for shell hook integration (Claude Code hooks, git hooks, etc.). Each handler calls `resolveWsPath()` from `src/cli/util.ts` to find the git root, then creates its own `KeepGoingWriter` or `KeepGoingReader`. Handlers call `process.exit()` when done.

Notable handlers:
- `heartbeat.ts` - reads JSON from stdin (hook payload), throttles writes to 30s intervals, upserts session presence in `current-tasks.json`, extracts a session label from transcript on first heartbeat
- `detectDecisions.ts` - reads Claude transcript JSON from stdin and runs decision detection heuristics

### Storage (`src/storage.ts`)

Re-exports `KeepGoingReader` and `BranchScope` from `@keepgoingdev/shared`. The reader is read-only - all writes go through `KeepGoingWriter` from shared. `KeepGoingReader` supports worktree-aware branch scoping and lazy-cached branch resolution.

### Build (`tsup.config.ts`)

- `@keepgoingdev/shared` is bundled in (via `noExternal`) using a source alias pointing at `packages/shared/src/index.ts` to avoid CJS/ESM mismatch and enable watch-mode hot reload without rebuilding shared
- `@modelcontextprotocol/sdk`, `zod`, and `sql.js` are kept external
- Output is ESM only, targeting Node 20

### Feature Gating

Pro tools (`get_decisions`, `get_current_task`) check `licenseService.isFeatureActive()` from shared. Use `KEEPGOING_PRO_BYPASS=1` to bypass during development.
