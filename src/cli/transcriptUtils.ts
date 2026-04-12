import fs from 'node:fs';
import { stripAgentTags } from '@keepgoingdev/shared';

const TAIL_READ_BYTES = 32_768;
const LATEST_LABEL_READ_BYTES = 65_536;

const TOOL_VERB_MAP: Record<string, string> = {
  Edit: 'editing',
  MultiEdit: 'editing',
  Write: 'editing',
  Read: 'researching',
  Glob: 'researching',
  Grep: 'researching',
  Bash: 'running',
  Agent: 'delegating',
  WebFetch: 'browsing',
  WebSearch: 'browsing',
  TodoWrite: 'planning',
  AskUserQuestion: 'discussing',
  EnterPlanMode: 'planning',
  ExitPlanMode: 'planning',
  TaskCreate: 'planning',
  TaskUpdate: 'planning',
};

/**
 * Truncates text at the last word boundary at or before `max` chars, appending ellipsis if cut.
 */
export function truncateAtWord(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > max / 2 ? cut.slice(0, lastSpace) : cut.slice(0, max - 1)) + '\u2026';
}

const FILLER_PREFIX_RE = /^(i want to|can you|please|let['']?s|could you|help me|i need to|i['']d like to|implement the following plan[:\s]*|implement this plan[:\s]*)\s*/i;
const MARKDOWN_HEADING_RE = /^#+\s+/;

/**
 * Matches framework/system messages that leak into the transcript as user entries.
 * These are Claude Code internal messages (skill loading, plugin cache paths, etc.)
 * that should never be used as session labels.
 */
const FRAMEWORK_NOISE_RE = /^(base directory for this skill:|skill directory:|loading skill |\.claude\/plugins\/cache)/i;

// Claude Code transcript JSONL entry shape (wrapped format)
interface TranscriptEntry {
  type?: string;
  message?: {
    role?: string;
    content?: unknown;
  };
}

interface ContentPart {
  type?: string;
  text?: string;
  name?: string;
}

function extractTextFromContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  let text = '';
  for (const part of content as ContentPart[]) {
    if (part.type === 'text' && typeof part.text === 'string') {
      text += part.text + ' ';
    }
  }
  return text.trim();
}

function isUserEntry(entry: TranscriptEntry): boolean {
  // Claude Code wraps messages: { type: "user", message: { role: "user", content: [...] } }
  return entry.type === 'user' && entry.message?.role === 'user';
}

function getToolUseFromEntry(entry: TranscriptEntry): string | null {
  const content = entry.message?.content;
  if (!Array.isArray(content)) return null;
  for (const part of (content as ContentPart[]).slice().reverse()) {
    if (part.type === 'tool_use' && typeof part.name === 'string') {
      return part.name;
    }
  }
  return null;
}

function isAssistantEntry(entry: TranscriptEntry): boolean {
  return entry.message?.role === 'assistant';
}

/**
 * Extracts a stable session label from the first substantive user message in a transcript.
 * Returns null if no suitable message is found.
 */
export function extractSessionLabel(transcriptPath: string): string | null {
  if (!transcriptPath || !fs.existsSync(transcriptPath)) return null;

  try {
    const raw = fs.readFileSync(transcriptPath, 'utf-8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      let entry: TranscriptEntry;
      try {
        entry = JSON.parse(trimmed) as TranscriptEntry;
      } catch {
        continue;
      }

      if (!isUserEntry(entry)) continue;

      let text = extractTextFromContent(entry.message?.content);
      if (!text) continue;

      // Skip system-injected messages (bracket-prefixed or starting with an XML tag)
      if (text.startsWith('[') || /^<[a-z][\w-]*[\s>]/.test(text)) continue;

      // Skip Claude Code framework messages (skill loading, plugin cache paths)
      if (FRAMEWORK_NOISE_RE.test(text)) continue;

      // Strip any residual agent framework tags
      text = stripAgentTags(text);
      if (!text) continue;

      // Strip @-file mentions
      text = text.replace(/@[\w./\-]+/g, '').trim();
      // Strip filler prefixes
      text = text.replace(FILLER_PREFIX_RE, '').trim();
      // Strip markdown heading markers
      text = text.replace(MARKDOWN_HEADING_RE, '').trim();
      // Collapse whitespace/newlines to single space
      text = text.replace(/\s+/g, ' ').trim();

      if (text.length < 20) continue;

      // Cap at 80 chars to bound reads; truncate at word boundary with ellipsis
      text = truncateAtWord(text, 80);

      return text;
    }
  } catch {
    // Ignore errors
  }
  return null;
}

