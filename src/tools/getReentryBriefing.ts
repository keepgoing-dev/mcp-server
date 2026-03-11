import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { KeepGoingReader } from '../storage.js';
import {
  getCommitMessagesSince,
  generateBriefing,
} from '@keepgoingdev/shared';

export function registerGetReentryBriefing(server: McpServer, reader: KeepGoingReader, workspacePath: string) {
  server.tool(
    'get_reentry_briefing',
    'Get a synthesized re-entry briefing that helps a developer understand where they left off. Includes focus, recent activity, and suggested next steps.',
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

      const gitBranch = reader.getCurrentBranch();
      const { session: lastSession } = reader.getScopedLastSession();
      const recentSessions = reader.getScopedRecentSessions(5);
      const state = reader.getState() ?? {};

      const sinceTimestamp = lastSession?.timestamp;
      const recentCommits = sinceTimestamp
        ? getCommitMessagesSince(workspacePath, sinceTimestamp)
        : [];

      const briefing = generateBriefing(
        lastSession,
        recentSessions,
        state,
        gitBranch,
        recentCommits,
      );

      if (!briefing) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'No session data available to generate a briefing.',
            },
          ],
        };
      }

      const lines: string[] = [
        `## Re-entry Briefing`,
        '',
      ];

      if (reader.isWorktree && gitBranch) {
        lines.push(`**Worktree context:** Scoped to branch \`${gitBranch}\``);
        lines.push('');
      }

      lines.push(
        `**Last worked:** ${briefing.lastWorked}`,
        `**Current focus:** ${briefing.currentFocus}`,
        `**Recent activity:** ${briefing.recentActivity}`,
        `**Suggested next:** ${briefing.suggestedNext}`,
        `**Quick start:** ${briefing.smallNextStep}`,
      );

      // Append recent decisions if any exist (also scoped by worktree)
      const recentDecisions = reader.getScopedRecentDecisions(3);

      if (recentDecisions.length > 0) {
        lines.push('');
        lines.push('### Recent decisions');
        for (const decision of recentDecisions) {
          const rationale = decision.rationale ? ` - ${decision.rationale}` : '';
          lines.push(`- **${decision.classification.category}:** ${decision.commitMessage}${rationale}`);
        }
      }

      return {
        content: [{ type: 'text' as const, text: lines.join('\n') }],
      };
    },
  );
}
