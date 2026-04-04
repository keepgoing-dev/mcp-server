import { z } from 'zod';
import { execFile } from 'node:child_process';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { KeepGoingReader } from '../storage.js';
import {
  gatherContinueOnContext,
  formatContinueOnPrompt,
} from '@keepgoingdev/shared';
import type { FormatOptions } from '@keepgoingdev/shared';

function copyToClipboard(text: string): Promise<boolean> {
  return new Promise((resolve) => {
    const platform = process.platform;
    let cmd: string;
    let args: string[];

    if (platform === 'darwin') {
      cmd = 'pbcopy';
      args = [];
    } else if (platform === 'linux') {
      // xclip is widely available on Linux desktops
      cmd = 'xclip';
      args = ['-selection', 'clipboard'];
    } else if (platform === 'win32') {
      cmd = 'clip';
      args = [];
    } else {
      resolve(false);
      return;
    }

    const child = execFile(cmd, args, (err) => {
      resolve(!err);
    });
    child.stdin?.write(text);
    child.stdin?.end();
  });
}

export function registerContinueOn(server: McpServer, reader: KeepGoingReader, workspacePath: string) {
  server.tool(
    'continue_on',
    'Export KeepGoing context as a formatted prompt for use in another AI tool (ChatGPT, Gemini, Copilot, etc.). Returns a markdown prompt with project status, last session, decisions, and recent commits.',
    {
      target: z.enum(['chatgpt', 'gemini', 'copilot', 'claude', 'general']).optional()
        .describe('Target AI tool (currently used for future format tuning)'),
      include_commits: z.boolean().default(true)
        .describe('Include recent commit messages in the prompt'),
      include_files: z.boolean().default(true)
        .describe('Include touched file paths in the prompt'),
    },
    async ({ target, include_commits, include_files }) => {
      if (!reader.exists()) {
        return {
          content: [{
            type: 'text' as const,
            text: 'No KeepGoing data found. Save a checkpoint first to use Continue On.',
          }],
        };
      }

      const context = gatherContinueOnContext(reader, workspacePath);

      if (!context.lastCheckpoint && !context.briefing) {
        return {
          content: [{
            type: 'text' as const,
            text: 'No session data available. Save a checkpoint first.',
          }],
        };
      }

      const formatOpts: FormatOptions = {
        target: target as FormatOptions['target'],
        includeCommits: include_commits,
        includeFiles: include_files,
      };

      const prompt = formatContinueOnPrompt(context, formatOpts);

      const copied = await copyToClipboard(prompt);

      return {
        content: [
          { type: 'text' as const, text: prompt },
          {
            type: 'text' as const,
            text: copied
              ? '\n---\nPrompt copied to clipboard. Paste it into your target AI tool.'
              : '\n---\nCould not copy to clipboard automatically. Use /copy to copy the prompt above.',
          },
        ],
      };
    },
  );
}
