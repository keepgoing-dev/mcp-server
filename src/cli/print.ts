import { formatRelativeTime, getLicenseForFeature } from '@keepgoingdev/shared';
import { KeepGoingReader } from '../storage.js';
import { resolveWsPath } from './util.js';

export async function handlePrintMomentum(): Promise<void> {
  const wsPath = resolveWsPath();
  const reader = new KeepGoingReader(wsPath);

  if (!reader.exists()) {
    process.exit(0);
  }

  const { session: lastSession } = reader.getScopedLastSession();
  if (!lastSession) {
    process.exit(0);
  }

  const touchedCount = lastSession.touchedFiles?.length ?? 0;
  const lines: string[] = [];
  lines.push(`[KeepGoing] Last checkpoint: ${formatRelativeTime(lastSession.timestamp)}`);
  if (lastSession.summary) {
    lines.push(`  Summary: ${lastSession.summary}`);
  }
  if (lastSession.nextStep) {
    lines.push(`  Next step: ${lastSession.nextStep}`);
  }
  if (lastSession.blocker) {
    lines.push(`  Blocker: ${lastSession.blocker}`);
  }
  if (lastSession.gitBranch) {
    lines.push(`  Branch: ${lastSession.gitBranch}`);
  }
  if (touchedCount > 0) {
    lines.push(`  Worked on ${touchedCount} files on ${lastSession.gitBranch ?? 'unknown branch'}`);
  }
  lines.push('  Tip: Use the get_reentry_briefing tool for a full briefing');

  console.log(lines.join('\n'));
  process.exit(0);
}

export async function handlePrintCurrent(): Promise<void> {
  if (process.env.KEEPGOING_PRO_BYPASS !== '1' && !getLicenseForFeature('session-awareness')) {
    process.exit(0);
  }

  const wsPath = resolveWsPath();
  const reader = new KeepGoingReader(wsPath);
  const tasks = reader.getCurrentTasks();

  if (tasks.length === 0) {
    process.exit(0);
  }

  const activeTasks = tasks.filter(t => t.sessionActive);
  const finishedTasks = tasks.filter(t => !t.sessionActive);

  // Summary line
  if (tasks.length > 1) {
    const parts: string[] = [];
    if (activeTasks.length > 0) parts.push(`${activeTasks.length} active`);
    if (finishedTasks.length > 0) parts.push(`${finishedTasks.length} finished`);
    console.log(`[KeepGoing] Sessions: ${parts.join(', ')}`);
  }

  // Print each task
  for (const task of [...activeTasks, ...finishedTasks]) {
    const prefix = task.sessionActive ? '[KeepGoing] Current task:' : '[KeepGoing] \u2705 Last task:';
    const sessionLabel = task.agentLabel || task.sessionId || '';
    const labelSuffix = sessionLabel ? ` (${sessionLabel})` : '';
    const lines: string[] = [`${prefix} ${formatRelativeTime(task.updatedAt)}${labelSuffix}`];
    if (task.branch) {
      lines.push(`  Branch: ${task.branch}`);
    }
    if (task.taskSummary) {
      lines.push(`  Doing: ${task.taskSummary}`);
    }
    if (task.nextStep) {
      lines.push(`  Next: ${task.nextStep}`);
    }
    console.log(lines.join('\n'));
  }

  process.exit(0);
}
