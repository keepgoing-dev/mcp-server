import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { resolveWsPath } from '../cli/util.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a temp directory with a git repo for testing path resolution.
 */
function makeTmpGitRepo(): { dir: string; cleanup: () => void } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kg-util-test-'));
  execFileSync('git', ['init', '-b', 'main'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir });
  fs.writeFileSync(path.join(dir, 'readme.txt'), 'hello');
  execFileSync('git', ['add', '.'], { cwd: dir });
  execFileSync('git', ['commit', '-m', 'init'], { cwd: dir });
  return { dir, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

// ---------------------------------------------------------------------------
// resolveWsPath
//
// NOTE: resolveWsPath receives args equivalent to process.argv.slice(2) —
// that is, the raw CLI arguments WITHOUT the node binary or script path.
// ---------------------------------------------------------------------------

describe('resolveWsPath', () => {
  it('uses the first positional argument as the workspace path', () => {
    const { dir, cleanup } = makeTmpGitRepo();
    try {
      // Simulates: keepgoing <dir>
      const result = resolveWsPath([dir]);
      assert.equal(result, fs.realpathSync(dir));
    } finally {
      cleanup();
    }
  });

  it('ignores flag arguments (--flag) and uses the next positional arg', () => {
    const { dir, cleanup } = makeTmpGitRepo();
    try {
      // Simulates: keepgoing --verbose <dir>
      const result = resolveWsPath(['--verbose', dir]);
      assert.equal(result, fs.realpathSync(dir));
    } finally {
      cleanup();
    }
  });

  it('falls back to process.cwd() when no arguments are given', () => {
    const result = resolveWsPath([]);
    assert.ok(typeof result === 'string');
    assert.ok(result.length > 0);
  });

  it('falls back to process.cwd() with only flag arguments', () => {
    const result = resolveWsPath(['--quiet', '--verbose']);
    assert.ok(typeof result === 'string');
    assert.ok(result.length > 0);
  });

  it('resolves the git root for a path inside a git repo subdirectory', () => {
    const { dir, cleanup } = makeTmpGitRepo();
    try {
      const subDir = path.join(dir, 'src');
      fs.mkdirSync(subDir, { recursive: true });
      // resolveWsPath calls findGitRoot, which returns the repo root
      const result = resolveWsPath([subDir]);
      assert.equal(result, fs.realpathSync(dir));
    } finally {
      cleanup();
    }
  });
});