/**
 * Extracts the latest substantive user message from the transcript (tail-read, scan backwards).
 * Returns null if no suitable message is found within the read window.
 */
export function extractLatestUserLabel(transcriptPath: string): string | null {
  if (!transcriptPath || !fs.existsSync(transcriptPath)) return null;

  try {
    const stat = fs.statSync(transcriptPath);
    const fileSize = stat.size;
    if (fileSize === 0) return null;

    const readSize = Math.min(fileSize, LATEST_LABEL_READ_BYTES);
    const offset = fileSize - readSize;

    const buf = Buffer.alloc(readSize);
    const fd = fs.openSync(transcriptPath, 'r');
    try {
      fs.readSync(fd, buf, 0, readSize, offset);
    } finally {
      fs.closeSync(fd);
    }

    const tail = buf.toString('utf-8');
    const lines = tail.split('\n').reverse();

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      let entry: TranscriptEntry;
      try {
        entry = JSON.parse(trimmed) as TranscriptEntry;
      } catch {
        continue;
      }

      if (!isUserEntry(entry)) continue;

      let text = extractTextFromContent(entry.message?.content);
      if (!text) continue;

      // Skip system-injected messages (bracket-prefixed or starting with an XML tag)
      if (text.startsWith('[') || /^<[a-z][\w-]*[\s>]/.test(text)) continue;

      // Skip Claude Code framework messages (skill loading, plugin cache paths)
      if (FRAMEWORK_NOISE_RE.test(text)) continue;

      // Strip any residual agent framework tags
      text = stripAgentTags(text);
      if (!text) continue;

      // Strip @-file mentions
      text = text.replace(/@[\w./\-]+/g, '').trim();
      // Strip filler prefixes
      text = text.replace(FILLER_PREFIX_RE, '').trim();
      // Strip markdown heading markers
      text = text.replace(MARKDOWN_HEADING_RE, '').trim();
      // Collapse whitespace/newlines to single space
      text = text.replace(/\s+/g, ' ').trim();

      if (text.length < 20) continue;

      text = truncateAtWord(text, 80);

      return text;
    }
  } catch {
    // Ignore errors
  }
  return null;
}

/**
 * Extracts the current action verb by reading the last tool_use entry from the transcript.
 * Reads only the last TAIL_READ_BYTES for efficiency.
 * Returns null if no tool use is found.
 */
export function extractCurrentAction(transcriptPath: string): string | null {
  if (!transcriptPath || !fs.existsSync(transcriptPath)) return null;

  try {
    const stat = fs.statSync(transcriptPath);
    const fileSize = stat.size;
    if (fileSize === 0) return null;

    const readSize = Math.min(fileSize, TAIL_READ_BYTES);
    const offset = fileSize - readSize;

    const buf = Buffer.alloc(readSize);
    const fd = fs.openSync(transcriptPath, 'r');
    try {
      fs.readSync(fd, buf, 0, readSize, offset);
    } finally {
      fs.closeSync(fd);
    }

    const tail = buf.toString('utf-8');
    const lines = tail.split('\n').reverse();

    // Track whether we've passed a user entry before finding an assistant entry.
    // If so, the user sent a message the AI hasn't responded to yet.
    let pendingUserMessage = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      let entry: TranscriptEntry;
      try {
        entry = JSON.parse(trimmed) as TranscriptEntry;
      } catch {
        continue;
      }

      if (isUserEntry(entry)) {
        pendingUserMessage = true;
        continue;
      }

      if (!isAssistantEntry(entry)) continue;

      // User sent a message the AI hasn't responded to yet — show thinking
      if (pendingUserMessage) {
        return 'thinking';
      }

      const toolName = getToolUseFromEntry(entry);
      if (toolName) {
        return TOOL_VERB_MAP[toolName] ?? 'working';
      }
      // Last assistant entry is text-only — AI finished its turn, no active action
      return null;
    }
  } catch {
    // Ignore errors
  }
  return null;
}
