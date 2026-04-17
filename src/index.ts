#!/usr/bin/env node

import { execSync, spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { findGitRoot, GlobalDatabase } from '@keepgoingdev/shared';
import { KeepGoingReader } from './storage.js';
import { registerGetMomentum } from './tools/getMomentum.js';
import { registerGetSessionHistory } from './tools/getSessionHistory.js';
import { registerGetReentryBriefing } from './tools/getReentryBriefing.js';
import { registerSaveCheckpoint } from './tools/saveCheckpoint.js';
import { registerGetDecisions } from './tools/getDecisions.js';
import { registerGetCurrentTask } from './tools/getCurrentTask.js';
import { registerSetupProject } from './tools/setupProject.js';
import { registerActivateLicense } from './tools/activateLicense.js';
import { registerDeactivateLicense } from './tools/deactivateLicense.js';
import { registerContinueOn } from './tools/continueOn.js';
import { registerGetContextSnapshot } from './tools/getContextSnapshot.js';
import { registerGetWhatsHot } from './tools/getWhatsHot.js';
import { registerResumePrompt } from './prompts/resume.js';
import { registerDecisionsPrompt } from './prompts/decisions.js';
import { registerProgressPrompt } from './prompts/progress.js';
import { handlePrintMomentum, handlePrintCurrent } from './cli/print.js';
import { handleSaveCheckpoint } from './cli/saveCheckpoint.js';
import { handleUpdateTask, handleUpdateTaskFromHook } from './cli/updateTask.js';
import { handleStatusline } from './cli/statusline.js';
import { handleContinueOn } from './cli/continueOn.js';
import { handleDetectDecisions } from './cli/detectDecisions.js';
import { handleHeartbeat } from './cli/heartbeat.js';

function keepgoingCliAvailable(): boolean {
  try {
    execSync('which keepgoing', { stdio: 'pipe', timeout: 2000 });
    return true;
  } catch {
    return false;
  }
}

const CLI_DEPRECATION_MAP: Record<string, string> = {
  '--print-momentum': 'keepgoing momentum --hook',
  '--save-checkpoint': 'keepgoing save --hook',
  '--update-task': 'keepgoing task-update --hook',
  '--update-task-from-hook': 'keepgoing task-update --hook',
  '--print-current': 'keepgoing task-update --hook',
  '--statusline': 'keepgoing statusline',
  '--continue-on': 'keepgoing continue',
  '--detect-decisions': 'keepgoing save --hook',
  '--heartbeat': 'keepgoing heartbeat --hook',
};

// Legacy CLI flag dispatch table - kept for backward compat
const CLI_HANDLERS: Record<string, () => Promise<void>> = {
  '--print-momentum': handlePrintMomentum,
  '--save-checkpoint': handleSaveCheckpoint,
  '--update-task': handleUpdateTask,
  '--update-task-from-hook': handleUpdateTaskFromHook,
  '--print-current': handlePrintCurrent,
  '--statusline': handleStatusline,
  '--continue-on': handleContinueOn,
  '--detect-decisions': handleDetectDecisions,
  '--heartbeat': handleHeartbeat,
};

const flag = process.argv.slice(2).find(a => a in CLI_HANDLERS);
if (flag) {
  const newCmd = CLI_DEPRECATION_MAP[flag];
  if (newCmd && keepgoingCliAvailable()) {
    // Delegate to keepgoing CLI
    console.error(`[KeepGoing] Note: Use "${newCmd}" instead of "npx @keepgoingdev/mcp-server ${flag}"`);
    const parts = newCmd.split(' ');
    const child = spawn(parts[0], parts.slice(1), { stdio: 'inherit' });
    child.on('close', (code) => process.exit(code ?? 0));
    child.on('error', async () => {
      // Fall back to legacy handler
      await CLI_HANDLERS[flag]();
    });
  } else {
    // No keepgoing CLI available, run legacy handler
    await CLI_HANDLERS[flag]();
  }
} else {
  // Default: start MCP server
  // Workspace path can be passed as an argument, otherwise defaults to CWD.
  // MCP hosts (Claude Code, etc.) typically launch the server with the project root as CWD.
  const workspacePath = findGitRoot(process.argv[2] || process.cwd());
  const reader = new KeepGoingReader(workspacePath);

  // Initialize GlobalDatabase in read-only mode (non-fatal if unavailable)
  try {
    await GlobalDatabase.init();
    const globalDir = path.join(os.homedir(), '.keepgoing');
    const dbPath = path.join(globalDir, 'keepgoing-global.db');
    if (fs.existsSync(dbPath)) {
      GlobalDatabase.open(globalDir, { readOnly: true });
    }
  } catch {
    // Non-fatal: MCP server works without global DB
  }

  const server = new McpServer({
    name: 'keepgoing',
    version: '0.1.0',
  });

  // Register tools
  registerGetMomentum(server, reader, workspacePath);
  registerGetSessionHistory(server, reader);
  registerGetReentryBriefing(server, reader, workspacePath);
  registerGetDecisions(server, reader);
  registerGetCurrentTask(server, reader);
  registerSaveCheckpoint(server, reader, workspacePath);
  registerContinueOn(server, reader, workspacePath);
  registerGetContextSnapshot(server, reader, workspacePath);
  registerGetWhatsHot(server);
  registerSetupProject(server, workspacePath);
  registerActivateLicense(server);
  registerDeactivateLicense(server);

  // Register prompts
  registerResumePrompt(server);
  registerDecisionsPrompt(server);
  registerProgressPrompt(server);

  // Connect via stdio
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('KeepGoing MCP server started');
}
