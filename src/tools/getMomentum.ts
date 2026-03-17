import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { KeepGoingReader } from '../storage.js';
import {
  formatRelativeTime,
  generateEnrichedBriefing,
  formatEnrichedBriefing,
  getCommitMessagesSince,
} from '@keepgoingdev/shared';
import type { BriefingTier } from '@keepgoingdev/shared';

export function registerGetMomentum(server: McpServer, reader: KeepGoingReader, workspacePath: string) {
  server.tool(
    'get_momentum',
    'Get current developer momentum: last checkpoint, next step, blockers, and branch context. Use this to understand where the developer left off. Pass tier or model to control detail level.',
    {
      tier: z.enum(['compact', 'standard', 'detailed', 'full']).optional()
        .describe('Briefing detail level. compact (~150 tokens), standard (~400), detailed (~800), full (~1500). Default: standard.'),
      model: z.string().optional()
        .describe('Model name (e.g. "claude-opus-4") to auto-resolve tier. Ignored if tier is set.'),
    },
    async ({ tier, model }) => {
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

      // If tier or model is provided, use the enriched briefing path
      if (tier || model) {
        const gitBranch = reader.getCurrentBranch();
        const { session: lastSession } = reader.getScopedLastSession();
        const recentSessions = reader.getScopedRecentSessions(5);
        const state = reader.getState() ?? {};

        const sinceTimestamp = lastSession?.timestamp;
        const recentCommits = sinceTimestamp
          ? getCommitMessagesSince(workspacePath, sinceTimestamp)
          : [];

        const decisions = reader.getScopedRecentDecisions(10);
        const allSessions = reader.getSessions();
        const fileConflicts = reader.detectFileConflicts();
        const branchOverlaps = reader.detectBranchOverlap();

        const briefing = generateEnrichedBriefing({
          tier: tier as BriefingTier | undefined,
          model,
          lastSession,
          recentSessions,
          projectState: state,
          gitBranch,
          recentCommits,
          decisions,
          allTouchedFiles: lastSession?.touchedFiles,
          allSessions,
          fileConflicts,
          branchOverlaps,
          isWorktree: reader.isWorktree,
        });

        if (!briefing) {
          return {
            content: [
              {
                type: 'text' as const,
                text: 'KeepGoing is set up but no session checkpoints exist yet.',
              },
            ],
          };
        }

        return {
          content: [{ type: 'text' as const, text: formatEnrichedBriefing(briefing) }],
        };
      }

      // Default: existing momentum format (backward compat when no tier/model passed)
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
