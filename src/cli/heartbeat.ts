import {
  KeepGoingWriter,
  getCurrentBranch,
  generateSessionId,
  type CurrentTask,
} from '@keepgoingdev/shared';
import { resolveWsPath } from './util.js';
import { extractSessionLabel } from './transcriptUtils.js';

const STDIN_TIMEOUT_MS = 3_000;
// TODO: tune throttle interval based on real-world usage
const THROTTLE_MS = 30_000;

export async function handleHeartbeat(): Promise<void> {
  const wsPath = resolveWsPath();

  const chunks: Buffer[] = [];
  const timeout = setTimeout(() => process.exit(0), STDIN_TIMEOUT_MS);
  process.stdin.on('error', () => { clearTimeout(timeout); process.exit(0); });
  process.stdin.on('data', (chunk: Buffer) => chunks.push(chunk));
  process.stdin.on('end', () => {
    clearTimeout(timeout);
    try {
      const raw = Buffer.concat(chunks).toString('utf-8').trim();
      if (!raw) {
        process.exit(0);
      }
      const hookData = JSON.parse(raw) as {
        session_id?: string;
        transcript_path?: string;
        tool_input?: Record<string, unknown>;
        permission_mode?: string;
      };

      const writer = new KeepGoingWriter(wsPath);
      const existing = writer.readCurrentTasks();
      const sessionIdFromHook = hookData.session_id;

      // Prefer session_id from hook; fall back to deterministic hash (include branch for consistency with saveCheckpoint)
      const sessionId = sessionIdFromHook || generateSessionId({ workspaceRoot: wsPath, worktreePath: wsPath, branch: getCurrentBranch(wsPath) ?? undefined });

      const existingSession = existing.find(t => t.sessionId === sessionId);

      // Throttle: skip if updated less than 30 seconds ago
      if (existingSession?.updatedAt) {
        const ageMs = Date.now() - new Date(existingSession.updatedAt).getTime();
        if (ageMs < THROTTLE_MS) {
          process.exit(0);
        }
      }

      // Never downgrade from 'active' to 'planning'
      const sessionPhase: 'planning' | 'active' =
        existingSession?.sessionPhase === 'active' ? 'active' : 'planning';

      // Reuse branch from existing session to avoid spawning git on every heartbeat
      const branch = existingSession?.branch ?? getCurrentBranch(wsPath) ?? undefined;

      const task: Partial<CurrentTask> & { sessionActive: boolean; updatedAt: string } = {
        sessionId,
        sessionActive: true,
        updatedAt: new Date().toISOString(),
        sessionPhase,
        worktreePath: wsPath,
        branch,
      };

      // Cache sessionLabel on first heartbeat; never overwrite once set
      if (!existingSession?.sessionLabel && hookData.transcript_path) {
        const label = extractSessionLabel(hookData.transcript_path);
        if (label) task.sessionLabel = label;
      }

      writer.upsertSession(task);
    } catch {
      // Exit silently on errors
    }
    process.exit(0);
  });
  process.stdin.resume();
}
