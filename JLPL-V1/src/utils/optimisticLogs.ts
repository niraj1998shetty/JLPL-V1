import { JiraTask, JiraTimeEntry } from '../types/jira'

// Mirrors a just-submitted batch of worklogs onto in-memory tasks, so the info
// popover's Total logged / Remaining / Updated reflect it immediately instead of
// only after a full page reload refetches the tasks from Jira.
//
// - Total logged is Jira's aggregate (task + subtasks), so a task gains its own
//   hours plus those of every descendant we know about.
// - Remaining is the task's own estimate, which Jira's default worklog adjustment
//   reduces by the time logged on that task (never below zero).
export function applyLoggedHours(tasks: JiraTask[], entries: JiraTimeEntry[]): JiraTask[] {
  const hoursById: Record<string, number> = {}
  for (const e of entries) hoursById[e.taskId] = (hoursById[e.taskId] ?? 0) + e.hours
  const now = new Date().toISOString()

  function bump(t: JiraTask): JiraTask {
    const bumpedSubs = t.subtasks?.map(bump)
    const ownAdd = hoursById[t.id] ?? 0

    // De-duped across subtasks[] and subtaskKeys[] (keys are known before subtasks load).
    const descendantIds = new Set<string>([...(t.subtasks ?? []).map((s) => s.id), ...(t.subtaskKeys ?? [])])
    let aggregateAdd = ownAdd
    for (const id of descendantIds) aggregateAdd += hoursById[id] ?? 0

    if (aggregateAdd === 0 && bumpedSubs === t.subtasks) return t
    return {
      ...t,
      totalLoggedHours: (t.totalLoggedHours ?? 0) + aggregateAdd,
      remainingHours:
        ownAdd > 0 && t.remainingHours !== undefined
          ? Math.max(0, t.remainingHours - ownAdd)
          : t.remainingHours,
      updatedAt: aggregateAdd > 0 ? now : t.updatedAt,
      subtasks: bumpedSubs,
    }
  }

  return tasks.map(bump)
}
