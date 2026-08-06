import { JiraTask } from '../types/jira'
import { DuplicateMap } from './duplicateRows'

export function taskMatchesSearch(task: JiraTask, searchQuery: string): boolean {
  if (!searchQuery.trim()) return true
  const q = searchQuery.toLowerCase()
  return task.id.toLowerCase().includes(q) || (task.summary ?? '').toLowerCase().includes(q)
}

// DFO/DMO tasks are interleaved by the server's `ORDER BY updated DESC` JQL.
// Group by project prefix (DFO before DMO, everything else after) while
// keeping the relative recency order within each group intact.
const PROJECT_ORDER = ['DFO', 'DMO']

function projectRank(id: string): number {
  const prefix = id.match(/^([A-Z]+)-/)?.[1] ?? ''
  const idx = PROJECT_ORDER.indexOf(prefix)
  return idx === -1 ? PROJECT_ORDER.length : idx
}

function sortByProjectGroup(tasks: JiraTask[]): JiraTask[] {
  return [...tasks].sort((a, b) => projectRank(a.id) - projectRank(b.id))
}

export function collectKnownTaskIds(tasks: JiraTask[]): Set<string> {
  const ids = new Set<string>()
  for (const t of tasks) {
    ids.add(t.id)
    for (const k of t.subtaskKeys ?? []) ids.add(k)
    for (const s of t.subtasks ?? []) ids.add(s.id)
  }
  return ids
}

interface GroupTasksInput {
  /** The user's common + assigned tasks (unfiltered by default/isDefault). */
  tasks: JiraTask[]
  /** Tasks the user manually added via "Log for other task". */
  otherTasks: JiraTask[]
  /**
   * Tasks logged (on the relevant date, or across a range) that are already
   * fully structured (test badge, expandable subtasks, estimates) — e.g. the
   * day view's `loggedTasks` fetch. Omit when no such structured fetch exists
   * (the week view has no per-range equivalent); those tasks still surface via
   * `loggedTaskIds` as bare fallback rows.
   */
  structuredLoggedTasks?: JiraTask[]
  /** Every task id that has logged hours somewhere relevant, even if not in `tasks`. */
  loggedTaskIds: Set<string>
  /** taskId -> summary, used to render fallback bare rows for ids not otherwise known. */
  loggedTaskSummaries: Record<string, string>
  searchQuery?: string
}

export interface GroupedTasks {
  commonTasks: JiraTask[]
  assignedTasks: JiraTask[]
  /** Manually-added tasks plus any logged task not in common/assigned/otherTasks. */
  otherSectionTasks: JiraTask[]
  knownTaskIds: Set<string>
}

// Splits the user's tasks into Common/Assigned/Other sections, the same way the
// day view always has: Common = isDefault, Assigned = the rest, and Other =
// manually-added tasks plus any task logged against that isn't in either list
// (so hours never go invisible even for old/foreign tasks). Shared by the day
// and week views so both present an identical hierarchy.
export function groupTasks({
  tasks,
  otherTasks,
  structuredLoggedTasks = [],
  loggedTaskIds,
  loggedTaskSummaries,
  searchQuery = '',
}: GroupTasksInput): GroupedTasks {
  const matches = (t: JiraTask) => taskMatchesSearch(t, searchQuery)

  const commonTasks = sortByProjectGroup(tasks.filter((t) => t.isDefault && matches(t)))
  const assignedTasks = sortByProjectGroup(tasks.filter((t) => !t.isDefault && matches(t)))

  const knownTaskIds = collectKnownTaskIds(tasks)

  const structuredExtra = structuredLoggedTasks.filter((t) => !knownTaskIds.has(t.id))

  const coveredIds = new Set(knownTaskIds)
  for (const t of structuredExtra) {
    coveredIds.add(t.id)
    for (const k of t.subtaskKeys ?? []) coveredIds.add(k)
    for (const s of t.subtasks ?? []) coveredIds.add(s.id)
  }

  const fallbackExtra: JiraTask[] = [...loggedTaskIds]
    .filter((id) => !coveredIds.has(id))
    .map((id) => ({
      id,
      summary: loggedTaskSummaries[id] ?? '',
      isDefault: false,
      isExpandable: false,
    }))

  const extraLoggedTasks: JiraTask[] = [...structuredExtra, ...fallbackExtra]

  const manualOtherTasks = otherTasks.filter((t) => !knownTaskIds.has(t.id) && matches(t))
  const manualOtherIds = new Set(manualOtherTasks.map((t) => t.id))
  const otherSectionTasks: JiraTask[] = sortByProjectGroup([
    ...manualOtherTasks,
    ...extraLoggedTasks.filter((t) => !manualOtherIds.has(t.id) && matches(t)),
  ])

  return { commonTasks, assignedTasks, otherSectionTasks, knownTaskIds }
}

export interface FlatTaskRow {
  task: JiraTask
  depth: number
  isSubtask: boolean
  /** Key this row's hours/comment live under. Equals `task.id` for primary rows. */
  rowKey: string
  /** A second (third, …) entry for the same task: own hours/comment, never expandable. */
  isDuplicate: boolean
}

// Walks a top-level task list respecting expand/collapse state, returning one
// row per visible task/subtask — used by the week grid to render the left-hand
// task column in the same order/hierarchy as the day view's TaskSection.
export function flattenVisibleRows(
  tasks: JiraTask[],
  expandedIds: Set<string>,
  duplicates: DuplicateMap = {}
): FlatTaskRow[] {
  const rows: FlatTaskRow[] = []

  // A row plus its duplicates, which sit directly beneath it at the same indent —
  // they're sibling entries for the same task, not children, so they carry no
  // subtasks of their own and stay visible whether or not the task is expanded.
  function push(task: JiraTask, depth: number, isSubtask: boolean) {
    rows.push({ task, depth, isSubtask, rowKey: task.id, isDuplicate: false })
    for (const rowKey of duplicates[task.id] ?? []) {
      rows.push({ task, depth, isSubtask, rowKey, isDuplicate: true })
    }
  }

  for (const task of tasks) {
    push(task, 0, false)
    if (task.isExpandable && expandedIds.has(task.id)) {
      for (const sub of task.subtasks ?? []) push(sub, 1, true)
    }
  }
  return rows
}
