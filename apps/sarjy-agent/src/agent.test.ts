import { expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { StandupContext, WorkflowClient } from './workflow.ts';

const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('@livekit/agents', () => ({
  Agent: { create },
  dedent: (strings: TemplateStringsArray) => strings.join(''),
  inference: { LLM: class {} },
  llm: { ChatContext: class { addMessage() {} } },
  tool: (definition: unknown) => definition,
}));
import { createAgent, initialReplyInstructions } from './agent.ts';

it('exposes a bounded new-ticket proposal tool that forwards to the approval service', async () => {
  const propose = vi.fn().mockResolvedValue({ ok: true, action: { status: 'proposed' } });
  const client = { propose } as unknown as WorkflowClient;
  createAgent(client, {} as StandupContext);
  const config = create.mock.calls.at(-1)![0] as {
    tools: { name: string; parameters: z.ZodType; execute: (input: unknown) => Promise<unknown> }[];
  };
  const tool = config.tools.find((item) => item.name === 'propose_new_ticket')!;
  const request = { entryId: 'saved-entry', title: 'Magic link registration', body: 'Register and log in using a magic link.' };
  expect(tool.parameters.safeParse({ ...request, title: ' ' }).success).toBe(false);
  expect(tool.parameters.safeParse({ ...request, title: 'x'.repeat(201) }).success).toBe(false);
  expect(await tool.execute(tool.parameters.parse(request))).toMatchObject({ ok: true, action: { status: 'proposed' } });
  expect(propose).toHaveBeenCalledExactlyOnceWith({ ...request, kind: 'create' });
});

it('requires fresh saved state for progress questions and a recap', () => {
  createAgent({} as WorkflowClient, {} as StandupContext);
  const config = create.mock.calls.at(-1)![0] as {
    instructions: string;
    tools: { name: string; description: string }[];
  };
  expect(config.instructions).toMatch(/refresh.*(progress list|saved entries)/i);
  expect(config.instructions).toMatch(/Refresh with get_standup_context before\s+the final recap/i);
  expect(config.tools.find((item) => item.name === 'get_standup_context')?.description)
    .toMatch(/latest saved progress/i);
});

it('saves an explicit greeting preference and begins with a neutral US greeting', () => {
  createAgent({} as WorkflowClient, {} as StandupContext);
  const config = create.mock.calls.at(-1)![0] as { instructions: string };
  expect(config.instructions).toMatch(/remember_fact.*greeting_style/i);
  expect(initialReplyInstructions()).toContain('Hi');
  expect(initialReplyInstructions()).toMatch(/saved greeting preference/i);
});
