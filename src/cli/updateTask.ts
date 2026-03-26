import {
  KeepGoingWriter,
  getCurrentBranch,
  generateSessionId,
  stripAgentTags,
  type CurrentTask,
} from '@keepgoingdev/shared';
import { resolveWsPath } from './util.js';
import { extractSessionLabel } from './transcriptUtils.js';

export async function handleUpdateTask(): Promise<void> {
  const args = process.argv.slice(2);
  const flagIndex = args.indexOf('--update-task');
  const payloadStr = args[flagIndex + 1];

  // Exclude the payload argument when resolving workspace path
  const wsArgs = args.filter((a, i) => !a.startsWith('--') && i !== flagIndex + 1);
  const wsPath = resolveWsPath(wsArgs.length > 0 ? wsArgs : undefined);

  if (payloadStr) {
    try {
      const payload = JSON.parse(payloadStr) as Partial<CurrentTask>;
      // Defense-in-depth: strip agent XML tags from user-facing fields
      if (payload.taskSummary) payload.taskSummary = stripAgentTags(payload.taskSummary);
      if (payload.sessionLabel) payload.sessionLabel = stripAgentTags(payload.sessionLabel);
      const writer = new KeepGoingWriter(wsPath);
      const branch = payload.branch ?? getCurrentBranch(wsPath) ?? undefined;
      const task: Partial<CurrentTask> & { sessionActive: boolean; updatedAt: string } = {
        ...payload,
        branch,
        worktreePath: wsPath,
        sessionActive: payload.sessionActive !== false,
        updatedAt: new Date().toISOString(),
      };

      // Use multi-session API if sessionId is present or can be derived
      const sessionId = payload.sessionId || generateSessionId({ ...task, workspaceRoot: wsPath });
      task.sessionId = sessionId;
      writer.upsertSession(task);
    } catch {
      // Exit silently on parse errors
    }
  }
  process.exit(0);
}

const STDIN_TIMEOUT_MS = 5_000;

export async function handleUpdateTaskFromHook(): Promise<void> {
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
        tool_name?: string;
        tool_input?: { file_path?: string; path?: string };
        session_id?: string;
        transcript_path?: string;
      };
      const toolName = hookData.tool_name ?? 'Edit';
      const filePath = hookData.tool_input?.file_path ?? hookData.tool_input?.path ?? '';
      const fileName = filePath ? filePath.split('/').pop() ?? filePath : '';
      const writer = new KeepGoingWriter(wsPath);
      // Reuse branch from OUR session to avoid spawning git on every edit.
      // Only match by sessionId so we never inherit a stale branch from another session.
      const existing = writer.readCurrentTasks();
      const sessionIdFromHook = hookData.session_id;
      const existingSession = sessionIdFromHook
        ? existing.find(t => t.sessionId === sessionIdFromHook)
        : undefined;
      const cachedBranch = existingSession?.branch;
      const branch = cachedBranch ?? getCurrentBranch(wsPath) ?? undefined;

      const task: Partial<CurrentTask> & { sessionActive: boolean; updatedAt: string } = {
        taskSummary: fileName ? `${toolName} ${fileName}` : `Used ${toolName}`,
        lastFileEdited: filePath || undefined,
        branch,
        worktreePath: wsPath,
        sessionActive: true,
        updatedAt: new Date().toISOString(),
      };

      // Derive session ID from context
      const sessionId = hookData.session_id || generateSessionId({ ...task, workspaceRoot: wsPath });
      task.sessionId = sessionId;

      // Cache sessionLabel on first hook fire; never overwrite once set
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
