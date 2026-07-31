import { useEffect, useRef, useState } from 'react'
import { jiraService } from '../services/jiraService'
import { JiraTask, JiraTimeEntry } from '../types/jira'
import {
  DuplicateMap,
  addDuplicate,
  removeDuplicate,
  rowKeysForTask,
  taskIdFromRowKey,
} from '../utils/duplicateRows'
import { FlatTaskRow, flattenVisibleRows, groupTasks } from '../utils/taskHierarchy'
import { WeekRange, formatDateForApi, formatWeekRangeLabel, getWeekRange, isSameWeek, isToday, isWeekendDay } from '../utils/week'
import ConfirmDialog from './ConfirmDialog'
import GroupHeader from './GroupHeader'
import HoursInput from './HoursInput'
import OtherTaskAdder from './OtherTaskAdder'
import TaskInfoButton from './TaskInfoButton'
import WeekNav from './WeekNav'
import WorklogEditModal from './WorklogEditModal'

type SessionMap = Record<string, string> // key: `${rowKey}__${dateStr}`

const DAY_COL_CLASS = 'w-16 sm:w-[72px] flex-shrink-0 border-l border-gray-100 dark:border-gray-700'
// Uncapped flex-1, matching the day view's Task column — it absorbs all width left
// over after the fixed-width day columns instead of leaving it blank.
const LABEL_COL_CLASS = 'flex-1 min-w-[180px]'

// A cell is identified by row (not task) and date, so a task with duplicate rows
// gets an independent set of seven cells per extra row.
function cellKey(rowKey: string, dateStr: string): string {
  return `${rowKey}__${dateStr}`
}

function parseCellKey(key: string): { rowKey: string; dateStr: string } {
  const i = key.lastIndexOf('__')
  return { rowKey: key.slice(0, i), dateStr: key.slice(i + 2) }
}

// Today takes priority over the weekend tint when today happens to fall on a
// Saturday/Sunday — it's the more actionable signal.
function dayColumnBgClass(date: Date): string {
  if (isToday(date)) return 'bg-jira-blue-light dark:bg-blue-900/25'
  if (isWeekendDay(date)) return 'bg-amber-50/60 dark:bg-amber-900/10'
  return ''
}

function isFutureDate(date: Date): boolean {
  const endOfToday = new Date()
  endOfToday.setHours(23, 59, 59, 999)
  return date > endOfToday
}

// Worklogs can be edited for up to 30 days back (inclusive of today) — same rule the day view uses.
function isEditableDate(date: Date): boolean {
  const today = new Date()
  today.setHours(23, 59, 59, 999)
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 30)
  cutoff.setHours(0, 0, 0, 0)
  return date <= today && date >= cutoff
}

interface WeekLogViewProps {
  tasks: JiraTask[]
  setTasks: React.Dispatch<React.SetStateAction<JiraTask[]>>
  searchQuery: string
  selectedDate: Date
  onDateChange: (date: Date) => void
  logout: () => void
}

