# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Dev

```bash
npm run mcp:build    # Build with tsup (from monorepo root)
npm run mcp:watch    # Watch mode (from monorepo root)
```

Or locally:

```bash
npx tsup             # Build
npx tsup --watch     # Watch
```

No tests or linter are configured for this package. Type-checking is `noEmit` in tsconfig, so `tsc --noEmit` validates types.

## Architecture

This is the MCP server package (`@keepgoingdev/mcp-server`) for KeepGoing. It serves two roles:

1. **MCP server** (default): Connects via stdio, exposes tools and prompts to MCP hosts (Claude Code, etc.)
2. **CLI mode**: When invoked with flags (`--print-momentum`, `--save-checkpoint`, `--update-task`, `--print-current`), runs a one-shot CLI handler and exits. Used for shell hook integration.

### Entry Point (`src/index.ts`)

CLI flag dispatch is checked first. If no flag matches, the MCP server starts. The server resolves the workspace path from `process.argv[2]` or `process.cwd()`, finds the git root, and creates a `KeepGoingReader`.

### Key Patterns

**Tool registration**: Each tool is in `src/tools/<name>.ts` and exports a `register<Name>(server, reader, ...)` function. Tools use `server.tool(name, description, schema, handler)` from `@modelcontextprotocol/sdk`. The handler returns `{ content: [{ type: 'text', text }] }`.

**Prompt registration**: Each prompt is in `src/prompts/<name>.ts` and exports a `register<Name>Prompt(server)` function. Prompts return canned user messages that instruct the LLM to call specific tools.

**CLI handlers**: Each CLI mode is in `src/cli/<name>.ts`. Handlers call `process.exit()` when done. They create their own `KeepGoingReader` via `resolveWsPath()`.

### Storage (`src/storage.ts`)

`KeepGoingReader` is a read-only accessor for the `.keepgoing/` directory. It does not write files. It supports:
- Worktree-aware scoping (auto-filters to current branch in git worktrees)
- Branch scope resolution for tools that accept a `branch` parameter (`"all"`, explicit name, or auto-detect)
- Lazy-cached branch resolution

All write operations come from `@keepgoingdev/shared` (`KeepGoingWriter`), not from this package.

### Build (`tsup.config.ts`)

- `@keepgoingdev/shared` is bundled in (via `noExternal`) using a source alias to avoid CJS/ESM mismatch
- `@modelcontextprotocol/sdk` and `zod` are kept external
- Output is ESM only, targeting Node 20
