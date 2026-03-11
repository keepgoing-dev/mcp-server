import { getCurrentBranch, pruneStaleTasks, findGitRoot } from '@keepgoingdev/shared';
import type { CurrentTasks } from '@keepgoingdev/shared';
import fs from 'node:fs';
import path from 'node:path';

const STDIN_TIMEOUT_MS = 3_000;

export async function handleStatusline(): Promise<void> {
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
      const input = JSON.parse(raw) as { workspace?: { current_dir?: string }; cwd?: string };
      const dir = input.workspace?.current_dir ?? input.cwd;
      if (!dir) {
        process.exit(0);
      }

      const gitRoot = findGitRoot(dir);
      const tasksFile = path.join(gitRoot, '.keepgoing', 'current-tasks.json');
      if (!fs.existsSync(tasksFile)) {
        process.exit(0);
      }

      const data = JSON.parse(fs.readFileSync(tasksFile, 'utf-8')) as CurrentTasks;
      const branch = getCurrentBranch(gitRoot) ?? '';

      // Prune stale sessions (>2h) and filter to current branch
      const active = pruneStaleTasks(data.tasks ?? [])
        .filter(t => t.sessionActive && t.branch === branch);

      if (active.length === 0) {
        process.exit(0);
      }

      // Pick the most recently updated task
      active.sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
      const task = active[active.length - 1];
      const summary = task.taskSummary;
      if (!summary) {
        process.exit(0);
      }

      if (branch) {
        process.stdout.write(`[KG] ${branch}: ${summary}\n`);
      } else {
        process.stdout.write(`[KG] ${summary}\n`);
      }
    } catch {
      // Exit silently on errors
    }
    process.exit(0);
  });
  process.stdin.resume();
}