export default function WeekLogView({ tasks, setTasks, searchQuery, selectedDate, onDateChange, logout }: WeekLogViewProps) {
  const range = getWeekRange(selectedDate)
  const rangeStart = formatDateForApi(range.monday)
  const rangeEnd = formatDateForApi(range.sunday)

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [expandingTaskId, setExpandingTaskId] = useState<string | null>(null)
  const [hours, setHours] = useState<SessionMap>({})
  const [comments, setComments] = useState<SessionMap>({})
  // Extra logging rows for tasks the user is logging more than once in a session.
  // A duplicate spans the whole visible week, same as the row it came from.
  const [duplicates, setDuplicates] = useState<DuplicateMap>({})
  const [existingByTaskDate, setExistingByTaskDate] = useState<Record<string, Record<string, number>>>({})
  const [rangeTaskSummaries, setRangeTaskSummaries] = useState<Record<string, string>>({})
  // Tasks manually added via "Log for other task" — span the whole visible week.
  const [otherTasks, setOtherTasks] = useState<JiraTask[]>([])
  const [addingOtherTask, setAddingOtherTask] = useState(false)
  const [otherTaskError, setOtherTaskError] = useState('')

  const [isLoadingWorklogs, setIsLoadingWorklogs] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [worklogError, setWorklogError] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')
  const [editingCell, setEditingCell] = useState<{ taskId: string; title: string; date: Date } | null>(null)

  useEffect(() => {
    if (!successMsg) return
    const id = window.setTimeout(() => setSuccessMsg(''), 3000)
    return () => window.clearTimeout(id)
  }, [successMsg])

  const abortRef = useRef<AbortController | null>(null)
  const rangeRef = useRef({ start: rangeStart, end: rangeEnd })
  rangeRef.current = { start: rangeStart, end: rangeEnd }

  // Reset session state and reload whenever the visible week changes.
  useEffect(() => {
    setExpandedIds(new Set())
    setHours({})
    setComments({})
    setDuplicates({})
    setExistingByTaskDate({})
    setRangeTaskSummaries({})
    setOtherTasks([])
    setOtherTaskError('')
    setSuccessMsg('')
    loadRange(rangeStart, rangeEnd)
  }, [rangeStart, rangeEnd])  // eslint-disable-line react-hooks/exhaustive-deps

  async function loadRange(start: string, end: string) {
    abortRef.current?.abort()
    abortRef.current = new AbortController()
    setIsLoadingWorklogs(true)
    setWorklogError('')
    try {
      const entries = await jiraService.getWorklogsRange(start, end)
      if (start !== rangeRef.current.start || end !== rangeRef.current.end) return
      const byTaskDate: Record<string, Record<string, number>> = {}
      const summaries: Record<string, string> = {}
      for (const e of entries) {
        byTaskDate[e.taskId] = byTaskDate[e.taskId] ?? {}
        byTaskDate[e.taskId][e.date] = (byTaskDate[e.taskId][e.date] ?? 0) + e.hours
        if (e.taskSummary) summaries[e.taskId] = e.taskSummary
      }
      setExistingByTaskDate(byTaskDate)
      setRangeTaskSummaries(summaries)
    } catch {
      if (start === rangeRef.current.start && end === rangeRef.current.end) {
        setWorklogError('Could not load existing worklogs.')
      }
    } finally {
      setIsLoadingWorklogs(false)
    }
  }

  const loggedTaskIds = new Set(
    Object.keys(existingByTaskDate).filter((id) => Object.values(existingByTaskDate[id]).some((h) => h > 0))
  )

  const visibleRows = (list: JiraTask[]) => flattenVisibleRows(list, expandedIds, duplicates)

  const { commonTasks, assignedTasks, otherSectionTasks, knownTaskIds } = groupTasks({
    tasks,
    otherTasks,
    loggedTaskIds,
    loggedTaskSummaries: rangeTaskSummaries,
    searchQuery,
  })

  function dayExistingTotal(dateStr: string): number {
    let sum = 0
    for (const id of Object.keys(existingByTaskDate)) sum += existingByTaskDate[id][dateStr] ?? 0
    return sum
  }

  function daySessionTotal(dateStr: string): number {
    let sum = 0
    for (const [key, v] of Object.entries(hours)) {
      if (key.endsWith(`__${dateStr}`)) sum += parseFloat(v) || 0
    }
    return sum
  }

  const sessionHours = Object.values(hours).reduce<number>((s, v) => s + (parseFloat(v) || 0), 0)
  const overLimitDates = range.days.filter((d) => {
    const dateStr = formatDateForApi(d)
    return dayExistingTotal(dateStr) + daySessionTotal(dateStr) > 8.001
  })
  const canSubmit = sessionHours > 0 && !isSubmitting && overLimitDates.length === 0
  const canAddOtherTask = range.days.some(isEditableDate)

  async function handleToggleExpand(taskId: string) {
    const task = tasks.find((t) => t.id === taskId) ?? otherTasks.find((t) => t.id === taskId)
    if (!task) return

    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(taskId)) next.delete(taskId)
      else next.add(taskId)
      return next
    })

    if (!expandedIds.has(taskId) && !task.subtasks) {
      setExpandingTaskId(taskId)
      try {
        const subtasks = await jiraService.getSubtasks(taskId)
        const withSubtasks = (prev: JiraTask[]) => prev.map((t) => (t.id === taskId ? { ...t, subtasks } : t))
        setTasks(withSubtasks)
        setOtherTasks(withSubtasks)
      } catch {
        // subtasks failed to load — keep expanded with empty list
      } finally {
        setExpandingTaskId(null)
      }
    }
  }

  function handleHoursChange(rowKey: string, dateStr: string, val: string) {
    setHours((prev) => ({ ...prev, [cellKey(rowKey, dateStr)]: val }))
  }

  function handleCommentChange(rowKey: string, dateStr: string, val: string) {
    setComments((prev) => ({ ...prev, [cellKey(rowKey, dateStr)]: val }))
  }

  function handleDuplicate(taskId: string) {
    setDuplicates((prev) => addDuplicate(prev, taskId).next)
  }

  // Clears all seven of the row's cells along with the row, so removing a duplicate
  // can't leave invisible hours in the week total or the submission.
  function handleRemoveDuplicate(taskId: string, rowKey: string) {
    setDuplicates((prev) => removeDuplicate(prev, taskId, rowKey))
    const drop = (prev: SessionMap) => {
      const next: SessionMap = {}
      for (const [k, v] of Object.entries(prev)) {
        if (parseCellKey(k).rowKey !== rowKey) next[k] = v
      }
      return next
    }
    setHours(drop)
    setComments(drop)
  }

  function navigateWeek(dir: -1 | 1) {
    if (dir === 1 && isSameWeek(selectedDate, new Date())) return
    const next = new Date(selectedDate)
    next.setDate(next.getDate() + dir * 7)
    onDateChange(next)
  }

  function handleEditCell(taskId: string, date: Date) {
    const task = [...tasks, ...otherTasks].flatMap((t) => [t, ...(t.subtasks ?? [])]).find((t) => t.id === taskId)
    const summary = task?.summary ?? rangeTaskSummaries[taskId]
    const title = summary ? `${taskId} ${summary}` : taskId
    setEditingCell({ taskId, title, date })
  }

  // Mirrors the day view's handleWorklogChanged, generalized with a date key.
  function handleWorklogChanged(taskId: string, dateStr: string, deltaHours: number) {
    const now = new Date().toISOString()
    setTasks((prev) =>
      prev.map((t) => {
        const descendantIds = new Set<string>([...(t.subtasks ?? []).map((s) => s.id), ...(t.subtaskKeys ?? [])])
        const ownChange = t.id === taskId ? deltaHours : 0
        const aggregateChange = ownChange + (descendantIds.has(taskId) ? deltaHours : 0)
        const bumpedSubs = t.subtasks?.map((sub) =>
          sub.id === taskId
            ? { ...sub, totalLoggedHours: Math.max(0, (sub.totalLoggedHours ?? 0) + deltaHours), updatedAt: now }
            : sub
        )
        if (aggregateChange === 0 && bumpedSubs === t.subtasks) return t
        return {
          ...t,
          totalLoggedHours: Math.max(0, (t.totalLoggedHours ?? 0) + aggregateChange),
          updatedAt: aggregateChange !== 0 ? now : t.updatedAt,
          subtasks: bumpedSubs,
        }
      })
    )
    setExistingByTaskDate((prev) => {
      const current = prev[taskId]?.[dateStr] ?? 0
      const next = Math.max(0, current + deltaHours)
      return { ...prev, [taskId]: { ...prev[taskId], [dateStr]: next } }
    })
  }

  async function handleAddOtherTask(rawId: string): Promise<boolean> {
    const taskId = rawId.trim().toUpperCase()
    if (!/^[A-Z][A-Z0-9]*-\d+$/.test(taskId)) {
      setOtherTaskError('Enter a valid Task ID, e.g. DMO-13745.')
      return false
    }
    if (knownTaskIds.has(taskId)) {
      setOtherTaskError('That task is already in your Common or Assigned list.')
      return false
    }
    if (otherTasks.some((t) => t.id === taskId)) {
      setOtherTaskError('That task has already been added.')
      return false
    }
    setAddingOtherTask(true)
    setOtherTaskError('')
    try {
      const task = await jiraService.getTaskById(taskId)
      setOtherTasks((prev) => (prev.some((t) => t.id === task.id) ? prev : [...prev, task]))
      return true
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 401) {
        setOtherTaskError('Session expired. Please log in again.')
        logout()
      } else if (status === 404) {
        setOtherTaskError(`Task ${taskId} was not found in Jira.`)
      } else {
        setOtherTaskError('Could not load that task. Check the ID and try again.')
      }
      return false
    } finally {
      setAddingOtherTask(false)
    }
  }

  async function handleSubmit() {
    if (!canSubmit) return
    setShowConfirm(false)
    setIsSubmitting(true)
    try {
      const byDate = new Map<string, JiraTimeEntry[]>()
      for (const [key, v] of Object.entries(hours)) {
        if (v === '' || Number(v) <= 0) continue
        const { rowKey, dateStr } = parseCellKey(key)
        // Duplicate rows collapse back to their underlying task here, so two rows on
        // the same task and day submit as two separate Jira worklogs.
        const entry: JiraTimeEntry = {
          taskId: taskIdFromRowKey(rowKey),
          hours: Number(v),
          date: dateStr,
          comment: comments[key] || undefined,
        }
        byDate.set(dateStr, [...(byDate.get(dateStr) ?? []), entry])
      }
      const days = [...byDate.entries()].map(([date, entries]) => ({ date, entries }))

      await jiraService.submitWeek({ days })

      setHours({})
      setComments({})
      setDuplicates({})
      setOtherTaskError('')
      setSuccessMsg(`Successfully logged ${sessionHours.toFixed(2).replace(/\.?0+$/, '')}h`)
      await loadRange(rangeStart, rangeEnd)
    } catch {
      // error handled globally — keep form intact so nothing is lost
    } finally {
      setIsSubmitting(false)
    }
  }

  const confirmLabel = formatWeekRangeLabel(range)

  return (
    <>
      <div className="flex-shrink-0 bg-white dark:bg-gray-800 shadow-sm">
        <WeekNav range={range} onNavigateWeek={navigateWeek} />
      </div>

      {successMsg && (
        <div className="bg-green-50 dark:bg-green-900/30 border-b border-green-200 dark:border-green-700 px-4 py-2.5 flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
          <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          {successMsg}
          <button onClick={() => setSuccessMsg('')} className="ml-auto text-green-500 hover:text-green-700">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
          </button>
        </div>
      )}

      <div className="flex-1 flex flex-col min-h-0 relative">
        {isLoadingWorklogs && (
          <div className="absolute inset-0 bg-white/80 dark:bg-gray-900/80 z-40 flex flex-col items-center justify-center gap-3">
            <svg className="animate-spin h-8 w-8 text-jira-blue" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <p className="text-xs text-gray-600">Loading time entries...</p>
          </div>
        )}
        <div className="flex-1 overflow-auto">
          {worklogError && (
            <div className="px-4 py-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-100 dark:border-amber-800">
              {worklogError}
            </div>
          )}

          <div className="min-w-[640px]">
            <WeekHeaderRow range={range} />

            {commonTasks.length > 0 && (
              <section>
                <GroupHeader label="Common Tasks" />
                {visibleRows(commonTasks).map((row) => (
                  <WeekTaskRow
                    key={`${row.rowKey}-${row.isSubtask}`}
                    row={row}
                    range={range}
                    hours={hours}
                    comments={comments}
                    duplicates={duplicates}
                    existingByTaskDate={existingByTaskDate}
                    expandingTaskId={expandingTaskId}
                    isExpanded={expandedIds.has(row.task.id)}
                    showEstimate={false}
                    onHoursChange={handleHoursChange}
                    onCommentChange={handleCommentChange}
                    onToggleExpand={handleToggleExpand}
                    onEditCell={handleEditCell}
                    onDuplicate={handleDuplicate}
                    onRemoveDuplicate={handleRemoveDuplicate}
                  />
                ))}
              </section>
            )}

            {assignedTasks.length > 0 && (
              <section>
                <GroupHeader label="Assigned Tasks" />
                {visibleRows(assignedTasks).map((row) => (
                  <WeekTaskRow
                    key={`${row.rowKey}-${row.isSubtask}`}
                    row={row}
                    range={range}
                    hours={hours}
                    comments={comments}
                    duplicates={duplicates}
                    existingByTaskDate={existingByTaskDate}
                    expandingTaskId={expandingTaskId}
                    isExpanded={expandedIds.has(row.task.id)}
                    showEstimate={true}
                    onHoursChange={handleHoursChange}
                    onCommentChange={handleCommentChange}
                    onToggleExpand={handleToggleExpand}
                    onEditCell={handleEditCell}
                    onDuplicate={handleDuplicate}
                    onRemoveDuplicate={handleRemoveDuplicate}
                  />
                ))}
              </section>
            )}

            {(otherSectionTasks.length > 0 || canAddOtherTask) && (
              <section>
                <GroupHeader label="Other Tasks" />
                {visibleRows(otherSectionTasks).map((row) => (
                  <WeekTaskRow
                    key={`${row.rowKey}-${row.isSubtask}`}
                    row={row}
                    range={range}
                    hours={hours}
                    comments={comments}
                    duplicates={duplicates}
                    existingByTaskDate={existingByTaskDate}
                    expandingTaskId={expandingTaskId}
                    isExpanded={expandedIds.has(row.task.id)}
                    showEstimate={true}
                    onHoursChange={handleHoursChange}
                    onCommentChange={handleCommentChange}
                    onToggleExpand={handleToggleExpand}
                    onEditCell={handleEditCell}
                    onDuplicate={handleDuplicate}
                    onRemoveDuplicate={handleRemoveDuplicate}
                  />
                ))}
                {canAddOtherTask && (
                  <OtherTaskAdder
                    onAdd={handleAddOtherTask}
                    isAdding={addingOtherTask}
                    error={otherTaskError}
                    onClearError={() => setOtherTaskError('')}
                  />
                )}
              </section>
            )}

            {commonTasks.length === 0 && assignedTasks.length === 0 && otherSectionTasks.length === 0 && (
              <div className="text-center py-16 text-gray-400 dark:text-gray-500">
                <svg className="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <p className="text-sm">No tasks found</p>
              </div>
            )}

            <WeekTotalsRow range={range} dayExistingTotal={dayExistingTotal} daySessionTotal={daySessionTotal} />
          </div>
        </div>
      </div>

      <WeekSubmitBar
        sessionHours={sessionHours}
        canSubmit={canSubmit}
        isSubmitting={isSubmitting}
        hasOverLimitDay={overLimitDates.length > 0}
        onSubmit={() => setShowConfirm(true)}
      />

      {showConfirm && (
        <ConfirmDialog
          label={confirmLabel}
          sessionHours={sessionHours}
          onConfirm={handleSubmit}
          onCancel={() => setShowConfirm(false)}
        />
      )}

      {editingCell && (
        <WorklogEditModal
          taskId={editingCell.taskId}
          taskTitle={editingCell.title}
          date={editingCell.date}
          dayTotalHours={dayExistingTotal(formatDateForApi(editingCell.date))}
          onClose={() => setEditingCell(null)}
          onChanged={(delta) => handleWorklogChanged(editingCell.taskId, formatDateForApi(editingCell.date), delta)}
        />
      )}
    </>
  )
}

