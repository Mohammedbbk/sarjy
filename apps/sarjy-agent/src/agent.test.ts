import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchStandupTasks = vi.hoisted(() => vi.fn());
vi.mock('./tasks.ts', () => ({ fetchStandupTasks }));

const { getTasksTool } = await import('./agent.ts');

/** Invoke the tool the way the agent runtime does: with no arguments. */
function runTool() {
  const executable = getTasksTool as unknown as {
    execute: (args: Record<string, never>) => Promise<Record<string, unknown>>;
  };
  return executable.execute({});
}

describe('get_tasks tool', () => {
  beforeEach(() => {
    fetchStandupTasks.mockReset();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('returns a structured success result tagged source "linear"', async () => {
    const tasks = [
      {
        id: '9f1c2d3e-0000-4000-8000-aaaaaaaaaaaa',
        identifier: 'ENG-482',
        title: 'KYC onboarding validation',
        status: 'In Progress',
        statusType: 'started',
        priority: 2,
        priorityLabel: 'High',
        url: 'https://linear.app/acme/issue/ENG-482',
      },
    ];
    fetchStandupTasks.mockResolvedValue({
      ok: true,
      teamKey: 'ENG',
      teamName: 'Engineering',
      tasks,
      hasMore: true,
    });

    await expect(runTool()).resolves.toEqual({
      ok: true,
      source: 'linear',
      teamKey: 'ENG',
      count: 1,
      hasMore: true,
      tasks,
    });
  });

  it('reports an empty list as a successful lookup with no tasks', async () => {
    fetchStandupTasks.mockResolvedValue({
      ok: true,
      teamKey: 'ENG',
      teamName: 'Engineering',
      tasks: [],
      hasMore: false,
    });

    await expect(runTool()).resolves.toMatchObject({
      ok: true,
      source: 'linear',
      count: 0,
      hasMore: false,
      tasks: [],
    });
  });

  it('returns a failure result with no source and no fictional tasks', async () => {
    fetchStandupTasks.mockResolvedValue({
      ok: false,
      error: 'unauthorized',
      message: 'Linear rejected the API key.',
    });

    const result = await runTool();

    expect(result).toEqual({
      ok: false,
      error: 'unauthorized',
      message: 'Linear rejected the API key.',
    });
    // A failed lookup must be distinguishable from an empty one.
    expect(result['source']).toBeUndefined();
    expect(result['tasks']).toBeUndefined();
  });

  it('logs the error code without the message that quotes configuration', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchStandupTasks.mockResolvedValue({
      ok: false,
      error: 'team_not_found',
      message: 'LINEAR_TEAM_KEY is set to "Engineering", which is not a team key.',
    });

    await runTool();

    const logged = errorSpy.mock.calls.flat().join(' ');
    expect(logged).toContain('team_not_found');
    expect(logged).not.toContain('Engineering');
  });

  it('takes no parameters', () => {
    const { parameters } = getTasksTool as unknown as { parameters: { shape: object } };
    expect(Object.keys(parameters.shape)).toEqual([]);
  });
});

// Agent behavior is covered by the simulations in scenarios.yaml, which run full
// conversations against the agent on LiveKit Cloud (see README.md). The eval
// below is kept as an example of the in-process testing framework
// (https://docs.livekit.io/agents/start/testing/) for turn-level checks that
// don't need a live session. Uncomment it and run `pnpm test` to use it.
//
// import { dedent, inference, initializeLogger, voice } from '@livekit/agents';
// import dotenv from 'dotenv';
// import { afterEach, beforeEach, describe, it } from 'vitest';
// import { createAgent } from './agent.ts';
//
// dotenv.config({ path: '.env.local' });
//
// // Initialize logger for testing.
// // You may wish to adjust the log level to print more or less information during test runs.
// initializeLogger({ pretty: true, level: 'warn' });
//
// describe('agent evaluation', () => {
//   let session: voice.AgentSession;
//   let judgeLlm: inference.LLM;
//
//   beforeEach(async () => {
//     judgeLlm = new inference.LLM({ model: 'openai/gpt-4.1-mini' });
//     session = new voice.AgentSession();
//     await session.start({ agent: createAgent() });
//   });
//
//   afterEach(async () => {
//     await session?.close();
//     await judgeLlm?.aclose();
//   });
//
//   /** Evaluation of the agent's friendly nature. */
//   it('offers assistance', { timeout: 30000 }, async () => {
//     // Run an agent turn following the user's greeting
//     const result = await session.run({ userInput: 'Hello' }).wait();
//
//     // Evaluate the agent's response for friendliness
//     await result.expect
//       .nextEvent()
//       .isMessage({ role: 'assistant' })
//       .judge(judgeLlm, {
//         intent: dedent`
//           Greets the user in a friendly manner.
//
//           Optional context that may or may not be included:
//           - Offer of assistance with any request the user may have
//           - Other small talk or chit chat is acceptable, so long as it is friendly and not too intrusive
//         `,
//       });
//
//     // Assert that there are no unexpected further events
//     result.expect.noMoreEvents();
//   });
// });
