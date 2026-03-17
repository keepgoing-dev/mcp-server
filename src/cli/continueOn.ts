import {
  gatherContinueOnContext,
  formatContinueOnPrompt,
} from '@keepgoingdev/shared';
import { KeepGoingReader } from '../storage.js';
import { resolveWsPath } from './util.js';

export async function handleContinueOn(): Promise<void> {
  const wsPath = resolveWsPath();
  const reader = new KeepGoingReader(wsPath);

  if (!reader.exists()) {
    process.exit(0);
  }

  const context = gatherContinueOnContext(reader, wsPath);

  if (!context.lastCheckpoint && !context.briefing) {
    process.exit(0);
  }

  const prompt = formatContinueOnPrompt(context);
  console.log(prompt);
  process.exit(0);
}
