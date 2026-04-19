import path from 'node:path';
import { spawn } from 'node:child_process';
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
  getFilesChangedWithStatus,
  getFileInsertionsInCommit,
  tryDetectDecision,
  resolveStorageRoot,
  generateSessionId,
  stripAgentTags,
  GlobalDatabase,
  detectLlmProvider,
  META_AUTO_REFINE_ENABLED,
} from '@keepgoingdev/shared';

export function registerSaveCheckpoint(server: McpServer, reader: KeepGoingReader, workspacePath: string) {
  server.tool(
    'save_checkpoint',
    'Save a development checkpoint. Call this after completing a task or meaningful piece of work, not just at end of session. Each checkpoint helps the next session (or developer) pick up exactly where you left off.',
    {
      summary: z.string().describe('1 sentence, max 140 chars. What changed and why.'),
      nextStep: z.string().optional().describe('Max 100 chars. What to do next.'),
      blocker: z.string().optional().describe('Max 100 chars. Any blocker preventing progress.'),
      sessionId: z.string().optional().describe('Claude Code session UUID. When omitted, joins the most-recent active task row for this worktree so checkpoints share the sessionId the hook writes to.'),
    },
    async ({ summary, nextStep, blocker, sessionId: explicitSessionId }) => {
      summary = stripAgentTags(summary);
      nextStep = nextStep ? stripAgentTags(nextStep) : nextStep;
      blocker = blocker ? stripAgentTags(blocker) : blocker;

      const lastSession = reader.getLastSession();

      const gitBranch = getCurrentBranch(workspacePath);
      const touchedFiles = getTouchedFiles(workspacePath);
      const commitHashes = getCommitsSince(workspacePath, lastSession?.timestamp);
      const projectName = path.basename(resolveStorageRoot(workspacePath));

      const writer = new KeepGoingWriter(workspacePath);
      const existingTasks = writer.readCurrentTasks();

      // Prefer explicit sessionId; else join the most-recent active hook-written row
      // for this worktree so heartbeat/task-update and save_checkpoint share one row
      // (and the statusline sees lastCheckpointAt). Final fallback: deterministic hash.
      const activeForWorktree = existingTasks
        .filter(t => t.sessionActive && t.worktreePath === workspacePath)
        .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))[0];
      const sessionId = explicitSessionId
        ?? activeForWorktree?.sessionId
        ?? generateSessionId({ workspaceRoot: workspacePath, branch: gitBranch ?? undefined, worktreePath: workspacePath });

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

      writer.upsertSession({
        sessionId,
        sessionActive: true,
        branch: gitBranch ?? undefined,
        updatedAt: checkpoint.timestamp,
        taskSummary: summary,
        nextStep: nextStep || undefined,
        lastCheckpointAt: checkpoint.timestamp,
      });

      const lines: string[] = [
        `Checkpoint saved.`,
        `- **ID:** ${checkpoint.id}`,
        `- **Branch:** ${gitBranch || 'unknown'}`,
        `- **Files tracked:** ${touchedFiles.length}`,
        `- **Commits captured:** ${commitHashes.length}`,
      ];

      // Decision detection (always on, summary-first heuristic)
      {
        const headHash = commitHashes.length > 0 ? getHeadCommitHash(workspacePath) : null;
        const filesWithStatus = headHash ? getFilesChangedWithStatus(workspacePath, headHash) : undefined;
        const fileStats = headHash ? getFileInsertionsInCommit(workspacePath, headHash) : undefined;
        const commitMessages = commitHashes.length > 0
          ? getCommitMessagesSince(workspacePath, lastSession?.timestamp)
          : [];
        const detected = tryDetectDecision({
          workspacePath,
          checkpointId: checkpoint.id,
          gitBranch,
          commitHash: headHash ?? '',
          commitMessage: commitMessages[0] ?? summary,
          summary,
          source: 'manual',
          filesChanged: touchedFiles,
          filesWithStatus,
          fileStats,
        });
        if (detected) {
          lines.push(`- **Decision detected:** ${detected.category} (${(detected.confidence * 100).toFixed(0)}% confidence)`);

          // Auto-refine: spawn background process if consent given and provider available
          if (GlobalDatabase.isOpen()) {
            const gdb = GlobalDatabase.current();
            const autoRefineEnabled = gdb.getMeta(META_AUTO_REFINE_ENABLED) === 'true';
            if (autoRefineEnabled) {
              const provider = detectLlmProvider({ skipCliDetection: false });
              if (provider.type !== 'none') {
                try {
                  const child = spawn(
                    'keepgoing',
                    ['refine', '--background', '--limit', '1', '--cwd', workspacePath],
                    { detached: true, stdio: 'ignore' },
                  );
                  child.unref();
                } catch {
                  // Background refine is best-effort
                }
              }
            }
          }
        }
      }

      return {
        content: [{ type: 'text' as const, text: lines.join('\n') }],
      };
    },
  );
}
