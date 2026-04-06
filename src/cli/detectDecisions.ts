import {
  getCurrentBranch,
  getHeadCommitHash,
  getCommitMessageByHash,
  getFilesChangedInCommit,
  getFilesChangedWithStatus,
  getFileInsertionsInCommit,
  tryDetectDecision,
  getLicenseForFeatureWithRevalidation,
} from '@keepgoingdev/shared';
import { KeepGoingReader } from '../storage.js';
import { resolveWsPath } from './util.js';

/**
 * Called by the global post-commit hook after every git commit.
 * Detects high-signal decisions from the HEAD commit and writes
 * them to `.keepgoing/decisions.json`.
 */
export async function handleDetectDecisions(): Promise<void> {
  const wsPath = resolveWsPath();

  // Respect Pro gate
  if (!(process.env.KEEPGOING_PRO_BYPASS === '1' || (await getLicenseForFeatureWithRevalidation('decisions')))) {
    process.exit(0);
  }

  // Only run if .keepgoing/ exists (auto-init is handled by write-triggers
  // like save_checkpoint, not by read-only detection)
  const reader = new KeepGoingReader(wsPath);
  if (!reader.exists()) {
    process.exit(0);
  }

  const gitBranch = getCurrentBranch(wsPath);
  const headHash = getHeadCommitHash(wsPath);
  if (!headHash) process.exit(0);

  // Get HEAD commit message by hash (avoids loading all recent commits)
  const commitMessage = getCommitMessageByHash(wsPath, headHash);
  if (!commitMessage) process.exit(0);

  const files = getFilesChangedInCommit(wsPath, headHash);
  const filesWithStatus = getFilesChangedWithStatus(wsPath, headHash);
  const fileStats = getFileInsertionsInCommit(wsPath, headHash);

  const detected = tryDetectDecision({
    workspacePath: wsPath,
    gitBranch,
    commitHash: headHash,
    commitMessage,
    filesChanged: files,
    filesWithStatus,
    fileStats,
  });

  if (detected) {
    console.log(`[KeepGoing] Decision detected: ${detected.category} (${(detected.confidence * 100).toFixed(0)}% confidence)`);
  }

  process.exit(0);
}
