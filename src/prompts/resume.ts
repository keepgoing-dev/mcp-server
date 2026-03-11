import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerResumePrompt(server: McpServer) {
  server.prompt(
    'resume',
    'Check developer momentum and suggest what to work on next',
    async () => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: [
              'I just opened this project and want to pick up where I left off.',
              '',
              'Please use the KeepGoing tools to:',
              '1. Check my current momentum (get_momentum)',
              '2. Get a re-entry briefing (get_reentry_briefing)',
              '3. Based on the results, give me a concise summary of where I left off and suggest what to work on next.',
              '',
              'Keep your response brief and actionable.',
            ].join('\n'),
          },
        },
      ],
    }),
  );
}
