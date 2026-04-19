# @keepgoingdev/mcp-server

MCP server for [KeepGoing.dev](https://keepgoing.dev) - a momentum companion for developers. KeepGoing helps you keep going on projects when you return after time away.

KeepGoing auto-captures checkpoints (what you were doing, what's next, which files matter) on git commits, branch switches, and inactivity. When you start a new session, your AI assistant reads your last checkpoint instead of re-inferring everything from scratch. Local-first, no account required.

## Quick Setup

The easiest way to get started is with the installer, which installs the CLI globally and runs the setup wizard:

```bash
curl -fsSL https://keepgoing.dev/install.sh | bash
```

For a specific tool:

```bash
curl -fsSL https://keepgoing.dev/install.sh | bash -s -- claude
curl -fsSL https://keepgoing.dev/install.sh | bash -s -- vscode
```

### Claude Code (manual)

**Global (recommended)** — works across all your projects:

```bash
claude mcp add keepgoing --scope user -- npx -y @keepgoingdev/mcp-server
```

**Per-project** — scoped to a single project:

```bash
claude mcp add keepgoing --scope project -- npx -y @keepgoingdev/mcp-server
```

Then run `keepgoing setup claude` to configure hooks and rules.

### Cursor, Windsurf, and other tools

Add to your MCP config file (`~/.cursor/mcp.json` for Cursor, or the equivalent for your tool):

```json
{
  "mcpServers": {
    "keepgoing": {
      "command": "npx",
      "args": ["-y", "@keepgoingdev/mcp-server"]
    }
  }
}
```

## Tools

### Core

| Tool | Description |
|------|-------------|
| `get_momentum` | Get your last checkpoint, next step, blockers, and branch context. Quick snapshot of where you left off. Accepts optional `tier` and `model` params for token-aware output. |
| `get_reentry_briefing` | Get a synthesized re-entry briefing with focus, recent activity, and suggested next steps. Accepts optional `tier` and `model` params for token-aware briefing tiers. |
| `get_session_history` | Get recent session checkpoints in chronological order. Supports branch filtering and configurable limit. |
| `get_whats_hot` | See recently active files and branches across sessions. |
| `continue_on` | Export your development context as a formatted prompt for another AI tool (chatgpt, gemini, copilot, claude, general). |
| `save_checkpoint` | Save a development checkpoint after completing a task or meaningful piece of work. |

### Paid Add-ons

| Tool | Add-on | Description |
|------|--------|-------------|
| `get_decisions` | Decision Detection | Get recent high-signal commits with their category, confidence, and rationale. |
| `get_current_task` | Session Awareness | Get current live session tasks across multiple concurrent AI agent sessions. |
| `activate_license` | | Activate a KeepGoing license on this device. |
| `deactivate_license` | | Deactivate the KeepGoing license on this device. |

## How It Works

1. **Add this MCP server** to your AI coding assistant (Claude Code, Cursor, Windsurf, etc.)
2. **Start coding.** Use `save_checkpoint` from your AI assistant to capture what you did, what's next, and any blockers
3. **Come back anytime.** Your AI assistant calls `get_momentum` or `get_reentry_briefing` to pick up exactly where you left off
4. **Optionally, install the [KeepGoing VS Code extension](https://marketplace.visualstudio.com/items?itemName=keepgoing.keepgoing)** for automatic checkpoint capture on inactivity, git commits, and branch switches — no manual saves needed

All data is stored locally in a `.keepgoing/` directory at your git root.

## Requirements

- Node.js 18+
- The [KeepGoing VS Code extension](https://marketplace.visualstudio.com/items?itemName=keepgoing.keepgoing) is **optional** — useful for auto-capturing checkpoints on git commits, branch switches, and inactivity, but the MCP server works standalone via `save_checkpoint`

## Links

- [Website](https://keepgoing.dev)
- [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=keepgoing.keepgoing)
- [npm](https://www.npmjs.com/package/@keepgoingdev/mcp-server)
- [Issues & Feedback](https://github.com/keepgoing-dev/community)

## License

MIT
