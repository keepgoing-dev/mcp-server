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
  const writer = new KeepGoingWriter(wsPath);

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

  const gitBranch = getCurrentBranch(wsPath);

  // Look up existing session for this workspace+branch.
  // The session was likely created by the post-tool or heartbeat hook using Claude's
  // session_id (a UUID), which won't match generateSessionId's deterministic hash.
  // Match by worktreePath + branch + sessionActive to find the right session first.
  const existingTasks = writer.readCurrentTasks();
  const existingSession = existingTasks.find(t =>
    t.sessionActive && t.worktreePath === wsPath && t.branch === (gitBranch ?? undefined),
  ) ?? existingTasks.find(t =>
    t.sessionActive && t.worktreePath === wsPath,
  );
  const sessionId = existingSession?.sessionId
    ?? generateSessionId({ workspaceRoot: wsPath, branch: gitBranch ?? undefined, worktreePath: wsPath });
  const isPlanning = existingSession?.sessionPhase === 'planning';

  // Skip only if there's nothing to capture AND we're not in a planning session
  if (touchedFiles.length === 0 && commitHashes.length === 0 && !isPlanning) {
    process.exit(0);
  }

  const projectName = path.basename(resolveStorageRoot(wsPath));

  // Planning session with no files/commits: save a lightweight checkpoint
  if (touchedFiles.length === 0 && commitHashes.length === 0 && isPlanning) {
    const summary = existingSession?.sessionLabel
      || existingSession?.taskSummary
      || 'Planning session';
    const checkpoint = createCheckpoint({
      summary,
      nextStep: existingSession?.nextStep || '',
      gitBranch,
      touchedFiles: [],
      commitHashes: [],
      workspaceRoot: wsPath,
      source: 'auto',
      sessionId,
      sessionPhase: 'planning',
      tags: ['plan'],
    });

    writer.saveCheckpoint(checkpoint, projectName);

    writer.upsertSession({
      sessionId,
      sessionActive: false,
      nextStep: checkpoint.nextStep || undefined,
      branch: gitBranch ?? undefined,
      updatedAt: checkpoint.timestamp,
    });

    console.log(`[KeepGoing] Plan checkpoint saved: ${summary}`);
    process.exit(0);
  }

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

  const sessionPhase = existingSession?.sessionPhase;
  const checkpoint = createCheckpoint({
    summary,
    nextStep,
    gitBranch,
    touchedFiles,
    commitHashes,
    workspaceRoot: wsPath,
    source: 'auto',
    sessionId,
    ...(sessionPhase ? { sessionPhase } : {}),
    ...(sessionPhase === 'planning' ? { tags: ['plan'] } : {}),
  });

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