// --- Sub-components ---

function WeekHeaderRow({ range }: { range: WeekRange }) {
  return (
    <div className="flex items-stretch bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 text-[11px] font-bold text-gray-400 dark:text-gray-500 sticky top-0 z-20">
      <div className={`sticky left-0 z-30 bg-gray-50 dark:bg-gray-900 ${LABEL_COL_CLASS} px-4 py-2 flex items-center uppercase tracking-wider`}>
        Task
      </div>
      {range.days.map((d) => {
        const weekend = isWeekendDay(d)
        const today = isToday(d)
        return (
          <div
            key={d.toISOString()}
            className={`${DAY_COL_CLASS} px-1 py-2 flex flex-col items-center justify-center ${
              today
                ? 'bg-jira-blue-light dark:bg-blue-900/30 text-jira-blue dark:text-blue-300 border-b-2 border-b-jira-blue'
                : weekend
                ? 'bg-amber-50/60 dark:bg-amber-900/10 text-amber-600 dark:text-amber-500'
                : ''
            }`}
          >
            <span className="uppercase tracking-wider">{d.toLocaleDateString('en-US', { weekday: 'short' })}</span>
            <span className={`font-semibold text-xs ${today ? 'text-jira-blue dark:text-blue-300' : 'text-gray-500 dark:text-gray-400'}`}>
              {d.getDate()}
            </span>
          </div>
        )
      })}
    </div>
  )
}

