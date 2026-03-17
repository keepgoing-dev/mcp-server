#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { findGitRoot } from '@keepgoingdev/shared';
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
import { registerResumePrompt } from './prompts/resume.js';
import { registerDecisionsPrompt } from './prompts/decisions.js';
import { registerProgressPrompt } from './prompts/progress.js';
import { handlePrintMomentum, handlePrintCurrent } from './cli/print.js';
import { handleSaveCheckpoint } from './cli/saveCheckpoint.js';
import { handleUpdateTask, handleUpdateTaskFromHook } from './cli/updateTask.js';
import { handleStatusline } from './cli/statusline.js';
import { handleContinueOn } from './cli/continueOn.js';

// CLI flag dispatch table. Each handler calls process.exit() when done.
const CLI_HANDLERS: Record<string, () => Promise<void>> = {
  '--print-momentum': handlePrintMomentum,
  '--save-checkpoint': handleSaveCheckpoint,
  '--update-task': handleUpdateTask,
  '--update-task-from-hook': handleUpdateTaskFromHook,
  '--print-current': handlePrintCurrent,
  '--statusline': handleStatusline,
  '--continue-on': handleContinueOn,
};

const flag = process.argv.slice(2).find(a => a in CLI_HANDLERS);
if (flag) {
  await CLI_HANDLERS[flag]();
} else {
  // Default: start MCP server
  // Workspace path can be passed as an argument, otherwise defaults to CWD.
  // MCP hosts (Claude Code, etc.) typically launch the server with the project root as CWD.
  const workspacePath = findGitRoot(process.argv[2] || process.cwd());
  const reader = new KeepGoingReader(workspacePath);

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
