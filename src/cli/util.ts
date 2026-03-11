import { findGitRoot } from '@keepgoingdev/shared';

/**
 * Resolve the workspace path from CLI arguments.
 * Takes the first non-flag argument as an explicit path, falling back to CWD.
 */
export function resolveWsPath(args: string[] = process.argv.slice(2)): string {
  const explicit = args.find(a => !a.startsWith('--'));
  return findGitRoot(explicit || process.cwd());
}
