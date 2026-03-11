import fs from 'node:fs';
import path from 'node:path';
import {
  getRecentSessions,
  readLicenseStore,
  resolveStorageRoot,
  getCurrentBranch,
  pruneStaleTasks,
  type SessionCheckpoint,
  type ProjectSessions,
  type ProjectState,
  type ProjectMeta,
  type DecisionRecord,
  type ProjectDecisions,
  type LicenseStore,
  type CurrentTask,
  type CurrentTasks,
} from '@keepgoingdev/shared';

const STORAGE_DIR = '.keepgoing';
const META_FILE = 'meta.json';
const SESSIONS_FILE = 'sessions.json';
const DECISIONS_FILE = 'decisions.json';
const STATE_FILE = 'state.json';
const CURRENT_TASKS_FILE = 'current-tasks.json';

/** Result of worktree-aware branch scoping. */
export interface BranchScope {
  /** The branch to filter by, or undefined for all branches. */
  effectiveBranch: string | undefined;
  /** Human-readable label for output headers. */
  scopeLabel: string;
}

/**
 * Read-only reader for .keepgoing/ directory.
 * Does not write or create any files.
 */
export class KeepGoingReader {
  private readonly workspacePath: string;
  private readonly storagePath: string;
  private readonly metaFilePath: string;
  private readonly sessionsFilePath: string;
  private readonly decisionsFilePath: string;
  private readonly stateFilePath: string;
  private readonly currentTasksFilePath: string;
  private readonly _isWorktree: boolean;
  private _cachedBranch: string | undefined | null = null; // null = not yet resolved

  constructor(workspacePath: string) {
    this.workspacePath = workspacePath;
    const mainRoot = resolveStorageRoot(workspacePath);
    this._isWorktree = mainRoot !== workspacePath;
    this.storagePath = path.join(mainRoot, STORAGE_DIR);
    this.metaFilePath = path.join(this.storagePath, META_FILE);
    this.sessionsFilePath = path.join(this.storagePath, SESSIONS_FILE);
    this.decisionsFilePath = path.join(this.storagePath, DECISIONS_FILE);
    this.stateFilePath = path.join(this.storagePath, STATE_FILE);
    this.currentTasksFilePath = path.join(this.storagePath, CURRENT_TASKS_FILE);
  }

  /** Check if .keepgoing/ directory exists. */
  exists(): boolean {
    return fs.existsSync(this.storagePath);
  }

  /** Read state.json, returns undefined if missing or corrupt. */
  getState(): ProjectState | undefined {
    return this.readJsonFile<ProjectState>(this.stateFilePath);
  }

  /** Read meta.json, returns undefined if missing or corrupt. */
  getMeta(): ProjectMeta | undefined {
    return this.readJsonFile<ProjectMeta>(this.metaFilePath);
  }

  /**
   * Read sessions from sessions.json.
   * Handles both formats:
   * - Flat array: SessionCheckpoint[] (from ProjectStorage)
   * - Wrapper object: ProjectSessions (from SessionStorage)
   */
  getSessions(): SessionCheckpoint[] {
    return this.parseSessions().sessions;
  }

  /**
   * Get the most recent session checkpoint.
   * Uses state.lastSessionId if available, falls back to last in array.
   */
  getLastSession(): SessionCheckpoint | undefined {
    const { sessions, wrapperLastSessionId } = this.parseSessions();
    if (sessions.length === 0) {
      return undefined;
    }

    const state = this.getState();
    if (state?.lastSessionId) {
      const found = sessions.find((s) => s.id === state.lastSessionId);
      if (found) {
        return found;
      }
    }

    if (wrapperLastSessionId) {
      const found = sessions.find((s) => s.id === wrapperLastSessionId);
      if (found) {
        return found;
      }
    }

    return sessions[sessions.length - 1];
  }

  /**
   * Returns the last N sessions, newest first.
   */
  getRecentSessions(count: number): SessionCheckpoint[] {
    return getRecentSessions(this.getSessions(), count);
  }

  /** Read all decisions from decisions.json. */
  getDecisions(): DecisionRecord[] {
    return this.parseDecisions().decisions;
  }

