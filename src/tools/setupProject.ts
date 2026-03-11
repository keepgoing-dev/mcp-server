import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { getLicenseForFeature } from '@keepgoingdev/shared';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { isLegacyStatusline, cleanupLegacyScript, STATUSLINE_CMD } from '../cli/migrate.js';

const KEEPGOING_MARKER = '@keepgoingdev/mcp-server';

const SESSION_START_HOOK = {
  matcher: '',
  hooks: [
    {
      type: 'command',
      command: 'npx -y @keepgoingdev/mcp-server --print-momentum',
    },
  ],
};

const STOP_HOOK = {
  matcher: '',
  hooks: [
    {
      type: 'command',
      command: 'npx -y @keepgoingdev/mcp-server --save-checkpoint',
    },
  ],
};

const POST_TOOL_USE_HOOK = {
  matcher: 'Edit|Write|MultiEdit',
  hooks: [
    {
      type: 'command',
      command: 'npx -y @keepgoingdev/mcp-server --update-task-from-hook',
    },
  ],
};

const CLAUDE_MD_SECTION = `
## KeepGoing

After completing a task or meaningful piece of work, call the \`save_checkpoint\` MCP tool with:
- \`summary\`: What you accomplished
- \`nextStep\`: What should be done next
- \`blocker\`: Any blocker (if applicable)
`;

function hasKeepGoingHook(hookEntries: unknown[]): boolean {
  return hookEntries.some((entry: any) =>
    entry?.hooks?.some((h: any) => typeof h?.command === 'string' && h.command.includes(KEEPGOING_MARKER)),
  );
}

export function registerSetupProject(server: McpServer, workspacePath: string) {
  server.tool(
    'setup_project',
    'Set up KeepGoing in the current project. Adds session hooks to .claude/settings.json and CLAUDE.md instructions so checkpoints are saved automatically.',
    {
      sessionHooks: z.boolean().optional().default(true).describe('Add session hooks to .claude/settings.json'),
      claudeMd: z.boolean().optional().default(true).describe('Add KeepGoing instructions to CLAUDE.md'),
    },
    async ({ sessionHooks, claudeMd }) => {
      const results: string[] = [];

      const claudeDir = path.join(workspacePath, '.claude');
      const settingsPath = path.join(claudeDir, 'settings.json');

      let settings: any = {};
      if (fs.existsSync(settingsPath)) {
        settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      }

      let settingsChanged = false;

      // --- Session hooks ---
      if (sessionHooks) {
        if (!settings.hooks) {
          settings.hooks = {};
        }

        // SessionStart
        if (!Array.isArray(settings.hooks.SessionStart)) {
          settings.hooks.SessionStart = [];
        }
        if (!hasKeepGoingHook(settings.hooks.SessionStart)) {
          settings.hooks.SessionStart.push(SESSION_START_HOOK);
          settingsChanged = true;
        }

        // Stop
        if (!Array.isArray(settings.hooks.Stop)) {
          settings.hooks.Stop = [];
        }
        if (!hasKeepGoingHook(settings.hooks.Stop)) {
          settings.hooks.Stop.push(STOP_HOOK);
          settingsChanged = true;
        }

        // PostToolUse
        if (!Array.isArray(settings.hooks.PostToolUse)) {
          settings.hooks.PostToolUse = [];
        }
        if (!hasKeepGoingHook(settings.hooks.PostToolUse)) {
          settings.hooks.PostToolUse.push(POST_TOOL_USE_HOOK);
          settingsChanged = true;
        }

        if (settingsChanged) {
          results.push('**Session hooks:** Added to `.claude/settings.json`');
        } else {
          results.push('**Session hooks:** Already present, skipped');
        }
      }

      // --- Statusline ---
      if (process.env.KEEPGOING_PRO_BYPASS === '1' || getLicenseForFeature('session-awareness')) {
        const needsUpdate = settings.statusLine?.command
          && isLegacyStatusline(settings.statusLine.command);

        if (!settings.statusLine || needsUpdate) {
          settings.statusLine = {
            type: 'command',
            command: STATUSLINE_CMD,
          };
          settingsChanged = true;
          results.push(needsUpdate
            ? '**Statusline:** Migrated to auto-updating `npx` command'
            : '**Statusline:** Added to `.claude/settings.json`');
        } else {
          results.push('**Statusline:** `statusLine` already configured in settings, skipped');
        }

        cleanupLegacyScript();
      }

      // Write settings once if anything changed
      if (settingsChanged) {
        if (!fs.existsSync(claudeDir)) {
          fs.mkdirSync(claudeDir, { recursive: true });
        }
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
      }

      // --- CLAUDE.md ---
      // Prefer .claude/CLAUDE.md if it exists, otherwise fall back to ./CLAUDE.md
      if (claudeMd) {
        const dotClaudeMdPath = path.join(workspacePath, '.claude', 'CLAUDE.md');
        const rootClaudeMdPath = path.join(workspacePath, 'CLAUDE.md');
        const claudeMdPath = fs.existsSync(dotClaudeMdPath) ? dotClaudeMdPath : rootClaudeMdPath;

        let existing = '';
        if (fs.existsSync(claudeMdPath)) {
          existing = fs.readFileSync(claudeMdPath, 'utf-8');
        }

        if (existing.includes('## KeepGoing')) {
          results.push('**CLAUDE.md:** KeepGoing section already present, skipped');
        } else {
          const updated = existing + CLAUDE_MD_SECTION;
          fs.writeFileSync(claudeMdPath, updated);
          results.push('**CLAUDE.md:** Added KeepGoing section');
        }
      }

      return {
        content: [{ type: 'text' as const, text: results.join('\n') }],
      };
    },
  );
}
