import { z } from 'zod';

const Coverage = z.enum(['unasked', 'captured', 'explicit_none', 'skipped']);
const SectionCoverage = z.object({
  review: Coverage,
  blockers: Coverage,
  today: Coverage,
});

const Entry = z.object({
  id: z.string(),
  text: z.string(),
  issueId: z.string().nullable(),
  issueIdentifier: z.string().nullable().optional(),
  dropped: z.boolean().optional(),
});

const SummaryLine = Entry.pick({ text: true, issueId: true, issueIdentifier: true });
const Summary = z.object({
  finishedAt: z.string(),
  progress: z.array(SummaryLine),
  blockers: z.array(SummaryLine),
  commitments: z.array(SummaryLine),
  coverage: SectionCoverage,
});

export const SnapshotSchema = z.object({
  standupId: z.string(),
  stage: z.enum(['review', 'blockers', 'today', 'confirm', 'finished']),
  revision: z.number().int().nonnegative(),
  doc: z.object({
    coverage: SectionCoverage,
    progress: z.array(Entry),
    blockers: z.array(Entry),
    commitments: z.array(Entry),
    unresolvedReferences: z.array(z.object({
      id: z.string(),
      phrase: z.string(),
      candidateIssueIds: z.array(z.string()),
      entryId: z.string().nullable(),
    })),
  }),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  summary: Summary.nullable(),
});

const ApiFailure = z.object({
  ok: z.literal(false),
  error: z.string(),
  message: z.string(),
  snapshot: SnapshotSchema.optional(),
});

const Task = z.object({
  id: z.string(),
  identifier: z.string(),
  title: z.string(),
  status: z.string(),
  statusType: z.string(),
  priority: z.number(),
  priorityLabel: z.string(),
  url: z.string(),
});

export const FactSchema = z.object({
  key: z.string(),
  value: z.string(),
  updated_at: z.string(),
});

const TasksResult = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    teamKey: z.string(),
    done: z.array(Task),
    inProgress: z.array(Task),
    upcoming: z.array(Task),
    statusNames: z.array(z.string()),
  }),
  ApiFailure,
]);

export const MemoryResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), facts: z.array(FactSchema) }),
  ApiFailure,
]);

const LastSummaryResult = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), summary: Summary.nullable() }),
  ApiFailure,
]);

const Action = z.object({
  id: z.string(),
  issueIdentifier: z.string(),
  issueTitle: z.string().optional(),
  issueId: z.string().optional(),
  issueUrl: z.string().optional(),
  kind: z.enum(['comment', 'status', 'create']),
  status: z.enum(['proposed', 'applying', 'succeeded', 'failed', 'uncertain', 'invalidated']),
  body: z.string().nullable(),
  toStateName: z.string().nullable(),
  result: z.string().nullable(),
});

const ActionsResult = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), actions: z.array(Action) }),
  ApiFailure,
]);

export const ContextResponseSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    snapshot: SnapshotSchema,
    tasks: TasksResult,
    memory: MemoryResultSchema,
    lastSummary: LastSummaryResult,
    actions: ActionsResult,
  }),
  ApiFailure,
]);

export const CommandResponseSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), snapshot: SnapshotSchema }),
  ApiFailure,
]);

export const SaveMemoryResponseSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), fact: FactSchema }),
  ApiFailure,
]);

export const ProposalResponseSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), action: z.object({
    id: z.string(),
    status: z.enum(['proposed', 'applying', 'succeeded', 'failed', 'uncertain', 'invalidated']),
    kind: z.enum(['comment', 'status', 'create']),
    issueIdentifier: z.string().optional(),
    issueTitle: z.string().optional(),
    issueId: z.string().optional(),
    issueUrl: z.string().optional(),
    body: z.string().nullable().optional(),
    toStateName: z.string().nullable().optional(),
  }) }),
  ApiFailure,
]);

export const BindingMetadataSchema = z.object({
  bindingToken: z.string().min(16),
  room: z.string().min(1),
  apiBase: z.string().optional(),
});

export type StandupContext = Extract<z.infer<typeof ContextResponseSchema>, { ok: true }>;
export type WorkflowSnapshot = z.infer<typeof SnapshotSchema>;
export type MemoryResult = z.infer<typeof MemoryResultSchema>;
export type SaveMemoryResponse = z.infer<typeof SaveMemoryResponseSchema>;
export type Failure = { ok: false; error: string; message: string };
