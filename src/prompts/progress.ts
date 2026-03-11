import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerProgressPrompt(server: McpServer) {
  server.prompt(
    'progress',
    'Summarize recent development progress across sessions',
    async () => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: [
              'I need a summary of recent development progress for this project.',
              '',
              'Please use the KeepGoing tools to:',
              '1. Fetch session history with a higher limit for broader coverage (get_session_history, limit: 20)',
              '2. Get my current branch context (get_momentum)',
              '3. Synthesize a progress summary grouped by branch or feature, highlighting the current branch',
              '',
              'Format the summary so it can be used in a standup or sprint review.',
            ].join('\n'),
          },
        },
      ],
    }),
  );
}
