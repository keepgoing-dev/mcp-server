import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { KeepGoingReader } from '../storage.js';
import { formatRelativeTime } from '@keepgoingdev/shared';

export function registerGetSessionHistory(server: McpServer, reader: KeepGoingReader) {
  server.tool(
    'get_session_history',
    'Get recent session checkpoints. Returns a chronological list of what the developer worked on.',
    {
      limit: z.number().min(1).max(50).default(5).describe('Number of recent sessions to return (1-50, default 5)'),
      branch: z.string().optional().describe('Filter to a specific branch name, or "all" to show all branches. Auto-detected from worktree context by default.'),
    },
    async ({ limit, branch }) => {
      if (!reader.exists()) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'No KeepGoing data found.',
            },
          ],
        };
      }

      const { effectiveBranch, scopeLabel } = reader.resolveBranchScope(branch);

      const sessions = effectiveBranch
        ? reader.getRecentSessionsForBranch(effectiveBranch, limit)
        : reader.getRecentSessions(limit);

      if (sessions.length === 0) {
        return {
          content: [
            {
              type: 'text' as const,
              text: effectiveBranch
                ? `No session checkpoints found for branch \`${effectiveBranch}\`. Use branch: "all" to see all branches.`
                : 'No session checkpoints found.',
            },
          ],
        };
      }

      const lines: string[] = [
        `## Session History (last ${sessions.length}, ${scopeLabel})`,
        '',
      ];

      for (const session of sessions) {
        lines.push(`### ${formatRelativeTime(session.timestamp)}`);
        lines.push(`- **Summary:** ${session.summary || 'No summary'}`);
        lines.push(`- **Next step:** ${session.nextStep || 'Not specified'}`);
        if (session.blocker) {
          lines.push(`- **Blocker:** ${session.blocker}`);
        }
        if (session.gitBranch) {
          lines.push(`- **Branch:** ${session.gitBranch}`);
        }
        if (session.touchedFiles.length > 0) {
          lines.push(
            `- **Files:** ${session.touchedFiles.slice(0, 5).join(', ')}${session.touchedFiles.length > 5 ? ` (+${session.touchedFiles.length - 5} more)` : ''}`,
          );
        }
        lines.push('');
      }

      return {
        content: [{ type: 'text' as const, text: lines.join('\n') }],
      };
    },
  );
}
