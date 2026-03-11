import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const STATUSLINE_CMD = 'npx -y @keepgoingdev/mcp-server --statusline';

/**
 * Check if a statusline command is a legacy keepgoing script that needs migration.
 * Matches the known legacy pattern: a path to keepgoing-statusline.sh copied during setup.
 */
export function isLegacyStatusline(command: string): boolean {
  return !command.includes('--statusline') && command.includes('keepgoing-statusline');
}

/**
 * Migrate legacy statusline (copied script) to npx command.
 * Rewrites .claude/settings.json and removes the old script file.
 * Returns a user-facing message if migration occurred, or undefined if nothing changed.
 */
export function migrateStatusline(wsPath: string): string | undefined {
  const settingsPath = path.join(wsPath, '.claude', 'settings.json');
  if (!fs.existsSync(settingsPath)) return undefined;

  try {
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    const cmd: string | undefined = settings.statusLine?.command;
    if (!cmd || !isLegacyStatusline(cmd)) return undefined;

    settings.statusLine = {
      type: 'command',
      command: STATUSLINE_CMD,
    };
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');

    cleanupLegacyScript();

    return '[KeepGoing] Migrated statusline to auto-updating command (restart Claude Code to apply)';
  } catch {
    return undefined;
  }
}

/** Remove the legacy ~/.claude/keepgoing-statusline.sh if it exists. */
export function cleanupLegacyScript(): void {
  const legacyScript = path.join(os.homedir(), '.claude', 'keepgoing-statusline.sh');
  if (fs.existsSync(legacyScript)) {
    try { fs.unlinkSync(legacyScript); } catch { /* ignore */ }
  }
}

export { STATUSLINE_CMD };
