import { useCallback, useEffect, useRef, useState } from 'react'
import { jiraService } from '../services/jiraService'
import { JiraTask, JiraTimeEntry } from '../types/jira'
import { groupTasks } from '../utils/taskHierarchy'
import { formatDateForApi } from '../utils/week'
import ConfirmDialog from './ConfirmDialog'
import DateNav from './DateNav'
import GroupHeader from './GroupHeader'
import OtherTaskAdder from './OtherTaskAdder'
import SummaryBar from './SummaryBar'
import TaskRow from './TaskRow'
import WorklogEditModal from './WorklogEditModal'

type HoursMap = Record<string, string>
type CommentMap = Record<string, string>

function isToday(date: Date): boolean {
  const today = new Date()
  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  )
}

interface DayLogViewProps {
  tasks: JiraTask[]
  setTasks: React.Dispatch<React.SetStateAction<JiraTask[]>>
  searchQuery: string
  selectedDate: Date
  onDateChange: (date: Date) => void
  logout: () => void
}

export default function DayLogView({ tasks, setTasks, searchQuery, selectedDate, onDateChange, logout }: DayLogViewProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [expandingTaskId, setExpandingTaskId] = useState<string | null>(null)
  const [hours, setHours] = useState<HoursMap>({})
  const [comments, setComments] = useState<CommentMap>({})
  const [existingWorklogs, setExistingWorklogs] = useState<Record<string, number>>({})
  // Fully-structured tasks the user logged time on this day (test badge, expandable
  // subtasks, estimates), so an old task logged a month ago renders like an assigned
  // task instead of a bare row.
  const [loggedTasks, setLoggedTasks] = useState<JiraTask[]>([])
  // Summaries keyed by task id — a lightweight fallback used to still surface logged
  // hours if the structured fetch above fails, so the day's total always reconciles.
  const [loggedTaskSummaries, setLoggedTaskSummaries] = useState<Record<string, string>>({})
  // Tasks the user manually added via "Log in Other Task" — tasks not in their
  // common/assigned list that they want to log time against (e.g. a PR review on
  // another team's ticket). Cleared on date change / after submit.
  const [otherTasks, setOtherTasks] = useState<JiraTask[]>([])
  const [addingOtherTask, setAddingOtherTask] = useState(false)
  const [otherTaskError, setOtherTaskError] = useState('')

  const [isLoadingWorklogs, setIsLoadingWorklogs] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [worklogError, setWorklogError] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')
  const [editingTask, setEditingTask] = useState<{ id: string; title: string } | null>(null)

  // Auto-dismiss the success toast after 3 seconds.
  useEffect(() => {
    if (!successMsg) return
    const id = window.setTimeout(() => setSuccessMsg(''), 3000)
    return () => window.clearTimeout(id)
  }, [successMsg])

  const abortRef = useRef<AbortController | null>(null)
  const dateRef = useRef(selectedDate)
  dateRef.current = selectedDate

  const grouped = groupTasks({
    tasks,
    otherTasks,
    structuredLoggedTasks: loggedTasks,
    loggedTaskIds: new Set(Object.keys(existingWorklogs).filter((id) => (existingWorklogs[id] ?? 0) > 0)),
    loggedTaskSummaries,
    searchQuery,
  })
  const { commonTasks, assignedTasks, otherSectionTasks, knownTaskIds } = grouped

  const sessionHours = Object.values(hours).reduce<number>(
    (sum, v) => sum + (parseFloat(v) || 0),
    0
  )

  const existingTotal = Object.values(existingWorklogs).reduce((s, v) => s + v, 0)
  const totalLogged = existingTotal + sessionHours
  const isOverLimit = totalLogged > 8.001

  const canSubmit = !isOverLimit && !isSubmitting && sessionHours > 0

  // Reset session state and reload worklogs whenever the viewed date changes,
  // regardless of whether that came from the prev/next arrows, the calendar
  // picker, or the header's "Today" button.
  useEffect(() => {
    setExpandedIds(new Set())
    setHours((prev) => {
      const next: HoursMap = {}
      for (const k of Object.keys(prev)) next[k] = ''
      return next
    })
    setComments((prev) => {
      const next: CommentMap = {}
      for (const k of Object.keys(prev)) next[k] = ''
      return next
    })
    setExistingWorklogs({})
    setLoggedTasks([])
    setLoggedTaskSummaries({})
    setOtherTasks([])
    setOtherTaskError('')
    setSuccessMsg('')
    loadWorklogs(formatDateForApi(selectedDate))
  }, [selectedDate])  // eslint-disable-line react-hooks/exhaustive-deps

  // Initialize hours/comments for newly-seen tasks (initial load, or tasks that
  // arrived after this view mounted) without clobbering in-progress input.
  useEffect(() => {
    setHours((prev) => {
      const next = { ...prev }
      let changed = false
      for (const t of tasks) {
        if (!(t.id in next)) { next[t.id] = ''; changed = true }
        for (const sub of t.subtasks ?? []) {
          if (!(sub.id in next)) { next[sub.id] = ''; changed = true }
        }
      }
      return changed ? next : prev
    })
    setComments((prev) => {
      const next = { ...prev }
      let changed = false
      for (const t of tasks) {
        if (!(t.id in next)) { next[t.id] = ''; changed = true }
        for (const sub of t.subtasks ?? []) {
          if (!(sub.id in next)) { next[sub.id] = ''; changed = true }
        }
      }
      return changed ? next : prev
    })
  }, [tasks])

  async function loadWorklogs(dateStr: string) {
    abortRef.current?.abort()
    abortRef.current = new AbortController()
    setIsLoadingWorklogs(true)
    setWorklogError('')
    try {
      const [entries, logged] = await Promise.all([
        jiraService.getExistingWorklogs(dateStr),
        jiraService.getLoggedTasks(dateStr).catch(() => [] as JiraTask[]),
      ])
      if (dateStr !== formatDateForApi(dateRef.current)) return
      const map: Record<string, number> = {}
      const summaries: Record<string, string> = {}
      for (const e of entries) {
        map[e.taskId] = (map[e.taskId] ?? 0) + e.hours
        if (e.taskSummary) summaries[e.taskId] = e.taskSummary
      }
      setExistingWorklogs(map)
      setLoggedTaskSummaries(summaries)
      setLoggedTasks(logged)
    } catch {
      if (dateStr === formatDateForApi(dateRef.current)) {
        setWorklogError('Could not load existing worklogs.')
      }
    } finally {
      setIsLoadingWorklogs(false)
    }
  }

  const handleToggleExpand = useCallback(
    async (taskId: string) => {
      const task =
        tasks.find((t) => t.id === taskId) ??
        loggedTasks.find((t) => t.id === taskId) ??
        otherTasks.find((t) => t.id === taskId)
      if (!task) return

      setExpandedIds((prev) => {
        const next = new Set(prev)
        if (next.has(taskId)) {
          next.delete(taskId)
        } else {
          next.add(taskId)
        }
        return next
      })

      if (!expandedIds.has(taskId) && !task.subtasks) {
        setExpandingTaskId(taskId)
        try {
          const subtasks = await jiraService.getSubtasks(taskId)
          // The task may live in either list (active or logged-this-day); update both —
          // the map is a no-op for whichever list doesn't contain it.
          const withSubtasks = (prev: JiraTask[]) =>
            prev.map((t) => (t.id === taskId ? { ...t, subtasks } : t))
          setTasks(withSubtasks)
          setLoggedTasks(withSubtasks)
          setOtherTasks(withSubtasks)
          setHours((prev) => {
            const next = { ...prev }
            for (const s of subtasks) if (!(s.id in next)) next[s.id] = ''
            return next
          })
          setComments((prev) => {
            const next = { ...prev }
            for (const s of subtasks) if (!(s.id in next)) next[s.id] = ''
            return next
          })
        } catch {
          // subtasks failed to load — keep expanded with empty list
        } finally {
          setExpandingTaskId(null)
        }
      }
    },
    [tasks, loggedTasks, otherTasks, expandedIds, setTasks]
  )

  function getCollapsedExistingHours(task: JiraTask): number {
    const own = existingWorklogs[task.id] ?? 0
    // Pre-loaded subtasks (isParentOnly tasks)
    const subtaskHours = (task.subtasks ?? []).reduce((s, sub) => s + (existingWorklogs[sub.id] ?? 0), 0)
    // Known subtask keys from default task fetch (direct children, not yet expanded)
    // Only count these if subtasks haven't been loaded yet to avoid double-counting
    const subtaskKeyHours = task.subtasks ? 0 : (task.subtaskKeys ?? []).reduce((s, key) => s + (existingWorklogs[key] ?? 0), 0)
    return own + subtaskHours + subtaskKeyHours
  }

  function handleHoursChange(taskId: string, val: string) {
    setHours((prev) => ({ ...prev, [taskId]: val }))
  }

  function handleCommentChange(taskId: string, val: string) {
    setComments((prev) => ({ ...prev, [taskId]: val }))
  }

  function navigateDate(dir: -1 | 1) {
    if (dir === 1 && isToday(selectedDate)) return
    const next = new Date(selectedDate)
    next.setDate(next.getDate() + dir)
    onDateChange(next)
  }

  function selectDate(date: Date) {
    // Don't allow future dates
    const today = new Date()
    const target = date > today ? today : date
    if (
      target.getFullYear() === selectedDate.getFullYear() &&
      target.getMonth() === selectedDate.getMonth() &&
      target.getDate() === selectedDate.getDate()
    ) {
      return
    }
    onDateChange(target)
  }

  // Worklogs can be edited for up to 14 days back (inclusive of today).
  function isEditableDate(date: Date): boolean {
    const today = new Date()
    today.setHours(23, 59, 59, 999)
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 14)
    cutoff.setHours(0, 0, 0, 0)
    return date <= today && date >= cutoff
  }
  const canEditSelectedDate = isEditableDate(selectedDate)

  function findTaskById(id: string): JiraTask | null {
    for (const t of [...tasks, ...loggedTasks, ...otherTasks]) {
      if (t.id === id) return t
      for (const sub of t.subtasks ?? []) {
        if (sub.id === id) return sub
      }
    }
    return null
  }

  function handleEditTask(taskId: string) {
    const task = findTaskById(taskId)
    const summary = task?.summary ?? loggedTaskSummaries[taskId]
    const title = summary ? `${taskId} ${summary}` : taskId
    setEditingTask({ id: taskId, title })
  }

  // Called after the user saves or deletes a worklog entry in the modal.
  // deltaHours can be negative. We update task totals + the per-row "Xh logged"
  // indicator immediately so the UI reflects the change without a reload.
  function handleWorklogChanged(taskId: string, deltaHours: number) {
    const now = new Date().toISOString()

    setTasks((prev) =>
      prev.map((t) => {
        const descendantIds = new Set<string>([
          ...(t.subtasks ?? []).map((s) => s.id),
          ...(t.subtaskKeys ?? []),
        ])
        const ownChange = t.id === taskId ? deltaHours : 0
        const aggregateChange = ownChange + (descendantIds.has(taskId) ? deltaHours : 0)

        const bumpedSubs = t.subtasks?.map((sub) =>
          sub.id === taskId
            ? {
                ...sub,
                totalLoggedHours: Math.max(0, (sub.totalLoggedHours ?? 0) + deltaHours),
                updatedAt: now,
              }
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

    setExistingWorklogs((prev) => {
      const current = prev[taskId] ?? 0
      const next = Math.max(0, current + deltaHours)
      return { ...prev, [taskId]: next }
    })
  }

  // Adds a task entered via "Log in Other Task". Validates the key format,
  // guards against duplicates, then fetches the structured task from Jira so it
  // renders like an assigned task (test badge, expandable subtasks, estimates).
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
      setHours((prev) => (task.id in prev ? prev : { ...prev, [task.id]: '' }))
      setComments((prev) => (task.id in prev ? prev : { ...prev, [task.id]: '' }))
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

  function resetSubmittedSession() {
    setHours((prev) => {
      const next: HoursMap = {}
      for (const k of Object.keys(prev)) next[k] = ''
      return next
    })
    setComments((prev) => {
      const next: CommentMap = {}
      for (const k of Object.keys(prev)) next[k] = ''
      return next
    })
    setOtherTaskError('')
  }

  // After a successful submit, bump totalLoggedHours and updatedAt locally so
  // the info popup reflects the new state without a page reload. Jira's
  // aggregatetimespent rolls subtask logs up into the parent, so we mirror that.
  function applyOptimisticLogs(entries: JiraTimeEntry[]) {
    const now = new Date().toISOString()
    const hoursById: Record<string, number> = {}
    for (const e of entries) hoursById[e.taskId] = (hoursById[e.taskId] ?? 0) + e.hours

    function bump(t: JiraTask): JiraTask {
      const bumpedSubs = t.subtasks?.map(bump)
      const ownAdd = hoursById[t.id] ?? 0

      // Aggregate hours that belong under this task: own + every descendant we know about,
      // de-duped across subtasks[] and subtaskKeys[].
      const descendantIds = new Set<string>([
        ...(t.subtasks ?? []).map((s) => s.id),
        ...(t.subtaskKeys ?? []),
      ])
      let aggregateAdd = ownAdd
      for (const id of descendantIds) aggregateAdd += hoursById[id] ?? 0

      if (aggregateAdd === 0 && bumpedSubs === t.subtasks) return t
      return {
        ...t,
        totalLoggedHours: (t.totalLoggedHours ?? 0) + aggregateAdd,
        updatedAt: aggregateAdd > 0 ? now : t.updatedAt,
        subtasks: bumpedSubs,
      }
    }

    setTasks((prev) => prev.map(bump))
  }

  async function handleSubmit() {
    if (!canSubmit) return
    setShowConfirm(false)
    setIsSubmitting(true)
    try {
      const entries: JiraTimeEntry[] = Object.entries(hours)
        .filter(([, v]) => v !== '' && Number(v) > 0)
        .map(([taskId, v]) => ({
          taskId,
          hours: Number(v),
          date: formatDateForApi(selectedDate),
          comment: comments[taskId] || undefined,
        }))

      await jiraService.logWork({ date: formatDateForApi(selectedDate), entries })
      applyOptimisticLogs(entries)
      resetSubmittedSession()
      setSuccessMsg(`Successfully logged ${sessionHours.toFixed(2).replace(/\.?0+$/, '')}h`)
      await loadWorklogs(formatDateForApi(selectedDate))
    } catch {
      // error handled globally — keep form intact
    } finally {
      setIsSubmitting(false)
    }
  }

  const confirmLabel = selectedDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

  return (
    <>
      <div className="flex-shrink-0 bg-white dark:bg-gray-800 shadow-sm">
        <DateNav date={selectedDate} onNavigate={navigateDate} onSelectDate={selectDate} />
        <div className="flex items-center px-4 py-2 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
          <div className="flex-1">Task</div>
          <div className="w-20 text-center">Hours</div>
        </div>
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
        <div className="flex-1 overflow-y-auto">

          {worklogError && (
            <div className="px-4 py-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-100 dark:border-amber-800">
              {worklogError}
            </div>
          )}

          {commonTasks.length > 0 && (
            <section>
              <GroupHeader label="Common Tasks" />
              {commonTasks.map((task) => (
                <TaskSection
                  key={task.id}
                  task={task}
                  hours={hours}
                  comments={comments}
                  existingWorklogs={existingWorklogs}
                  expandedIds={expandedIds}
                  expandingTaskId={expandingTaskId}
                  onHoursChange={handleHoursChange}
                  onCommentChange={handleCommentChange}
                  onToggleExpand={handleToggleExpand}
                  getCollapsedExistingHours={getCollapsedExistingHours}
                  showEstimate={false}
                  canEdit={canEditSelectedDate}
                  onEdit={handleEditTask}
                />
              ))}
            </section>
          )}

          {assignedTasks.length > 0 && (
            <section>
              <GroupHeader label="Assigned Tasks" />
              {assignedTasks.map((task) => (
                <TaskSection
                  key={task.id}
                  task={task}
                  hours={hours}
                  comments={comments}
                  existingWorklogs={existingWorklogs}
                  expandedIds={expandedIds}
                  expandingTaskId={expandingTaskId}
                  onHoursChange={handleHoursChange}
                  onCommentChange={handleCommentChange}
                  onToggleExpand={handleToggleExpand}
                  getCollapsedExistingHours={getCollapsedExistingHours}
                  showEstimate={true}
                  canEdit={canEditSelectedDate}
                  onEdit={handleEditTask}
                />
              ))}
            </section>
          )}

          {/* Other Tasks — tasks the user manually added to log against plus any
              task they logged time on this day that isn't in their common/assigned
              list (e.g. an old task, or a PR review on another team's ticket), so
              the visible hours reconcile with the day's total. */}
          {(otherSectionTasks.length > 0 || canEditSelectedDate) && (
            <section>
              <GroupHeader label="Other Tasks" />
              {otherSectionTasks.map((task) => (
                <TaskSection
                  key={task.id}
                  task={task}
                  hours={hours}
                  comments={comments}
                  existingWorklogs={existingWorklogs}
                  expandedIds={expandedIds}
                  expandingTaskId={expandingTaskId}
                  onHoursChange={handleHoursChange}
                  onCommentChange={handleCommentChange}
                  onToggleExpand={handleToggleExpand}
                  getCollapsedExistingHours={getCollapsedExistingHours}
                  showEstimate={true}
                  canEdit={canEditSelectedDate}
                  onEdit={handleEditTask}
                />
              ))}
              {canEditSelectedDate && (
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

          <div className="h-2" />
        </div>
      </div>

      <SummaryBar
        sessionHours={sessionHours}
        existingTotal={existingTotal}
        isOverLimit={isOverLimit}
        actualTotal={totalLogged}
        canSubmit={canSubmit}
        isSubmitting={isSubmitting}
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

      {editingTask && (
        <WorklogEditModal
          taskId={editingTask.id}
          taskTitle={editingTask.title}
          date={selectedDate}
          dayTotalHours={existingTotal}
          onClose={() => setEditingTask(null)}
          onChanged={(delta) => handleWorklogChanged(editingTask.id, delta)}
        />
      )}
    </>
  )
}

interface TaskSectionProps {
  task: JiraTask
  hours: HoursMap
  comments: CommentMap
  existingWorklogs: Record<string, number>
  expandedIds: Set<string>
  expandingTaskId: string | null
  showEstimate: boolean
  canEdit?: boolean
  onHoursChange: (id: string, v: string) => void
  onCommentChange: (id: string, v: string) => void
  onToggleExpand: (id: string) => void
  onEdit?: (id: string) => void
  getCollapsedExistingHours: (task: JiraTask) => number
}

function TaskSection({
  task,
  hours,
  comments,
  existingWorklogs,
  expandedIds,
  expandingTaskId,
  showEstimate,
  canEdit,
  onHoursChange,
  onCommentChange,
  onToggleExpand,
  onEdit,
  getCollapsedExistingHours,
}: TaskSectionProps) {
  const isExpanded = expandedIds.has(task.id)
  const existingHours = isExpanded
    ? (existingWorklogs[task.id] ?? 0)
    : getCollapsedExistingHours(task)
  const ownLoggedHours = existingWorklogs[task.id] ?? 0

  // When collapsed, surface the sum of unsaved hours entered on subtasks so the
  // user doesn't lose sight of pending children. Shown as a small badge below
  // the input; the parent's own input remains editable for its own time.
  let pendingChildHours = 0
  if (!isExpanded && task.isExpandable) {
    const childIds = new Set<string>([
      ...(task.subtasks ?? []).map((s) => s.id),
      ...(task.subtaskKeys ?? []),
    ])
    for (const id of childIds) {
      pendingChildHours += parseFloat(hours[id] ?? '') || 0
    }
  }

  return (
    <>
      <TaskRow
        task={task}
        isExpandable={task.isExpandable}
        isExpanded={isExpanded}
        isLoadingExpand={expandingTaskId === task.id}
        hours={hours[task.id] ?? ''}
        comment={comments[task.id] ?? ''}
        existingHours={existingHours}
        ownLoggedHours={ownLoggedHours}
        pendingChildHours={pendingChildHours}
        showEstimate={showEstimate}
        canEdit={canEdit}
        onHoursChange={onHoursChange}
        onCommentChange={onCommentChange}
        onToggleExpand={onToggleExpand}
        onEdit={onEdit}
      />
      {task.isExpandable && isExpanded && task.subtasks?.map((sub) => (
        <TaskRow
          key={sub.id}
          task={sub}
          isSubtask
          hours={hours[sub.id] ?? ''}
          comment={comments[sub.id] ?? ''}
          existingHours={existingWorklogs[sub.id] ?? 0}
          ownLoggedHours={existingWorklogs[sub.id] ?? 0}
          canEdit={canEdit}
          onHoursChange={onHoursChange}
          onCommentChange={onCommentChange}
          onEdit={onEdit}
        />
      ))}
    </>
  )
}
