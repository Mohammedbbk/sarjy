export type ActionStatus = 'proposed' | 'applying' | 'succeeded' | 'failed' | 'uncertain' | 'invalidated'

export type LinearAction = {
  id: string
  standupId: string
  entryId: string
  sourceText: string
  issueId: string
  teamId?: string | null
  issueIdentifier: string
  issueTitle: string
  issueUrl: string
  kind: 'comment' | 'status' | 'create'
  body: string | null
  fromStateId: string | null
  fromStateName: string | null
  toStateId: string | null
  toStateName: string | null
  status: ActionStatus
  result: string | null
  createdAt: string
  updatedAt: string
}

export type ProposalInput = { actionId: string; entryId: string } & (
  | { kind: 'create'; title: string; body: string; issueId?: never; targetStatus?: never }
  | { kind: 'comment'; issueId: string; body: string; targetStatus?: never }
  | { kind: 'status'; issueId: string; targetStatus: string; body?: never }
)
