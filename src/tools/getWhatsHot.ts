import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { generateCrossProjectSummary, formatCrossProjectLine } from '@keepgoingdev/shared';

export function registerGetWhatsHot(server: McpServer) {
  server.tool(
    'get_whats_hot',
    'Get a summary of activity across all registered projects, sorted by momentum. Shows what the developer is working on across their entire portfolio.',
    {
      format: z.enum(['text', 'json']).optional()
        .describe('Output format. "text" (default) returns formatted lines. "json" returns the structured summary object.'),
    },
    async ({ format }) => {
      const summary = generateCrossProjectSummary();

      if (summary.projects.length === 0) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'No projects with activity found. Projects are registered automatically when checkpoints are saved.',
            },
          ],
        };
      }

      if (format === 'json') {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(summary, null, 2) }],
        };
      }

      // Text format: one line per project
      const lines = summary.projects.map(entry => formatCrossProjectLine(entry));

      return {
        content: [{ type: 'text' as const, text: lines.join('\n') }],
      };
    },
  );
}
