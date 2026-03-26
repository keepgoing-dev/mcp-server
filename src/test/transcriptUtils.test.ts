import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  truncateAtWord,
  extractSessionLabel,
  extractLatestUserLabel,
  extractCurrentAction,
} from '../cli/transcriptUtils.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function userEntry(text: string) {
  return JSON.stringify({
    type: 'user',
    message: { role: 'user', content: [{ type: 'text', text }] },
  });
}

function assistantTextEntry(text: string) {
  return JSON.stringify({
    type: 'assistant',
    message: { role: 'assistant', content: [{ type: 'text', text }] },
  });
}

function assistantToolEntry(toolName: string) {
  return JSON.stringify({
    type: 'assistant',
    message: {
      role: 'assistant',
      content: [
        { type: 'text', text: 'Sure, let me do that.' },
        { type: 'tool_use', name: toolName },
      ],
    },
  });
}

let tmpDir: string;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kg-test-transcript-'));
});

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeTmp(name: string, lines: string[]): string {
  const p = path.join(tmpDir, name);
  fs.writeFileSync(p, lines.join('\n'));
  return p;
}

// ---------------------------------------------------------------------------
// truncateAtWord
// ---------------------------------------------------------------------------

describe('truncateAtWord', () => {
  it('returns text unchanged when shorter than max', () => {
    assert.equal(truncateAtWord('hello world', 20), 'hello world');
  });

  it('returns text unchanged when exactly max length', () => {
    const text = 'exactly ten';
    assert.equal(truncateAtWord(text, text.length), text);
  });

  it('cuts at last word boundary before max', () => {
    // "abcdefghij kl" is 13 chars; max=12 -> cut="abcdefghij k", lastSpace=10, max/2=6 -> 10 > 6 -> use word boundary
    const result = truncateAtWord('abcdefghij kl', 12);
    assert.ok(result.endsWith('\u2026'), 'should end with ellipsis');
    assert.equal(result, 'abcdefghij\u2026');
  });

  it('appends ellipsis when text is cut', () => {
    const result = truncateAtWord('one two three four five', 10);
    assert.ok(result.endsWith('\u2026'));
  });

  it('falls back to hard cut when last space is too early (< max/2)', () => {
    // Single long word with no space: last space is -1, which is < max/2
    const result = truncateAtWord('averylongwordwithoutspaces', 10);
    assert.ok(result.endsWith('\u2026'));
    // Should be 9 chars + ellipsis = 10 char display
    assert.equal(result.length, 10);
  });
});

// ---------------------------------------------------------------------------
// extractSessionLabel
// ---------------------------------------------------------------------------

describe('extractSessionLabel', () => {
  it('returns null for nonexistent file', () => {
    assert.equal(extractSessionLabel('/no/such/file.jsonl'), null);
  });

  it('returns null for empty path', () => {
    assert.equal(extractSessionLabel(''), null);
  });

  it('extracts first substantive user message', () => {
    const p = writeTmp('session-basic.jsonl', [
      userEntry('Refactor the authentication module to use JWT tokens instead of sessions'),
    ]);
    const label = extractSessionLabel(p);
    assert.notEqual(label, null);
    assert.ok((label as string).includes('Refactor the authentication module'));
  });

  it('skips bracket-prefixed system-injected messages', () => {
    const p = writeTmp('session-bracket.jsonl', [
      userEntry('[System context injected by hook]'),
      userEntry('Add a new endpoint for user profile updates to the REST API'),
    ]);
    const label = extractSessionLabel(p);
    assert.notEqual(label, null);
    assert.ok((label as string).includes('endpoint'));
  });

  it('skips XML-tag-prefixed system messages', () => {
    const p = writeTmp('session-xml.jsonl', [
      userEntry('<session>some injected context here</session>'),
      userEntry('Implement dark mode support for the settings panel in the app'),
    ]);
    const label = extractSessionLabel(p);
    assert.notEqual(label, null);
    assert.ok((label as string).includes('dark mode'));
  });

  it('strips @-file mentions', () => {
    const p = writeTmp('session-atfile.jsonl', [
      userEntry('@src/components/Button.tsx refactor this component to use hooks'),
    ]);
    const label = extractSessionLabel(p);
    assert.notEqual(label, null);
    assert.ok(!(label as string).includes('@src'));
  });

  it('strips filler prefix "please"', () => {
    const p = writeTmp('session-please.jsonl', [
      userEntry('please implement the new caching layer for the database queries'),
    ]);
    const label = extractSessionLabel(p);
    assert.notEqual(label, null);
    assert.ok(!(label as string).toLowerCase().startsWith('please'));
  });

  it('strips filler prefix "can you"', () => {
    const p = writeTmp('session-canyou.jsonl', [
      userEntry('can you add pagination support to the user listing endpoint'),
    ]);
    const label = extractSessionLabel(p);
    assert.notEqual(label, null);
    assert.ok(!(label as string).toLowerCase().startsWith('can you'));
  });

  it('strips filler prefix "let\'s"', () => {
    const p = writeTmp('session-lets.jsonl', [
      userEntry("let's refactor the database connection pooling configuration"),
    ]);
    const label = extractSessionLabel(p);
    assert.notEqual(label, null);
    assert.ok(!(label as string).toLowerCase().startsWith("let's"));
  });

  it('caps result at 80 chars', () => {
    const longText =
      'Implement a comprehensive data migration pipeline that processes all legacy records and transforms them into the new schema format';
    const p = writeTmp('session-long.jsonl', [userEntry(longText)]);
    const label = extractSessionLabel(p);
    assert.notEqual(label, null);
    assert.ok((label as string).length <= 80);
  });

  it('skips messages shorter than 20 chars and returns next suitable one', () => {
    const p = writeTmp('session-short.jsonl', [
      userEntry('hi there'),
      userEntry('Migrate all legacy user records to the new normalized database schema'),
    ]);
    const label = extractSessionLabel(p);
    assert.notEqual(label, null);
    assert.ok((label as string).includes('Migrate'));
  });

  it('returns null when no suitable message exists', () => {
    const p = writeTmp('session-nosub.jsonl', [
      userEntry('[hook context]'),
      userEntry('<env>vars</env>'),
      userEntry('short'),
    ]);
    assert.equal(extractSessionLabel(p), null);
  });

  it('skips messages starting with <teammate-message> tags', () => {
    const p = writeTmp('session-teammate.jsonl', [
      userEntry('<teammate-message teammate_id="team-lead">Fix the bug in auth module and add tests for it</teammate-message>'),
      userEntry('Add comprehensive error handling to the payment processing pipeline'),
    ]);
    const label = extractSessionLabel(p);
    assert.notEqual(label, null);
    assert.ok((label as string).includes('error handling'));
    assert.ok(!(label as string).includes('teammate-message'));
  });

  it('strips mid-text agent tags and uses the cleaned message', () => {
    const p = writeTmp('session-agent-mid.jsonl', [
      userEntry('Some preamble text <system-reminder>injected context here</system-reminder>'),
      userEntry('Refactor the database connection pool to support read replicas'),
    ]);
    const label = extractSessionLabel(p);
    assert.notEqual(label, null);
    // First message is used after stripping the agent tags
    assert.ok((label as string).includes('preamble text'));
  });
});

