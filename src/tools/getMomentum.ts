import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { KeepGoingReader } from '../storage.js';
import { formatRelativeTime } from '@keepgoingdev/shared';

export function registerGetMomentum(server: McpServer, reader: KeepGoingReader, workspacePath: string) {
  server.tool(
    'get_momentum',
    'Get current developer momentum: last checkpoint, next step, blockers, and branch context. Use this to understand where the developer left off.',
    {},
    async () => {
      if (!reader.exists()) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'No KeepGoing data found. The developer has not saved any checkpoints yet.',
            },
          ],
        };
      }

      const { session: lastSession, isFallback } = reader.getScopedLastSession();
      const currentBranch = reader.getCurrentBranch();

      if (!lastSession) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'KeepGoing is set up but no session checkpoints exist yet.',
            },
          ],
        };
      }

      const state = reader.getState();
      const branchChanged =
        lastSession.gitBranch &&
        currentBranch &&
        lastSession.gitBranch !== currentBranch;

      const lines: string[] = [
        `## Developer Momentum`,
        '',
      ];

      if (reader.isWorktree && currentBranch) {
        lines.push(`**Worktree context:** Scoped to branch \`${currentBranch}\``);
        if (isFallback) {
          lines.push(`**Note:** No checkpoints found for branch \`${currentBranch}\`. Showing last global checkpoint.`);
        }
        lines.push('');
      }

      lines.push(
        `**Last checkpoint:** ${formatRelativeTime(lastSession.timestamp)}`,
        `**Summary:** ${lastSession.summary || 'No summary'}`,
        `**Next step:** ${lastSession.nextStep || 'Not specified'}`,
      );

      if (lastSession.blocker) {
        lines.push(`**Blocker:** ${lastSession.blocker}`);
      }

      if (lastSession.projectIntent) {
        lines.push(`**Project intent:** ${lastSession.projectIntent}`);
      }

      lines.push('');

      if (currentBranch) {
        lines.push(`**Current branch:** ${currentBranch}`);
      }
      if (branchChanged && !reader.isWorktree) {
        lines.push(
          `**Note:** Branch changed since last checkpoint (was \`${lastSession.gitBranch}\`, now \`${currentBranch}\`)`,
        );
      }

      if (lastSession.touchedFiles.length > 0) {
        lines.push('');
        lines.push(
          `**Files touched (${lastSession.touchedFiles.length}):** ${lastSession.touchedFiles.slice(0, 10).join(', ')}`,
        );
        if (lastSession.touchedFiles.length > 10) {
          lines.push(
            `  ...and ${lastSession.touchedFiles.length - 10} more`,
          );
        }
      }

      if (state?.derivedCurrentFocus) {
        lines.push('');
        lines.push(`**Derived focus:** ${state.derivedCurrentFocus}`);
      }

      return {
        content: [{ type: 'text' as const, text: lines.join('\n') }],
      };
    },
  );
}