interface WeekTaskRowProps {
  row: FlatTaskRow
  range: WeekRange
  hours: SessionMap
  comments: SessionMap
  duplicates: DuplicateMap
  existingByTaskDate: Record<string, Record<string, number>>
  expandingTaskId: string | null
  isExpanded: boolean
  showEstimate: boolean
  onHoursChange: (rowKey: string, dateStr: string, v: string) => void
  onCommentChange: (rowKey: string, dateStr: string, v: string) => void
  onToggleExpand: (taskId: string) => void
  onEditCell: (taskId: string, date: Date) => void
  onDuplicate: (taskId: string) => void
  onRemoveDuplicate: (taskId: string, rowKey: string) => void
}

function WeekTaskRow({
  row,
  range,
  hours,
  comments,
  duplicates,
  existingByTaskDate,
  expandingTaskId,
  isExpanded,
  showEstimate,
  onHoursChange,
  onCommentChange,
  onToggleExpand,
  onEditCell,
  onDuplicate,
  onRemoveDuplicate,
}: WeekTaskRowProps) {
  const { task, isSubtask, rowKey, isDuplicate } = row
  const rowBg = isSubtask ? 'bg-gray-100 dark:bg-gray-700/50' : 'bg-white dark:bg-gray-800'
  // A duplicated parent is just another entry against the parent itself, so it never
  // expands and never carries the children of the row it was created from.
  const canExpand = task.isExpandable && !isSubtask && !isDuplicate

  // The duplicate button only shows while the row is actually being logged against —
  // some cell of it holds focus, or the week already has hours typed into it. Focus is
  // read at the row level (focusin/focusout bubble) so tabbing between the row's own
  // cells doesn't flicker the button away.
  const [hasFocus, setHasFocus] = useState(false)
  const hasSessionHours = range.days.some(
    (d) => parseFloat(hours[cellKey(rowKey, formatDateForApi(d))] ?? '') > 0
  )
  const isLogging = hasFocus || hasSessionHours

  return (
    <div
      className={`flex items-stretch border-b border-gray-100 dark:border-gray-700 last:border-0 ${rowBg}`}
      onFocus={() => setHasFocus(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHasFocus(false)
      }}
    >
      <div
        className={`sticky left-0 z-10 ${rowBg} ${LABEL_COL_CLASS} flex items-start gap-1.5 py-2 ${
          isSubtask ? 'pl-9 pr-2' : 'pl-3 pr-2'
        } ${canExpand ? 'cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors' : ''}`}
        onClick={() => {
          if (canExpand) onToggleExpand(task.id)
        }}
      >
        {isDuplicate ? (
          <div className="w-4 mt-0.5 flex-shrink-0 text-gray-300 dark:text-gray-600" aria-hidden="true">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v8a4 4 0 004 4h11m0 0l-4-4m4 4l-4 4" />
            </svg>
          </div>
        ) : canExpand ? (
          expandingTaskId === task.id ? (
            <svg className="animate-spin h-4 w-4 mt-0.5 flex-shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg
              className={`w-4 h-4 mt-0.5 flex-shrink-0 text-gray-400 transition-transform duration-150 ${isExpanded ? 'rotate-90' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          )
        ) : (
          <div className="w-4 flex-shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <a
              href={`https://jira.eg.dk/browse/${task.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className={`text-xs font-bold hover:underline flex-shrink-0 ${
                isDuplicate ? 'text-jira-blue/60' : 'text-jira-blue'
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              {task.id}
            </a>
            {isDuplicate ? (
              <>
                <span className="text-[10px] text-gray-400 dark:text-gray-500 italic truncate">extra entry</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onRemoveDuplicate(task.id, rowKey)
                  }}
                  className="flex-shrink-0 text-gray-400 hover:text-red-500 transition-colors"
                  aria-label="Remove this entry"
                  title="Remove this entry"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </>
            ) : (
              <>
                {task.taskType === 'test' && (
                  <span className="text-[9px] font-bold tracking-wide px-1.5 py-0.5 rounded bg-amber-200 text-amber-900 border border-amber-300 flex-shrink-0">
                    TEST
                  </span>
                )}
                <span className="text-xs text-gray-700 dark:text-gray-300 truncate">{task.summary}</span>
                <TaskInfoButton task={task} show={showEstimate} />
                {isLogging && (
                  <button
                    type="button"
                    // Without this the mousedown blurs the cell being logged, which hides
                    // the button before the click lands on it.
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={(e) => {
                      e.stopPropagation()
                      onDuplicate(task.id)
                    }}
                    className="flex-shrink-0 text-gray-400 hover:text-jira-blue transition-colors"
                    aria-label="Log another entry for this task"
                    title="Log another entry for this task"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 8V5.5A2.5 2.5 0 0110.5 3h8A2.5 2.5 0 0121 5.5v8a2.5 2.5 0 01-2.5 2.5H16" />
                      <rect x="3" y="8" width="13" height="13" rx="2.5" />
                      <path strokeLinecap="round" d="M9.5 12v5M7 14.5h5" />
                    </svg>
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {range.days.map((d) => {
        const dateStr = formatDateForApi(d)
        const key = cellKey(rowKey, dateStr)
        const ownExisting = existingByTaskDate[task.id]?.[dateStr] ?? 0

        // Collapsed parents roll up subtask hours (both already-logged and unsaved
        // session input) the same way the day view's TaskSection does, so hours
        // don't silently disappear from view when a parent is collapsed.
        let existingHours = ownExisting
        let pendingChildHours = 0
        if (canExpand && !isExpanded) {
          const childIds = new Set<string>([
            ...(task.subtasks ?? []).map((s) => s.id),
            ...(task.subtaskKeys ?? []),
          ])
          for (const childId of childIds) {
            existingHours += existingByTaskDate[childId]?.[dateStr] ?? 0
            // A child may have duplicate rows of its own; roll up every one of them.
            for (const childRowKey of rowKeysForTask(duplicates, childId)) {
              pendingChildHours += parseFloat(hours[cellKey(childRowKey, dateStr)] ?? '') || 0
            }
          }
        }

        return (
          <WeekDayCell
            key={dateStr}
            date={d}
            // Already-logged hours and the edit pencil describe the task as a whole, so
            // they stay on the primary row rather than repeating on every extra entry.
            existingHours={isDuplicate ? 0 : existingHours}
            ownExistingHours={isDuplicate ? 0 : ownExisting}
            pendingChildHours={pendingChildHours}
            sessionValue={hours[key] ?? ''}
            sessionComment={comments[key] ?? ''}
            onSessionChange={(v) => onHoursChange(rowKey, dateStr, v)}
            onCommentChange={(v) => onCommentChange(rowKey, dateStr, v)}
            onEditClick={() => onEditCell(task.id, d)}
          />
        )
      })}
    </div>
  )
}

interface WeekDayCellProps {
  date: Date
  existingHours: number
  ownExistingHours: number
  pendingChildHours: number
  sessionValue: string
  sessionComment: string
  onSessionChange: (v: string) => void
  onCommentChange: (v: string) => void
  onEditClick: () => void
}

function WeekDayCell({
  date,
  existingHours,
  ownExistingHours,
  pendingChildHours,
  sessionValue,
  sessionComment,
  onSessionChange,
  onCommentChange,
  onEditClick,
}: WeekDayCellProps) {
  const future = isFutureDate(date)
  const editable = isEditableDate(date)
  const hasSession = parseFloat(sessionValue) > 0

  return (
    <div className={`${DAY_COL_CLASS} px-1 py-2 flex flex-col items-center gap-0.5 ${dayColumnBgClass(date)}`}>
      <div className="flex items-center gap-0.5">
        {editable && ownExistingHours > 0 && (
          <button
            type="button"
            onClick={onEditClick}
            className="text-gray-400 hover:text-jira-blue transition-colors"
            aria-label="Edit logged hours"
            title="Edit logged hours"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </button>
        )}
        <HoursInput
          value={sessionValue}
          onChange={onSessionChange}
          disabled={future}
          className="w-11 sm:w-12 px-1 py-1 text-xs text-center border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-jira-blue focus:border-transparent bg-white dark:bg-gray-700 dark:text-gray-100"
        />
      </div>
      {existingHours > 0 && (
        <span className="text-[9px] text-gray-400 dark:text-gray-500 whitespace-nowrap">{existingHours}h logged</span>
      )}
      {pendingChildHours > 0 && (
        <span className="text-[9px] text-jira-blue whitespace-nowrap" title="Unsaved hours on subtasks">
          +{pendingChildHours.toFixed(2).replace(/\.?0+$/, '')}h sub
        </span>
      )}
      {hasSession && (
        <input
          type="text"
          value={sessionComment}
          onChange={(e) => onCommentChange(e.target.value)}
          placeholder="note"
          className="w-11 sm:w-12 px-1 py-0.5 text-[10px] border border-gray-200 dark:border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-jira-blue bg-white dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-500"
        />
      )}
    </div>
  )
}

function WeekTotalsRow({
  range,
  dayExistingTotal,
  daySessionTotal,
}: {
  range: WeekRange
  dayExistingTotal: (dateStr: string) => number
  daySessionTotal: (dateStr: string) => number
}) {
  return (
    <div className="flex items-stretch border-t-2 border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 sticky bottom-0 z-20">
      <div className={`sticky left-0 z-20 bg-gray-50 dark:bg-gray-900 ${LABEL_COL_CLASS} px-4 py-2 text-xs font-bold text-gray-500 dark:text-gray-400 flex items-center`}>
        Total
      </div>
      {range.days.map((d) => {
        const dateStr = formatDateForApi(d)
        const total = dayExistingTotal(dateStr) + daySessionTotal(dateStr)
        const over = total > 8.001
        return (
          <div
            key={dateStr}
            className={`${DAY_COL_CLASS} ${dayColumnBgClass(d)} px-1 py-2 flex items-center justify-center text-xs font-semibold ${
              over ? 'text-red-600 dark:text-red-400' : total >= 8 ? 'text-green-600 dark:text-green-400' : 'text-gray-700 dark:text-gray-300'
            }`}
          >
            {total > 0 ? `${total.toFixed(2).replace(/\.?0+$/, '')}h` : '—'}
          </div>
        )
      })}
    </div>
  )
}

function WeekSubmitBar({
  sessionHours,
  canSubmit,
  isSubmitting,
  hasOverLimitDay,
  onSubmit,
}: {
  sessionHours: number
  canSubmit: boolean
  isSubmitting: boolean
  hasOverLimitDay: boolean
  onSubmit: () => void
}) {
  // Per spec, the submit control only appears once the user starts logging time.
  if (sessionHours <= 0 && !isSubmitting) return null

  return (
    <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3">
      <div className="flex items-center justify-between text-sm mb-3">
        <div>
          <span className="text-gray-500 dark:text-gray-400 text-xs">This session</span>
          <div className="font-semibold text-gray-800 dark:text-gray-100">
            {sessionHours.toFixed(2).replace(/\.?0+$/, '')}h across the week
          </div>
        </div>
        {hasOverLimitDay && (
          <div className="text-xs text-red-600 dark:text-red-400 font-medium bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 px-2 py-1 rounded-lg">
            One or more days exceed 8h
          </div>
        )}
      </div>
      <button onClick={onSubmit} disabled={!canSubmit} className="btn-primary w-full flex items-center justify-center gap-2">
        {isSubmitting ? (
          <>
            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span>Submitting...</span>
          </>
        ) : (
          'Submit Week'
        )}
      </button>
    </div>
  )
}
