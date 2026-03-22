import {
  resolveStorageRoot,
  KeepGoingWriter,
  createCheckpoint,
  getCurrentBranch,
  getTouchedFiles,
  getCommitsSince,
  getCommitMessagesSince,
  getFilesChangedInCommit,
  tryDetectDecision,
  getLicenseForFeatureWithRevalidation,
  generateSessionId,
  buildSessionEvents,
  buildSmartSummary,
  buildSmartNextStep,
} from '@keepgoingdev/shared';
import path from 'node:path';
import { KeepGoingReader } from '../storage.js';
import { resolveWsPath } from './util.js';

export async function handleSaveCheckpoint(): Promise<void> {
  const wsPath = resolveWsPath();
  const reader = new KeepGoingReader(wsPath);

  const { session: lastSession } = reader.getScopedLastSession();

  // Skip if a checkpoint was written within the last 2 minutes (avoid duplicating extension checkpoints)
  if (lastSession?.timestamp) {
    const ageMs = Date.now() - new Date(lastSession.timestamp).getTime();
    if (ageMs < 2 * 60 * 1000) {
      process.exit(0);
    }
  }

  const touchedFiles = getTouchedFiles(wsPath);
  const commitHashes = getCommitsSince(wsPath, lastSession?.timestamp);

  // Skip if there's nothing to capture
  if (touchedFiles.length === 0 && commitHashes.length === 0) {
    process.exit(0);
  }

  const gitBranch = getCurrentBranch(wsPath);
  const commitMessages = getCommitMessagesSince(wsPath, lastSession?.timestamp);

  // Build SessionEvents for smart summary
  const now = new Date().toISOString();
  const events = buildSessionEvents({
    wsPath,
    commitHashes,
    commitMessages,
    touchedFiles,
    currentBranch: gitBranch ?? undefined,
    sessionStartTime: lastSession?.timestamp ?? now,
    lastActivityTime: now,
  });

  const summary = buildSmartSummary(events) ?? `Worked on ${touchedFiles.slice(0, 5).map(f => path.basename(f)).join(', ')}`;
  const nextStep = buildSmartNextStep(events);

  const projectName = path.basename(resolveStorageRoot(wsPath));
  const sessionId = generateSessionId({ workspaceRoot: wsPath, branch: gitBranch ?? undefined, worktreePath: wsPath });
  const checkpoint = createCheckpoint({
    summary,
    nextStep,
    gitBranch,
    touchedFiles,
    commitHashes,
    workspaceRoot: wsPath,
    source: 'auto',
    sessionId,
  });

  const writer = new KeepGoingWriter(wsPath);
  writer.saveCheckpoint(checkpoint, projectName);

  // Mark current task as finished using multi-session API
  writer.upsertSession({
    sessionId,
    sessionActive: false,
    nextStep: checkpoint.nextStep || undefined,
    branch: gitBranch ?? undefined,
    updatedAt: checkpoint.timestamp,
  });

  // Decision detection (Pro feature, requires valid Decision Detection license)
  // Loop all commits between checkpoints so none are missed
  if (process.env.KEEPGOING_PRO_BYPASS === '1' || (await getLicenseForFeatureWithRevalidation('decisions'))) {
    for (let i = 0; i < commitHashes.length; i++) {
      const hash = commitHashes[i];
      const message = commitMessages[i];
      if (!hash || !message) continue;
      const files = getFilesChangedInCommit(wsPath, hash);
      const detected = tryDetectDecision({
        workspacePath: wsPath,
        checkpointId: checkpoint.id,
        gitBranch,
        commitHash: hash,
        commitMessage: message,
        filesChanged: files,
      });
      if (detected) {
        console.log(`[KeepGoing] Decision detected: ${detected.category} (${(detected.confidence * 100).toFixed(0)}% confidence)`);
      }
    }
  }

  console.log(`[KeepGoing] Auto-checkpoint saved: ${summary}`);
  process.exit(0);
}
