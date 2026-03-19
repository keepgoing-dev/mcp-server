import { pruneStaleTasks, findGitRoot } from '@keepgoingdev/shared';
import type { CurrentTasks } from '@keepgoingdev/shared';
import { extractSessionLabel, extractCurrentAction, truncateAtWord } from './transcriptUtils.js';
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
      if (!raw) process.exit(0);

      const input = JSON.parse(raw) as {
        session_id?: string;
        transcript_path?: string;
        agent?: { name?: string };
        workspace?: { current_dir?: string };
        cwd?: string;
      };

      const dir = input.workspace?.current_dir ?? input.cwd;
      if (!dir) process.exit(0);

      const transcriptPath = input.transcript_path;
      const sessionId = input.session_id;

      // Resolve label: agent.name > cached sessionLabel > transcript > null
      let label: string | null = null;

      if (input.agent?.name) {
        label = input.agent.name;
      }

      if (!label) {
        // Try to find cached sessionLabel in current-tasks.json
        try {
          const gitRoot = findGitRoot(dir);
          const tasksFile = path.join(gitRoot, '.keepgoing', 'current-tasks.json');
          if (fs.existsSync(tasksFile)) {
            const data = JSON.parse(fs.readFileSync(tasksFile, 'utf-8')) as CurrentTasks;
            const tasks = pruneStaleTasks(data.tasks ?? []);
            const match = sessionId ? tasks.find(t => t.sessionId === sessionId) : undefined;
            if (match?.sessionLabel) {
              label = match.sessionLabel;
            }
          }
        } catch {
          // Ignore; fall through to transcript
        }
      }

      if (!label && transcriptPath) {
        label = extractSessionLabel(transcriptPath);
      }

      if (!label) process.exit(0);

      // Get current action from transcript
      const action = transcriptPath ? extractCurrentAction(transcriptPath) : null;

      // Dynamic budget: 40 chars with action verb, 55 chars without
      const budget = action ? 40 : 55;
      const displayLabel = truncateAtWord(label, budget);

      if (action) {
        process.stdout.write(`[KG] ${displayLabel} \u00b7 ${action}\n`);
      } else {
        process.stdout.write(`[KG] ${displayLabel}\n`);
      }
    } catch {
      // Exit silently on errors
    }
    process.exit(0);
  });
  process.stdin.resume();
}
