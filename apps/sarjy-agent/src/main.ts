import { ServerOptions, cli, defineAgent, inference, voice } from '@livekit/agents';
import { audioEnhancement } from '@livekit/plugins-ai-coustics';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { createInitializedAgent, initialReplyInstructions } from './agent.ts';
import { bindingFromMetadata, WorkflowClient } from './workflow.ts';

dotenv.config({ path: '.env.local' });

export default defineAgent({
  entry: async (ctx) => {
    const binding = bindingFromMetadata(ctx.job.metadata, process.env.SARJY_API_URL);
    const client = new WorkflowClient(binding);
    const session = new voice.AgentSession({
      stt: new inference.STT({
        model: 'assemblyai/universal-3-5-pro',
        language: 'en',
      }),

      tts: new inference.TTS({
        model: 'fishaudio/s2.1-pro',
        voice: 'fa4c9eb3dccc4806b382b40d61c6b10a',
      }),

      turnHandling: {
        // https://docs.livekit.io/agents/logic/turns/turn-detector/
        turnDetection: new inference.TurnDetector(),
        endpointing: { minDelay: 400, maxDelay: 2500 },
        // keeps talking through "mhm" / "right"
        interruption: { mode: 'adaptive' },
        preemptiveGeneration: { enabled: true },
      },

      // needs a TTS that supports markup (fish audio does)
      expressive: true,
    });

    await session.start({
      agent: await createInitializedAgent(client),
      room: ctx.room,
      inputOptions: {
        noiseCancellation: audioEnhancement({ model: 'quailVfS' }),
      },
    });

    await ctx.connect();

    session.generateReply({
      instructions: initialReplyInstructions(),
    });
  },
});

cli.runApp(
  new ServerOptions({
    agent: fileURLToPath(import.meta.url),
    agentName: process.env.SARJY_AGENT_NAME || (process.argv.includes('dev') ? 'sarjy-agent-local' : 'sarjy-agent'),
  }),
);
