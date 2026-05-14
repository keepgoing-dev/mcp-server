import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { KeepGoingReader } from '../storage.js';
import { formatRelativeTime } from '@keepgoingdev/shared';

export function registerGetDecisions(server: McpServer, reader: KeepGoingReader) {
  server.tool(
    'get_decisions',
    'Retrieve past architectural decisions automatically captured from high-signal commits. ' +
    'Call this BEFORE modifying code in areas likely to have past decisions: auth systems, ' +
    'database schemas, API contracts, infrastructure config, migrations, or core architectural ' +
    'patterns. Also call when a user asks to change a technology choice, reverse a past approach, ' +
    'or asks "why did we do X". Returns decisions scoped to current branch by default; pass ' +
    'branch: "all" for project-wide history.',
    {
      limit: z.number().min(1).max(50).default(10).describe('Number of recent decisions to return (1-50, default 10)'),
      branch: z.string().optional().describe('Filter to a specific branch name, or "all" to show all branches. Auto-detected from worktree context by default.'),
    },
    ({ limit, branch }) => {
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

      const decisions = effectiveBranch
        ? reader.getRecentDecisionsForBranch(effectiveBranch, limit)
        : reader.getRecentDecisions(limit);

      if (decisions.length === 0) {
        return {
          content: [
            {
              type: 'text' as const,
              text: effectiveBranch
                ? `No decision records found for branch \`${effectiveBranch}\`. Use branch: "all" to see all branches.`
                : 'No decision records found.',
            },
          ],
        };
      }

      const lines: string[] = [
        `## Decisions (last ${decisions.length}, ${scopeLabel})`,
        '',
      ];

      for (const decision of decisions) {
        lines.push(`### ${decision.commitMessage}`);
        lines.push(`- **When:** ${formatRelativeTime(decision.timestamp)}`);
        lines.push(`- **Category:** ${decision.classification.category}`);
        lines.push(`- **Confidence:** ${(decision.classification.confidence * 100).toFixed(0)}%`);
        if (decision.gitBranch) {
          lines.push(`- **Branch:** ${decision.gitBranch}`);
        }
        if (decision.rationale) {
          lines.push(`- **Rationale:** ${decision.rationale}`);
        }
        if (decision.classification.reasons.length > 0) {
          lines.push(`- **Signals:** ${decision.classification.reasons.join('; ')}`);
        }
        lines.push('');
      }

      return {
        content: [{ type: 'text' as const, text: lines.join('\n') }],
      };
    },
  );
}
