import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerDecisionsPrompt(server: McpServer) {
  server.prompt(
    'decisions',
    'Review recent architectural decisions and their rationale',
    async () => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: [
              'I want to review recent architectural decisions in this project.',
              '',
              'Please use the KeepGoing tools to:',
              '1. Fetch recent decision records (get_decisions)',
              '2. Get my current branch context (get_momentum)',
              '3. Summarize the decisions, highlighting any that were made on the current branch',
              '',
              'Keep your response brief and organized.',
            ].join('\n'),
          },
        },
      ],
    }),
  );
}