// ---------------------------------------------------------------------------
// extractLatestUserLabel
// ---------------------------------------------------------------------------

describe('extractLatestUserLabel', () => {
  it('returns null for nonexistent file', () => {
    assert.equal(extractLatestUserLabel('/no/such/file.jsonl'), null);
  });

  it('returns null for empty file', () => {
    const p = writeTmp('latest-empty.jsonl', ['']);
    assert.equal(extractLatestUserLabel(p), null);
  });

  it('reads from the tail of the file (returns last substantive user message)', () => {
    const p = writeTmp('latest-tail.jsonl', [
      userEntry('Refactor the authentication module to use modern JWT tokens'),
      assistantTextEntry('Sure, I can help with that.'),
      userEntry('Now update the password reset flow for the account management feature'),
    ]);
    const label = extractLatestUserLabel(p);
    assert.notEqual(label, null);
    // Should prefer the later message
    assert.ok((label as string).toLowerCase().includes('password reset'));
  });

  it('skips system-injected messages when scanning backwards', () => {
    const p = writeTmp('latest-skip-injected.jsonl', [
      userEntry('Implement a rate limiter for the authentication service endpoints'),
      assistantTextEntry('Working on it.'),
      userEntry('[System: session refreshed]'),
    ]);
    const label = extractLatestUserLabel(p);
    assert.notEqual(label, null);
    assert.ok((label as string).includes('rate limiter'));
  });
});

// ---------------------------------------------------------------------------
// extractCurrentAction
// ---------------------------------------------------------------------------

describe('extractCurrentAction', () => {
  it('returns null for nonexistent file', () => {
    assert.equal(extractCurrentAction('/no/such/file.jsonl'), null);
  });

  it('returns null for empty file', () => {
    const p = writeTmp('action-empty.jsonl', ['']);
    assert.equal(extractCurrentAction(p), null);
  });

  it('maps Edit tool to "editing"', () => {
    const p = writeTmp('action-edit.jsonl', [assistantToolEntry('Edit')]);
    assert.equal(extractCurrentAction(p), 'editing');
  });

  it('maps Write tool to "editing"', () => {
    const p = writeTmp('action-write.jsonl', [assistantToolEntry('Write')]);
    assert.equal(extractCurrentAction(p), 'editing');
  });

  it('maps Read tool to "researching"', () => {
    const p = writeTmp('action-read.jsonl', [assistantToolEntry('Read')]);
    assert.equal(extractCurrentAction(p), 'researching');
  });

  it('maps Bash tool to "running"', () => {
    const p = writeTmp('action-bash.jsonl', [assistantToolEntry('Bash')]);
    assert.equal(extractCurrentAction(p), 'running');
  });

  it('maps WebSearch tool to "browsing"', () => {
    const p = writeTmp('action-websearch.jsonl', [assistantToolEntry('WebSearch')]);
    assert.equal(extractCurrentAction(p), 'browsing');
  });

  it('maps TodoWrite tool to "planning"', () => {
    const p = writeTmp('action-todo.jsonl', [assistantToolEntry('TodoWrite')]);
    assert.equal(extractCurrentAction(p), 'planning');
  });

  it('maps unknown tool to "working"', () => {
    const p = writeTmp('action-unknown.jsonl', [assistantToolEntry('SomeUnknownTool')]);
    assert.equal(extractCurrentAction(p), 'working');
  });

  it('returns "done" when last assistant entry is text-only (no tool use)', () => {
    const p = writeTmp('action-done.jsonl', [
      assistantToolEntry('Edit'),
      assistantTextEntry('I have finished editing the files.'),
    ]);
    assert.equal(extractCurrentAction(p), 'done');
  });

  it('returns null when no assistant entries exist', () => {
    const p = writeTmp('action-noassistant.jsonl', [
      userEntry('Implement the new data pipeline for processing user events'),
    ]);
    assert.equal(extractCurrentAction(p), null);
  });
});
