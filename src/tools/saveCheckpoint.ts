import path from 'node:path';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { KeepGoingReader } from '../storage.js';
import {
  KeepGoingWriter,
  createCheckpoint,
  getCurrentBranch,
  getTouchedFiles,
  getCommitsSince,
  getCommitMessagesSince,
  getHeadCommitHash,
  tryDetectDecision,
  resolveStorageRoot,
  generateSessionId,
  stripAgentTags,
} from '@keepgoingdev/shared';

export function registerSaveCheckpoint(server: McpServer, reader: KeepGoingReader, workspacePath: string) {
  server.tool(
    'save_checkpoint',
    'Save a development checkpoint. Call this after completing a task or meaningful piece of work, not just at end of session. Each checkpoint helps the next session (or developer) pick up exactly where you left off.',
    {
      summary: z.string().describe('1 sentence, max 140 chars. What changed and why.'),
      nextStep: z.string().optional().describe('Max 100 chars. What to do next.'),
      blocker: z.string().optional().describe('Max 100 chars. Any blocker preventing progress.'),
    },
    async ({ summary, nextStep, blocker }) => {
      summary = stripAgentTags(summary);
      nextStep = nextStep ? stripAgentTags(nextStep) : nextStep;
      blocker = blocker ? stripAgentTags(blocker) : blocker;

      const lastSession = reader.getLastSession();

      const gitBranch = getCurrentBranch(workspacePath);
      const touchedFiles = getTouchedFiles(workspacePath);
      const commitHashes = getCommitsSince(workspacePath, lastSession?.timestamp);
      const projectName = path.basename(resolveStorageRoot(workspacePath));

      const writer = new KeepGoingWriter(workspacePath);
      const sessionId = generateSessionId({ workspaceRoot: workspacePath, branch: gitBranch ?? undefined, worktreePath: workspacePath });

      // Look up existing session to determine phase
      const existingTasks = writer.readCurrentTasks();
      const existingSession = existingTasks.find(t => t.sessionId === sessionId);
      const sessionPhase = existingSession?.sessionPhase;

      const checkpoint = createCheckpoint({
        summary,
        nextStep: nextStep || '',
        blocker,
        gitBranch,
        touchedFiles,
        commitHashes,
        workspaceRoot: workspacePath,
        source: 'manual',
        sessionId,
        ...(sessionPhase ? { sessionPhase } : {}),
        ...(sessionPhase === 'planning' ? { tags: ['plan'] } : {}),
      });

      writer.saveCheckpoint(checkpoint, projectName);

      // Upsert current task to keep session tracking in sync
      writer.upsertSession({
        sessionId,
        sessionActive: true,
        branch: gitBranch ?? undefined,
        updatedAt: checkpoint.timestamp,
        taskSummary: summary,
        nextStep: nextStep || undefined,
      });

      const lines: string[] = [
        `Checkpoint saved.`,
        `- **ID:** ${checkpoint.id}`,
        `- **Branch:** ${gitBranch || 'unknown'}`,
        `- **Files tracked:** ${touchedFiles.length}`,
        `- **Commits captured:** ${commitHashes.length}`,
      ];

      // Decision detection
      if (commitHashes.length > 0) {
        const commitMessages = getCommitMessagesSince(workspacePath, lastSession?.timestamp);
        const headHash = getHeadCommitHash(workspacePath);
        if (commitMessages.length > 0 && headHash) {
          const detected = tryDetectDecision({
            workspacePath,
            checkpointId: checkpoint.id,
            gitBranch,
            commitHash: headHash,
            commitMessage: commitMessages[0],
            filesChanged: touchedFiles,
          });
          if (detected) {
            lines.push(`- **Decision detected:** ${detected.category} (${(detected.confidence * 100).toFixed(0)}% confidence)`);
          }
        }
      }

      return {
        content: [{ type: 'text' as const, text: lines.join('\n') }],
      };
    },
  );
}
