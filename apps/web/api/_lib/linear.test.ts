import { expect, it } from 'vitest'
import type { Task } from '../../shared/tasks.js'
import { groupTasks } from './linear.js'

it('keeps every open ticket so recently created work remains visible', () => {
  const make = (index: number, statusType: Task['statusType']): Task => ({
    id: String(index), identifier: `SAR-${index}`, title: `Ticket ${index}`,
    status: statusType, statusType, priority: 0, priorityLabel: 'None',
    url: `https://linear.app/sarjy/issue/SAR-${index}`,
  })
  const groups = groupTasks([
    ...[1, 2, 3, 4].map((index) => make(index, 'started')),
    ...[5, 6, 7, 8].map((index) => make(index, 'unstarted')),
  ])

  expect(groups.inProgress.map((task) => task.identifier)).toEqual(['SAR-1', 'SAR-2', 'SAR-3', 'SAR-4'])
  expect(groups.upcoming.map((task) => task.identifier)).toEqual(['SAR-5', 'SAR-6', 'SAR-7', 'SAR-8'])
})
