import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { KeepGoingReader } from '../storage.js';
import {
  getCommitMessagesSince,
  generateEnrichedBriefing,
  formatEnrichedBriefing,
} from '@keepgoingdev/shared';
import type { BriefingTier } from '@keepgoingdev/shared';

export function registerGetReentryBriefing(server: McpServer, reader: KeepGoingReader, workspacePath: string) {
  server.tool(
    'get_reentry_briefing',
    'Get a synthesized re-entry briefing that helps a developer understand where they left off. Includes focus, recent activity, and suggested next steps. Pass tier or model to control detail level.',
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
              text: 'No session data available to generate a briefing.',
            },
          ],
        };
      }

      return {
        content: [{ type: 'text' as const, text: formatEnrichedBriefing(briefing) }],
      };
    },
  );
}