  /** Returns the last N decisions, newest first. */
  getRecentDecisions(count: number): DecisionRecord[] {
    const all = this.getDecisions();
    return all.slice(-count).reverse();
  }

  /** Read the multi-license store from `~/.keepgoing/license.json`. */
  getLicenseStore(): LicenseStore {
    return readLicenseStore();
  }

  /**
   * Read all current tasks from current-tasks.json.
   * Automatically filters out stale finished sessions (> 2 hours).
   */
  getCurrentTasks(): CurrentTask[] {
    // Try multi-session file first
    const multiRaw = this.readJsonFile<CurrentTasks | CurrentTask[]>(this.currentTasksFilePath);
    if (multiRaw) {
      const tasks = Array.isArray(multiRaw) ? multiRaw : (multiRaw.tasks ?? []);
      return this.pruneStale(tasks);
    }

    return [];
  }

  /** Get only active sessions (sessionActive=true and within stale threshold). */
  getActiveTasks(): CurrentTask[] {
    return this.getCurrentTasks().filter(t => t.sessionActive);
  }

  /** Get a specific session by ID. */
  getTaskBySessionId(sessionId: string): CurrentTask | undefined {
    return this.getCurrentTasks().find(t => t.sessionId === sessionId);
  }

  /**
   * Detect files being edited by multiple sessions simultaneously.
   * Returns pairs of session IDs and the conflicting file paths.
   */
  detectFileConflicts(): Array<{ file: string; sessions: Array<{ sessionId: string; agentLabel?: string; branch?: string }> }> {
    const activeTasks = this.getActiveTasks();
    if (activeTasks.length < 2) return [];

    const fileToSessions = new Map<string, Array<{ sessionId: string; agentLabel?: string; branch?: string }>>();

    for (const task of activeTasks) {
      if (task.lastFileEdited && task.sessionId) {
        const existing = fileToSessions.get(task.lastFileEdited) ?? [];
        existing.push({
          sessionId: task.sessionId,
          agentLabel: task.agentLabel,
          branch: task.branch,
        });
        fileToSessions.set(task.lastFileEdited, existing);
      }
    }

    const conflicts: Array<{ file: string; sessions: Array<{ sessionId: string; agentLabel?: string; branch?: string }> }> = [];
    for (const [file, sessions] of fileToSessions) {
      if (sessions.length > 1) {
        conflicts.push({ file, sessions });
      }
    }
    return conflicts;
  }

  /**
   * Detect sessions on the same branch (possible duplicate work).
   */
  detectBranchOverlap(): Array<{ branch: string; sessions: Array<{ sessionId: string; agentLabel?: string }> }> {
    const activeTasks = this.getActiveTasks();
    if (activeTasks.length < 2) return [];

    const branchToSessions = new Map<string, Array<{ sessionId: string; agentLabel?: string }>>();

    for (const task of activeTasks) {
      if (task.branch && task.sessionId) {
        const existing = branchToSessions.get(task.branch) ?? [];
        existing.push({ sessionId: task.sessionId, agentLabel: task.agentLabel });
        branchToSessions.set(task.branch, existing);
      }
    }

    const overlaps: Array<{ branch: string; sessions: Array<{ sessionId: string; agentLabel?: string }> }> = [];
    for (const [branch, sessions] of branchToSessions) {
      if (sessions.length > 1) {
        overlaps.push({ branch, sessions });
      }
    }
    return overlaps;
  }

  private pruneStale(tasks: CurrentTask[]): CurrentTask[] {
    return pruneStaleTasks(tasks);
  }

  /** Get the last session checkpoint for a specific branch. */
  getLastSessionForBranch(branch: string): SessionCheckpoint | undefined {
    const sessions = this.getSessions().filter(s => s.gitBranch === branch);
    return sessions.length > 0 ? sessions[sessions.length - 1] : undefined;
  }

  /** Returns the last N sessions for a specific branch, newest first. */
  getRecentSessionsForBranch(branch: string, count: number): SessionCheckpoint[] {
    const filtered = this.getSessions().filter(s => s.gitBranch === branch);
    return filtered.slice(-count).reverse();
  }

