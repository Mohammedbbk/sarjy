import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  BindingMetadataSchema,
  CommandResponseSchema,
  ContextResponseSchema,
  MemoryResultSchema,
  ProposalResponseSchema,
  SaveMemoryResponseSchema,
  type Failure,
  type MemoryResult,
  type SaveMemoryResponse,
  type StandupContext,
  type WorkflowSnapshot,
} from './api-schemas.ts';

export type { StandupContext, WorkflowSnapshot } from './api-schemas.ts';
export type Binding = { apiBase: string; room: string; token: string };

type Endpoint = '/api/agent' | '/api/memory' | '/api/agent-actions';
type ReadResult<T> = { ok: true; body: T; httpOk: boolean } | {
  ok: false;
  kind: 'transport' | 'invalid_response';
};

const fail = (error: string, message: string): Failure => ({ ok: false, error, message });

export class WorkflowClient {
  private snapshot?: WorkflowSnapshot;
  private readonly binding: Binding;
  private commandQueue: Promise<void> = Promise.resolve();

  constructor(binding: Binding) {
    this.binding = binding;
  }

  /** Attach the room binding and validate every JSON response in one place. */
  private async request<T>(
    path: Endpoint,
    schema: z.ZodType<T>,
    init: { method?: 'POST'; body?: string } = {},
  ): Promise<ReadResult<T>> {
    let url: URL;
    try {
      url = new URL(path, this.binding.apiBase);
    } catch {
      return { ok: false, kind: 'transport' };
    }
    if (
      url.protocol !== 'https:' &&
      !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
    ) {
      return { ok: false, kind: 'transport' };
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method: init.method ?? 'GET',
        headers: {
          Authorization: `Bearer ${this.binding.token}`,
          'X-Sarjy-Room': this.binding.room,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        ...(init.body ? { body: init.body } : {}),
        signal: AbortSignal.timeout(10_000),
        redirect: 'error',
      });
    } catch {
      return { ok: false, kind: 'transport' };
    }

    try {
      const parsed = schema.safeParse(await response.json());
      return parsed.success
        ? { ok: true, body: parsed.data, httpOk: response.ok }
        : { ok: false, kind: 'invalid_response' };
    } catch {
      return { ok: false, kind: 'invalid_response' };
    }
  }

  async context(): Promise<StandupContext | Failure> {
    // Serialize reads with saves so neither can replace a newer snapshot.
    const result = this.commandQueue.then(() => this.fetchContext());
    this.commandQueue = result.then(() => undefined, () => undefined);
    return result;
  }

  private async fetchContext(): Promise<StandupContext | Failure> {
    const response = await this.request('/api/agent', ContextResponseSchema);
    if (!response.ok) {
      return fail(response.kind, 'The stand-up context is unavailable.');
    }
    if (!response.httpOk || !response.body.ok) {
      return response.body.ok
        ? fail('invalid_response', 'The stand-up context is unavailable.')
        : response.body;
    }
    this.snapshot = response.body.snapshot;
    return response.body;
  }

  command(command: Record<string, unknown>): Promise<{ ok: true; snapshot: WorkflowSnapshot } | Failure> {
    const result = this.commandQueue.then(() => this.sendCommand(command));
    this.commandQueue = result.then(() => undefined, () => undefined);
    return result;
  }

  private async sendCommand(command: Record<string, unknown>): Promise<{ ok: true; snapshot: WorkflowSnapshot } | Failure> {
    if (!this.snapshot) {
      const loaded = await this.fetchContext();
      if (!loaded.ok) return loaded;
    }

    // A retry is the same logical command: keep both its revision and request ID.
    const body = JSON.stringify({
      expectedRevision: this.snapshot!.revision,
      requestId: randomUUID(),
      command,
    });

    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await this.request('/api/agent', CommandResponseSchema, {
        method: 'POST',
        body,
      });
      if (!response.ok) {
        if (response.kind === 'transport' && attempt === 0) continue;
        return response.kind === 'transport'
          ? fail('outcome_unknown', 'Could not confirm whether the update was saved. Refresh the stand-up before trying again.')
          : fail('outcome_unknown', 'The update may have been saved, but the response was invalid. Refresh the stand-up before trying again.');
      }

      if (response.body.snapshot) this.snapshot = response.body.snapshot;
      if (response.httpOk && response.body.ok) return response.body;
      if (!response.body.ok) return response.body;
      return fail('invalid_response', 'The stand-up server returned an unexpected response.');
    }

    return fail('outcome_unknown', 'Could not confirm whether the update was saved.');
  }

  async memory(): Promise<MemoryResult | Failure> {
    const response = await this.request('/api/memory', MemoryResultSchema);
    if (!response.ok) return fail(response.kind, 'Memory could not be read.');
    if (!response.httpOk || !response.body.ok) {
      return response.body.ok
        ? fail('invalid_response', 'Memory could not be read.')
        : response.body;
    }
    return response.body;
  }

  async remember(key: string, value: string): Promise<SaveMemoryResponse | Failure> {
    const response = await this.request('/api/memory', SaveMemoryResponseSchema, {
      method: 'POST',
      body: JSON.stringify({ key, value }),
    });
    if (!response.ok) {
      return fail('outcome_unknown', 'Could not confirm whether the fact was saved. Read memory before trying again.');
    }
    if (!response.httpOk || !response.body.ok) {
      return response.body.ok
        ? fail('outcome_unknown', 'Could not confirm whether the fact was saved. Read memory before trying again.')
        : response.body;
    }
    return response.body;
  }

  async propose(input: {
    entryId: string; issueId?: string; kind: 'comment' | 'status' | 'create'; title?: string; body?: string | undefined; targetStatus?: string | undefined;
  }): Promise<z.infer<typeof ProposalResponseSchema> | Failure> {
    await this.commandQueue;
    const body = JSON.stringify({ ...input, actionId: randomUUID() });
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await this.request('/api/agent-actions', ProposalResponseSchema, { method: 'POST', body });
      if (!response.ok) {
        if (response.kind === 'transport' && attempt === 0) continue;
        return fail('outcome_unknown', 'Could not confirm whether the proposal was saved. Check the review cards.');
      }
      if (response.httpOk && response.body.ok) return response.body;
      return response.body.ok
        ? fail('invalid_response', 'The proposal server returned an unexpected response.')
        : response.body;
    }
    return fail('outcome_unknown', 'Could not confirm whether the proposal was saved.');
  }
}

export function bindingFromMetadata(metadata: string | undefined, fallbackApiBase: string | undefined): Binding {
  const parsed: unknown = JSON.parse(metadata || '{}');
  const result = BindingMetadataSchema.parse(parsed);
  const apiBase = result.apiBase || fallbackApiBase;
  if (!apiBase) throw new Error('No Sarjy API URL was supplied to this voice job.');
  return { apiBase, room: result.room, token: result.bindingToken };
}
