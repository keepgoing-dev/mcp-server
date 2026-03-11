# @keepgoingdev/mcp-server

MCP server for [KeepGoing.dev](https://keepgoing.dev) that gives AI coding assistants persistent project memory.

KeepGoing auto-captures checkpoints (what you were doing, what's next, which files matter) on git commits, branch switches, and inactivity. When you start a new session, your AI assistant reads your last context instead of re-inferring everything from scratch. Local-first, no account required.

## Quick Setup

### Claude Code

**Global (recommended)** — works across all your projects:

```bash
claude mcp add keepgoing --scope user -- npx -y @keepgoingdev/mcp-server
```

**Per-project** — scoped to a single project:

```bash
claude mcp add keepgoing --scope project -- npx -y @keepgoingdev/mcp-server
```

Then ask Claude Code to run `setup_project` (with `scope: "user"` for global, or default for per-project) to add session hooks and CLAUDE.md instructions.

### Manual config

Add to your MCP config (e.g., `~/.claude.json` for global, or `.mcp.json` for per-project):

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
| `get_momentum` | Get your last checkpoint, next step, blockers, and branch context. Quick snapshot of where you left off. |
| `get_reentry_briefing` | Get a synthesized re-entry briefing with focus, recent activity, and suggested next steps. |
| `get_session_history` | Get recent session checkpoints in chronological order. Supports branch filtering and configurable limit. |
| `save_checkpoint` | Save a development checkpoint after completing a task or meaningful piece of work. |
| `setup_project` | Set up KeepGoing in the current project. Adds session hooks and CLAUDE.md instructions for automatic checkpoints. |

### Paid Add-ons

| Tool | Add-on | Description |
|------|--------|-------------|
| `get_decisions` | Decision Detection | Get recent high-signal commits with their category, confidence, and rationale. |
| `get_current_task` | Session Awareness | Get current live session tasks across multiple concurrent AI agent sessions. |
| `activate_license` | | Activate a KeepGoing license on this device. |
| `deactivate_license` | | Deactivate the KeepGoing license on this device. |

## How It Works

1. **Install the [KeepGoing VS Code extension](https://marketplace.visualstudio.com/items?itemName=keepgoing.keepgoing)** to capture session data automatically
2. **Add this MCP server** to your AI coding assistant (Claude Code, Cursor, Windsurf, etc.)
3. **Start coding.** Checkpoints are saved on git commits, branch switches, and periods of inactivity
4. **Come back anytime.** Your AI assistant calls `get_momentum` or `get_reentry_briefing` to pick up exactly where you left off

All data is stored locally in a `.keepgoing/` directory at your git root.

## Requirements

- [KeepGoing VS Code extension](https://marketplace.visualstudio.com/items?itemName=keepgoing.keepgoing) installed and active
- Node.js 18+

## Links

- [Website](https://keepgoing.dev)
- [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=keepgoing.keepgoing)
- [npm](https://www.npmjs.com/package/@keepgoingdev/mcp-server)
- [Issues & Feedback](https://github.com/keepgoing-dev/community)

## License

MIT
