import { z } from 'zod';
import { setupProject } from '@keepgoingdev/shared';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { isLegacyStatusline, cleanupLegacyScript } from '../cli/migrate.js';

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
      const result = setupProject({
        workspacePath,
        scope,
        sessionHooks,
        claudeMd,
        statusline: {
          isLegacy: isLegacyStatusline,
          cleanup: cleanupLegacyScript,
        },
      });

      // Format messages as markdown for MCP consumers
      const formatted = result.messages.map(msg => {
        // Wrap the label portion in bold markdown
        return msg.replace(/^([^:]+:)/, '**$1**');
      });

      return {
        content: [{ type: 'text' as const, text: formatted.join('\n') }],
      };
    },
  );
}
