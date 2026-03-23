import { pruneStaleTasks, findGitRoot, formatRelativeTime } from '@keepgoingdev/shared';
import type { CurrentTasks } from '@keepgoingdev/shared';
import { KeepGoingReader } from '../storage.js';
import { extractSessionLabel, extractLatestUserLabel, extractCurrentAction, truncateAtWord } from './transcriptUtils.js';
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

      // Resolve label: agent.name > latest user message > cached sessionLabel > first user message > null
      let label: string | null = null;

      if (input.agent?.name) {
        label = input.agent.name;
      }

      // For active sessions, prefer the latest user message so the label
      // reflects the current topic, not just the initial prompt.
      if (!label && transcriptPath) {
        label = extractLatestUserLabel(transcriptPath);
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

      if (!label) {
        // No active session: show last meaningful checkpoint as fallback.
        // Prefer manual checkpoints over auto-saved ones (auto-saves from session end
        // always show "just now" which isn't useful).
        try {
          const gitRoot = findGitRoot(dir);
          const reader = new KeepGoingReader(gitRoot);
          if (reader.exists()) {
            const recent = reader.getScopedRecentSessions(10);
            const last = recent.find(s => s.source !== 'auto') ?? recent[0];
            if (last) {
              const ago = formatRelativeTime(last.timestamp);
              const summary = last.summary ? truncateAtWord(last.summary, 40) : null;
              const next = last.nextStep ? truncateAtWord(last.nextStep, 30) : null;
              const parts = [`[KG] ${ago}`];
              if (summary) parts.push(summary);
              if (next) parts.push(`\u2192 ${next}`);
              process.stdout.write(`${parts.join(' \u00b7 ')}\n`);
            }
          }
        } catch {
          // Ignore
        }
        process.exit(0);
      }

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
