import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { KeepGoingReader } from '../storage.js';
import { generateContextSnapshot } from '@keepgoingdev/shared';

export function registerGetContextSnapshot(server: McpServer, reader: KeepGoingReader, workspacePath: string) {
  server.tool(
    'get_context_snapshot',
    'Get a compact context snapshot: what you were doing, what is next, and momentum. Use this for quick orientation without a full briefing.',
    {
      format: z.enum(['text', 'json']).optional()
        .describe('Output format. "text" (default) returns a formatted single line. "json" returns the structured snapshot object.'),
    },
    async ({ format }) => {
      const snapshot = generateContextSnapshot(workspacePath);

      if (!snapshot) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'No KeepGoing data found. The developer has not saved any checkpoints yet.',
            },
          ],
        };
      }

      if (format === 'json') {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(snapshot, null, 2) }],
        };
      }

      // Text format: {icon} {doing} → {next} ({when})
      const icon =
        snapshot.momentum === 'hot' ? '\u26A1' :
        snapshot.momentum === 'warm' ? '\uD83D\uDD36' :
        '\uD83D\uDCA4';

      const parts: string[] = [];
      parts.push(`${icon} ${snapshot.doing}`);

      if (snapshot.next) {
        parts.push(`\u2192 ${snapshot.next}`);
      }

      let line = parts.join(' ');
      line += ` (${snapshot.when})`;

      if (snapshot.blocker) {
        line += ` \u26D4 ${snapshot.blocker}`;
      }

      if (snapshot.activeAgents && snapshot.activeAgents > 0) {
        line += ` [${snapshot.activeAgents} active agent${snapshot.activeAgents > 1 ? 's' : ''}]`;
      }

      return {
        content: [{ type: 'text' as const, text: line }],
      };
    },
  );
}
