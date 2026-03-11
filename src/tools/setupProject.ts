import fs from 'node:fs';
import os from 'node:os';
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

/**
 * Resolve settings and CLAUDE.md paths based on scope.
 * - "project": <workspacePath>/.claude/settings.json, <workspacePath>/CLAUDE.md
 * - "user": ~/.claude/settings.json, ~/.claude/CLAUDE.md
 */
function resolveScopePaths(scope: 'project' | 'user', workspacePath: string) {
  if (scope === 'user') {
    const claudeDir = path.join(os.homedir(), '.claude');
    return {
      claudeDir,
      settingsPath: path.join(claudeDir, 'settings.json'),
      claudeMdPath: path.join(claudeDir, 'CLAUDE.md'),
    };
  }
  const claudeDir = path.join(workspacePath, '.claude');
  const dotClaudeMdPath = path.join(workspacePath, '.claude', 'CLAUDE.md');
  const rootClaudeMdPath = path.join(workspacePath, 'CLAUDE.md');
  return {
    claudeDir,
    settingsPath: path.join(claudeDir, 'settings.json'),
    claudeMdPath: fs.existsSync(dotClaudeMdPath) ? dotClaudeMdPath : rootClaudeMdPath,
  };
}

/**
 * Write session hooks into a settings object. Returns true if anything changed.
 */
function writeHooksToSettings(settings: any): boolean {
  let changed = false;

  if (!settings.hooks) {
    settings.hooks = {};
  }

  // SessionStart
  if (!Array.isArray(settings.hooks.SessionStart)) {
    settings.hooks.SessionStart = [];
  }
  if (!hasKeepGoingHook(settings.hooks.SessionStart)) {
    settings.hooks.SessionStart.push(SESSION_START_HOOK);
    changed = true;
  }

  // Stop
  if (!Array.isArray(settings.hooks.Stop)) {
    settings.hooks.Stop = [];
  }
  if (!hasKeepGoingHook(settings.hooks.Stop)) {
    settings.hooks.Stop.push(STOP_HOOK);
    changed = true;
  }

  // PostToolUse
  if (!Array.isArray(settings.hooks.PostToolUse)) {
    settings.hooks.PostToolUse = [];
  }
  if (!hasKeepGoingHook(settings.hooks.PostToolUse)) {
    settings.hooks.PostToolUse.push(POST_TOOL_USE_HOOK);
    changed = true;
  }

  return changed;
}

/**
 * Check if the "other" scope also has KeepGoing hooks configured.
 * Returns a warning string if conflict detected, or null.
 */
function checkHookConflict(scope: 'project' | 'user', workspacePath: string): string | null {
  const otherPaths = resolveScopePaths(scope === 'user' ? 'project' : 'user', workspacePath);

  if (!fs.existsSync(otherPaths.settingsPath)) {
    return null;
  }

  try {
    const otherSettings = JSON.parse(fs.readFileSync(otherPaths.settingsPath, 'utf-8'));
    const hooks = otherSettings?.hooks;
    if (!hooks) return null;

    const hasConflict =
      (Array.isArray(hooks.SessionStart) && hasKeepGoingHook(hooks.SessionStart)) ||
      (Array.isArray(hooks.Stop) && hasKeepGoingHook(hooks.Stop));

    if (hasConflict) {
      const otherScope = scope === 'user' ? 'project' : 'user';
      const otherFile = otherPaths.settingsPath;
      return `**Warning:** KeepGoing hooks are also configured at ${otherScope} scope (\`${otherFile}\`). ` +
        `Having hooks at both scopes may cause them to fire twice. ` +
        `Consider removing the ${otherScope}-level hooks if you want to use ${scope}-level only.`;
    }
  } catch {
    // Ignore parse errors in the other settings file
  }

  return null;
}

export function registerSetupProject(server: McpServer, workspacePath: string) {
  server.tool(
    'setup_project',
    'Set up KeepGoing hooks and instructions. Use scope "user" for global setup (all projects) or "project" for per-project setup.',
    {
      sessionHooks: z.boolean().optional().default(true).describe('Add session hooks to settings.json'),
      claudeMd: z.boolean().optional().default(true).describe('Add KeepGoing instructions to CLAUDE.md'),
      scope: z.enum(['project', 'user']).optional().default('project').describe('Where to write config: "user" for global (~/.claude/), "project" for per-project (.claude/)'),
    },
    async ({ sessionHooks, claudeMd, scope }) => {
      const results: string[] = [];
      const { claudeDir, settingsPath, claudeMdPath } = resolveScopePaths(scope, workspacePath);
      const scopeLabel = scope === 'user' ? '`~/.claude/settings.json`' : '`.claude/settings.json`';

      let settings: any = {};
      if (fs.existsSync(settingsPath)) {
        settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      }

      let settingsChanged = false;

      // --- Session hooks ---
      if (sessionHooks) {
        const hooksChanged = writeHooksToSettings(settings);
        settingsChanged = hooksChanged;

        if (hooksChanged) {
          results.push(`**Session hooks:** Added to ${scopeLabel}`);
        } else {
          results.push('**Session hooks:** Already present, skipped');
        }

        // Check for hooks in the other scope
        const conflict = checkHookConflict(scope, workspacePath);
        if (conflict) {
          results.push(conflict);
        }
      }

      // --- Statusline (project scope only) ---
      if (scope === 'project') {
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
      }

      // Write settings once if anything changed
      if (settingsChanged) {
        if (!fs.existsSync(claudeDir)) {
          fs.mkdirSync(claudeDir, { recursive: true });
        }
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
      }

      // --- CLAUDE.md ---
      if (claudeMd) {
        let existing = '';
        if (fs.existsSync(claudeMdPath)) {
          existing = fs.readFileSync(claudeMdPath, 'utf-8');
        }

        const mdLabel = scope === 'user' ? '`~/.claude/CLAUDE.md`' : '`CLAUDE.md`';

        if (existing.includes('## KeepGoing')) {
          results.push(`**CLAUDE.md:** KeepGoing section already present in ${mdLabel}, skipped`);
        } else {
          const updated = existing + CLAUDE_MD_SECTION;
          // Ensure parent directory exists (for user scope, ~/.claude/ may not exist)
          const mdDir = path.dirname(claudeMdPath);
          if (!fs.existsSync(mdDir)) {
            fs.mkdirSync(mdDir, { recursive: true });
          }
          fs.writeFileSync(claudeMdPath, updated);
          results.push(`**CLAUDE.md:** Added KeepGoing section to ${mdLabel}`);
        }
      }

      return {
        content: [{ type: 'text' as const, text: results.join('\n') }],
      };
    },
  );
}
