export type ActionStatus = 'proposed' | 'applying' | 'succeeded' | 'failed' | 'uncertain' | 'invalidated'

export type LinearAction = {
  id: string
  standupId: string
  entryId: string
  sourceText: string
  issueId: string
  issueIdentifier: string
  issueTitle: string
  issueUrl: string
  kind: 'comment' | 'status'
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

export type ProposalInput = {
  actionId: string
  entryId: string
  issueId: string
  kind: 'comment' | 'status'
  body?: string
  targetStatus?: string
}
