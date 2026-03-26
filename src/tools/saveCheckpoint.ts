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
      summary: z.string().describe('What was accomplished in this session'),
      nextStep: z.string().optional().describe('What to do next'),
      blocker: z.string().optional().describe('Any blocker preventing progress'),
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

      const sessionId = generateSessionId({ workspaceRoot: workspacePath, branch: gitBranch ?? undefined, worktreePath: workspacePath });
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
      });

      const writer = new KeepGoingWriter(workspacePath);
      writer.saveCheckpoint(checkpoint, projectName);

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
