import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { KeepGoingReader } from '../storage.js';
import { formatRelativeTime, getLicenseForFeature } from '@keepgoingdev/shared';

export function registerGetCurrentTask(server: McpServer, reader: KeepGoingReader) {
  server.tool(
    'get_current_task',
    "Get a bird's eye view of all active Claude sessions. See what each session is working on, which branch it is on, and when it last did something. Useful when running multiple parallel sessions across worktrees.",
    {},
    async () => {
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

      if (process.env.KEEPGOING_PRO_BYPASS !== '1' && !getLicenseForFeature('session-awareness')) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'Session Awareness requires a license. Use the activate_license tool, run `keepgoing activate <key>` in your terminal, or visit https://keepgoing.dev/add-ons to purchase.',
            },
          ],
        };
      }

      const tasks = reader.getCurrentTasks();

      if (tasks.length === 0) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'No current task data found. The agent has not started writing session data yet.',
            },
          ],
        };
      }

      const activeTasks = tasks.filter(t => t.sessionActive);
      const finishedTasks = tasks.filter(t => !t.sessionActive);

      const lines: string[] = [];

      // Summary header
      const totalActive = activeTasks.length;
      const totalFinished = finishedTasks.length;
      if (totalActive > 0 || totalFinished > 0) {
        const parts: string[] = [];
        if (totalActive > 0) parts.push(`${totalActive} active`);
        if (totalFinished > 0) parts.push(`${totalFinished} finished`);
        lines.push(`## Live Sessions (${parts.join(', ')})`);
        lines.push('');
      }

      // Render each task
      for (const task of [...activeTasks, ...finishedTasks]) {
        const statusIcon = task.sessionActive ? '🟢' : '✅';
        const statusLabel = task.sessionActive ? 'Active' : 'Finished';
        const sessionLabel = task.sessionLabel || task.agentLabel || task.sessionId || 'Session';

        lines.push(`### ${statusIcon} ${sessionLabel} (${statusLabel})`);
        lines.push(`- **Updated:** ${formatRelativeTime(task.updatedAt)}`);

        if (task.branch) {
          lines.push(`- **Branch:** ${task.branch}`);
        }
        if (task.agentLabel && task.sessionLabel) {
          lines.push(`- **Agent:** ${task.agentLabel}`);
        }
        if (task.taskSummary) {
          lines.push(`- **Doing:** ${task.taskSummary}`);
        }
        if (task.lastFileEdited) {
          lines.push(`- **Last file:** ${task.lastFileEdited}`);
        }
        if (task.nextStep) {
          lines.push(`- **Next step:** ${task.nextStep}`);
        }
        lines.push('');
      }

      // Cross-session intelligence: file conflicts
      const conflicts = reader.detectFileConflicts();
      if (conflicts.length > 0) {
        lines.push('### ⚠️ Potential Conflicts');
        for (const conflict of conflicts) {
          const sessionLabels = conflict.sessions.map(s => s.agentLabel || s.sessionId || 'unknown').join(', ');
          lines.push(`- **${conflict.file}** is being edited by: ${sessionLabels}`);
        }
        lines.push('');
      }

      // Cross-session intelligence: branch overlap
      const overlaps = reader.detectBranchOverlap();
      if (overlaps.length > 0) {
        lines.push('### ℹ️ Branch Overlap');
        for (const overlap of overlaps) {
          const sessionLabels = overlap.sessions.map(s => s.agentLabel || s.sessionId || 'unknown').join(', ');
          lines.push(`- **${overlap.branch}**: ${sessionLabels} (possible duplicate work)`);
        }
        lines.push('');
      }

      return {
        content: [{ type: 'text' as const, text: lines.join('\n') }],
      };
    },
  );
}