  /** Returns the last N decisions for a specific branch, newest first. */
  getRecentDecisionsForBranch(branch: string, count: number): DecisionRecord[] {
    const filtered = this.getDecisions().filter(d => d.gitBranch === branch);
    return filtered.slice(-count).reverse();
  }

  /** Whether the workspace is inside a git worktree. */
  get isWorktree(): boolean {
    return this._isWorktree;
  }

  /**
   * Returns the current git branch for this workspace.
   * Lazily cached: the branch is resolved once per KeepGoingReader instance.
   */
  getCurrentBranch(): string | undefined {
    if (this._cachedBranch === null) {
      this._cachedBranch = getCurrentBranch(this.workspacePath);
    }
    return this._cachedBranch;
  }

  /**
   * Worktree-aware last session lookup.
   * In a worktree, scopes to the current branch with fallback to global.
   * Returns the session and whether it fell back to global.
   */
  getScopedLastSession(): { session: SessionCheckpoint | undefined; isFallback: boolean } {
    const branch = this.getCurrentBranch();
    if (this._isWorktree && branch) {
      const scoped = this.getLastSessionForBranch(branch);
      if (scoped) return { session: scoped, isFallback: false };
      return { session: this.getLastSession(), isFallback: true };
    }
    return { session: this.getLastSession(), isFallback: false };
  }

  /** Worktree-aware recent sessions. Scopes to current branch in a worktree. */
  getScopedRecentSessions(count: number): SessionCheckpoint[] {
    const branch = this.getCurrentBranch();
    if (this._isWorktree && branch) {
      return this.getRecentSessionsForBranch(branch, count);
    }
    return this.getRecentSessions(count);
  }

  /** Worktree-aware recent decisions. Scopes to current branch in a worktree. */
  getScopedRecentDecisions(count: number): DecisionRecord[] {
    const branch = this.getCurrentBranch();
    if (this._isWorktree && branch) {
      return this.getRecentDecisionsForBranch(branch, count);
    }
    return this.getRecentDecisions(count);
  }

  /**
   * Resolves branch scope from an explicit `branch` parameter.
   * Used by tools that accept a `branch` argument (e.g. get_session_history, get_decisions).
   * - `"all"` returns no filter.
   * - An explicit branch name uses that.
   * - `undefined` auto-scopes to the current branch in a worktree, or all branches otherwise.
   */
  resolveBranchScope(branch?: string): BranchScope {
    if (branch === 'all') {
      return { effectiveBranch: undefined, scopeLabel: 'all branches' };
    }
    if (branch) {
      return { effectiveBranch: branch, scopeLabel: `branch \`${branch}\`` };
    }
    const currentBranch = this.getCurrentBranch();
    if (this._isWorktree && currentBranch) {
      return { effectiveBranch: currentBranch, scopeLabel: `branch \`${currentBranch}\` (worktree)` };
    }
    return { effectiveBranch: undefined, scopeLabel: 'all branches' };
  }

  /**
   * Parses sessions.json once, returning both the session list
   * and the optional lastSessionId from a ProjectSessions wrapper.
   */
  private parseSessions(): { sessions: SessionCheckpoint[]; wrapperLastSessionId?: string } {
    const raw = this.readJsonFile<ProjectSessions | SessionCheckpoint[]>(
      this.sessionsFilePath,
    );
    if (!raw) {
      return { sessions: [] };
    }
    if (Array.isArray(raw)) {
      return { sessions: raw };
    }
    return { sessions: raw.sessions ?? [], wrapperLastSessionId: raw.lastSessionId };
  }

  private parseDecisions(): { decisions: DecisionRecord[]; lastDecisionId?: string } {
    const raw = this.readJsonFile<ProjectDecisions>(this.decisionsFilePath);
    if (!raw) {
      return { decisions: [] };
    }
    return { decisions: raw.decisions ?? [], lastDecisionId: raw.lastDecisionId };
  }

  private readJsonFile<T>(filePath: string): T | undefined {
    try {
      if (!fs.existsSync(filePath)) {
        return undefined;
      }
      const raw = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(raw) as T;
    } catch {
      return undefined;
    }
  }
}
