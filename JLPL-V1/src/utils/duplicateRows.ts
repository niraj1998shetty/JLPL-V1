// Session state (hours/comments) is keyed by *row*, not by task, so the same
// Jira task can appear on several rows and produce several worklog entries in one
// submission — e.g. 0.5h "Yoga" and 1h "Training" against the same internal task.
//
// The primary row's key is the bare task id, so anything reading `hours[task.id]`
// keeps working; duplicates get a `#<n>` suffix. Jira keys match
// /^[A-Z][A-Z0-9]*-\d+$/, so '#' can never occur in a task id.
const DUP_SEPARATOR = '#'

/** taskId -> ordered row keys of that task's duplicate rows. Session-only. */
export type DuplicateMap = Record<string, string[]>

/** Strips the duplicate suffix, returning the Jira task a row logs against. */
export function taskIdFromRowKey(rowKey: string): string {
  const i = rowKey.lastIndexOf(DUP_SEPARATOR)
  return i === -1 ? rowKey : rowKey.slice(0, i)
}

export function isDuplicateRowKey(rowKey: string): boolean {
  return rowKey.includes(DUP_SEPARATOR)
}

/** Appends a duplicate row for `taskId`, returning the new map and the new row key. */
export function addDuplicate(prev: DuplicateMap, taskId: string): { next: DuplicateMap; rowKey: string } {
  const existing = prev[taskId] ?? []
  // Suffixes are never reused within a session: removing #2 and duplicating again
  // yields #3, so a new row can't inherit stale hours from a row just removed.
  const used = existing.map((k) => Number(k.slice(k.lastIndexOf(DUP_SEPARATOR) + 1)) || 1)
  const rowKey = `${taskId}${DUP_SEPARATOR}${Math.max(1, ...used) + 1}`
  return { next: { ...prev, [taskId]: [...existing, rowKey] }, rowKey }
}

export function removeDuplicate(prev: DuplicateMap, taskId: string, rowKey: string): DuplicateMap {
  const remaining = (prev[taskId] ?? []).filter((k) => k !== rowKey)
  const next = { ...prev }
  if (remaining.length === 0) delete next[taskId]
  else next[taskId] = remaining
  return next
}

/** Every row key logging against `taskId` — the primary row plus its duplicates. */
export function rowKeysForTask(duplicates: DuplicateMap, taskId: string): string[] {
  return [taskId, ...(duplicates[taskId] ?? [])]
}
