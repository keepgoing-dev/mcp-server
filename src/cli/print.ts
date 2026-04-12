import {
  formatRelativeTime,
  getLicenseForFeatureWithRevalidation,
  readKnownProjects,
  getColdProjects,
  filterNudgeable,
  checkPrStatus,
  checkBranchTransition,
  type ProjectActivityData,
} from '@keepgoingdev/shared';
import { KeepGoingReader } from '../storage.js';
import { resolveWsPath } from './util.js';
import { migrateStatusline } from './migrate.js';

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

  // Staleness checks - run before building output lines
  let displayNextStep = lastSession.nextStep;
  let prNote: string | null = null;
  const textToCheck = [lastSession.summary, lastSession.nextStep].filter(Boolean).join(' ');
  if (textToCheck) {
    const prStatus = checkPrStatus(textToCheck);
    if (prStatus) {
      if (prStatus.state === 'MERGED') {
        displayNextStep = `PR #${prStatus.number} was merged.`;
      } else if (prStatus.state === 'CLOSED') {
        prNote = `PR #${prStatus.number} was closed without merging.`;
      }
    }
  }

  let branchNote: string | null = null;
  if (lastSession.gitBranch) {
    const transition = checkBranchTransition(lastSession.gitBranch);
    if (transition) {
      if (!transition.previousBranchExists) {
        branchNote = `Branch \`${transition.previousBranch}\` has been deleted.`;
      } else {
        branchNote = `You were on \`${transition.previousBranch}\`, now on \`${transition.currentBranch}\`.`;
      }
    }
  }

  const lines: string[] = [];
  lines.push(`[KeepGoing] Last checkpoint: ${formatRelativeTime(lastSession.timestamp)}`);
  if (lastSession.summary) {
    lines.push(`  Summary: ${lastSession.summary}`);
  }
  if (displayNextStep) {
    lines.push(`  Next step: ${displayNextStep}`);
  }
  if (prNote) {
    lines.push(`  Note: ${prNote}`);
  }
  if (branchNote) {
    lines.push(`  Note: ${branchNote}`);
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

  // Auto-migrate legacy statusline if needed
  const migrationMsg = migrateStatusline(wsPath);
  if (migrationMsg) {
    lines.push(migrationMsg);
  }

  // Cold project warnings (for other projects, not the current one)
  try {
    const known = readKnownProjects();
    const currentProject = wsPath;
    const otherProjects = known.projects.filter(p => p.path !== currentProject);

    if (otherProjects.length > 0) {
      const readActivity = (projectPath: string): ProjectActivityData => {
        try {
          const r = new KeepGoingReader(projectPath);
          if (!r.exists()) return { lastActivityAt: undefined };
          const state = r.getState();
          const last = r.getLastSession();
          return {
            lastActivityAt: state?.lastActivityAt,
            nextStep: last?.nextStep,
            summary: last?.summary,
          };
        } catch {
          return { lastActivityAt: undefined };
        }
      };

      const coldProjects = getColdProjects(otherProjects, 7, readActivity);
      const nudgeablePaths = new Set(filterNudgeable(coldProjects.map(p => p.path)));
      const nudgeable = coldProjects.filter(p => nudgeablePaths.has(p.path));

      if (nudgeable.length > 0) {
        lines.push('');
        lines.push(`  Cold projects (${nudgeable.length}):`);
        for (const cold of nudgeable.slice(0, 3)) {
          const nextInfo = cold.nextStep ? ` Next: ${cold.nextStep}` : '';
          lines.push(`    - ${cold.name} (${cold.daysSinceActivity}d inactive)${nextInfo}`);
        }
      }
    }
  } catch {
    // Never fail the momentum printout over cold detection
  }

  console.log(lines.join('\n'));
  process.exit(0);
}

export async function handlePrintCurrent(): Promise<void> {
  if (process.env.KEEPGOING_PRO_BYPASS !== '1' && !(await getLicenseForFeatureWithRevalidation('session-awareness'))) {
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
