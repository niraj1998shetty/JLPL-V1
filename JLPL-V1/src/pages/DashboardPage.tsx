import { useCallback, useEffect, useRef, useState } from 'react'
import DateNav from '../components/DateNav'
import SummaryBar from '../components/SummaryBar'
import TaskRow from '../components/TaskRow'
import WorklogEditModal from '../components/WorklogEditModal'
import { useAuth } from '../context/AuthContext'
import { jiraService } from '../services/jiraService'
import { JiraTask, JiraTimeEntry } from '../types/jira'

type HoursMap = Record<string, string>
type CommentMap = Record<string, string>

function formatDateForApi(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

//function getMondayOfCurrentWeek(): Date {
//  const today = new Date()
//  const day = today.getDay() // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
//  const diff = today.getDate() - day + (day === 0 ? -6 : 1)
//  return new Date(today.getFullYear(), today.getMonth(), diff)
//}

//function formatWeekOfDate(date: Date): string {
//  const year = date.getFullYear()
//  const month = String(date.getMonth() + 1).padStart(2, '0')
//  const day = String(date.getDate()).padStart(2, '0')
//  return `${year}-${month}-${day}T07%3A00%3A00.000Z`
//}

function isToday(date: Date): boolean {
  const today = new Date()
  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  )
}

function getInitials(name: string | null | undefined): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export default function DashboardPage() {
  const { logout, teams, userName, getPat } = useAuth()

  const [selectedDate, setSelectedDate] = useState(new Date())
  const [tasks, setTasks] = useState<JiraTask[]>([])
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

  const [isLoadingTasks, setIsLoadingTasks] = useState(true)
  const [isLoadingWorklogs, setIsLoadingWorklogs] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [taskError, setTaskError] = useState('')
  const [worklogError, setWorklogError] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')
  const [editingTask, setEditingTask] = useState<{ id: string; title: string } | null>(null)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const userMenuRef = useRef<HTMLDivElement>(null)
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Focus search input when it opens
  useEffect(() => {
    if (showSearch) searchInputRef.current?.focus()
  }, [showSearch])

  // Close user menu on outside click or Escape
  useEffect(() => {
    if (!showUserMenu) return
    function onDown(e: MouseEvent) {
      if (!userMenuRef.current?.contains(e.target as Node)) {
        setShowUserMenu(false)
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setShowUserMenu(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [showUserMenu])

  // Auto-dismiss the success toast after 3 seconds.
  useEffect(() => {
    if (!successMsg) return
    const id = window.setTimeout(() => setSuccessMsg(''), 3000)
    return () => window.clearTimeout(id)
  }, [successMsg])

  const abortRef = useRef<AbortController | null>(null)
  const dateRef = useRef(selectedDate)
  dateRef.current = selectedDate

  // Derived values
  function taskMatchesSearch(t: JiraTask): boolean {
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    return t.id.toLowerCase().includes(q) || (t.summary ?? '').toLowerCase().includes(q)
  }

  const commonTasks = tasks.filter((t) => t.isDefault && taskMatchesSearch(t))
  const assignedTasks = tasks.filter((t) => !t.isDefault && taskMatchesSearch(t))

  // Tasks the user logged time on this day that aren't in the active/common list
  // (or their subtasks). Without these, the day's total would include hours that
  // have no visible row — e.g. an old task logged a month ago. We surface them so
  // the visible hours reconcile with the total.
  const knownTaskIds = new Set<string>()
  for (const t of tasks) {
    knownTaskIds.add(t.id)
    for (const k of t.subtaskKeys ?? []) knownTaskIds.add(k)
    for (const s of t.subtasks ?? []) knownTaskIds.add(s.id)
  }

  // Structured logged tasks (test badge / expandable subtasks) not already shown.
  const structuredExtra = loggedTasks.filter((t) => !knownTaskIds.has(t.id))

  // Track every id covered by the structured tasks (themselves + their subtasks)
  // so the fallback below doesn't render a duplicate bare row for them.
  const coveredIds = new Set(knownTaskIds)
  for (const t of structuredExtra) {
    coveredIds.add(t.id)
    for (const k of t.subtaskKeys ?? []) coveredIds.add(k)
    for (const s of t.subtasks ?? []) coveredIds.add(s.id)
  }

  // Fallback: any logged id with hours still not represented (e.g. the structured
  // fetch failed). Rendered as a bare row from the worklog summary so no hours go
  // invisible and the day's total always reconciles.
  const fallbackExtra: JiraTask[] = Object.keys(existingWorklogs)
    .filter((id) => (existingWorklogs[id] ?? 0) > 0 && !coveredIds.has(id))
    .map((id) => ({
      id,
      summary: loggedTaskSummaries[id] ?? '',
      isDefault: false,
      isExpandable: false,
    }))

  const extraLoggedTasks: JiraTask[] = [...structuredExtra, ...fallbackExtra]

  // "Other Tasks" section: tasks the user manually added (not already in the
  // common/assigned list) plus any task they logged time on this day that isn't
  // assigned to them — so previously-logged "other" tasks keep showing after a
  // reload. De-duped so a manually-added task that also has logged hours appears
  // once.
  const manualOtherTasks = otherTasks.filter((t) => !knownTaskIds.has(t.id) && taskMatchesSearch(t))
  const manualOtherIds = new Set(manualOtherTasks.map((t) => t.id))
  const otherSectionTasks: JiraTask[] = [
    ...manualOtherTasks,
    ...extraLoggedTasks.filter((t) => !manualOtherIds.has(t.id) && taskMatchesSearch(t)),
  ]

  const sessionHours = Object.values(hours).reduce<number>(
    (sum, v) => sum + (parseFloat(v) || 0),
    0
  )

  const existingTotal = Object.values(existingWorklogs).reduce((s, v) => s + v, 0)
  const totalLogged = existingTotal + sessionHours
  const isOverLimit = totalLogged > 8.001

  const canSubmit = !isOverLimit && !isSubmitting && sessionHours > 0

  // Load tasks on mount
  useEffect(() => {
    loadTasks()
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  // Load worklogs when date changes
  useEffect(() => {
    loadWorklogs(formatDateForApi(selectedDate))
  }, [selectedDate])  // eslint-disable-line react-hooks/exhaustive-deps

  async function loadTasks() {
    setIsLoadingTasks(true)
    setTaskError('')
    try {
      const [defaultTasks, assignedTasks] = await Promise.all([
        jiraService.getDefaultTasks(),
        jiraService.getAssignedTasks(),
      ])
      const all = [...defaultTasks, ...assignedTasks]
      setTasks(all)
      const initHours: HoursMap = {}
      const initComments: CommentMap = {}
      for (const t of all) {
        initHours[t.id] = ''
        initComments[t.id] = ''
        // Pre-initialize hours/comments for pre-loaded subtasks (isParentOnly tasks)
        for (const sub of t.subtasks ?? []) {
          initHours[sub.id] = ''
          initComments[sub.id] = ''
        }
      }
      setHours(initHours)
      setComments(initComments)
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 401) {
        setTaskError('Session expired. Please log in again.')
        logout()
      } else {
        setTaskError('Failed to load tasks. Check your connection and try again.')
      }
    } finally {
      setIsLoadingTasks(false)
    }
  }

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
    [tasks, loggedTasks, otherTasks, expandedIds]
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
    setSelectedDate(next)
    resetSession()
  }

  function jumpToToday() {
    if (isToday(selectedDate)) return
    setSelectedDate(new Date())
    resetSession()
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
    setSelectedDate(target)
    resetSession()
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

  function resetSession() {
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
      resetSession()
      setSuccessMsg(`Successfully logged ${sessionHours.toFixed(2).replace(/\.?0+$/, '')}h`)
      await loadWorklogs(formatDateForApi(selectedDate))
    } catch {
      // error handled globally — keep form intact
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="h-screen bg-gray-50 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="bg-jira-navy text-white shadow-md flex-shrink-0">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z" />
              </svg>
            </div>
            <div>
              <h1 className="font-bold text-sm leading-tight hidden sm:block">Jira Logging Pvt Ltd</h1>
              <h1 className="font-bold text-sm leading-tight sm:hidden">JLPL</h1>
              <span className="text-blue-200 text-xs">{teams.join(', ')} team{teams.length > 1 ? 's' : ''}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!isToday(selectedDate) && (
              <button
                onClick={jumpToToday}
                className="px-3 py-1.5 rounded-lg hover:bg-white/10 text-blue-200 hover:text-white transition-colors text-sm font-medium"
                title="Jump to today"
              >
                Today
              </button>
            )}
            {/* Search */}
            <div className="flex items-center">
              {showSearch && (
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setShowSearch(false)
                      setSearchQuery('')
                    }
                  }}
                  placeholder="Search tasks…"
                  className="w-44 sm:w-56 bg-white/10 border border-white/30 rounded-lg px-3 py-1.5 text-sm text-white placeholder-blue-200 focus:outline-none focus:border-white/60 transition-all"
                />
              )}
              <button
                onClick={() => {
                  if (showSearch) {
                    setShowSearch(false)
                    setSearchQuery('')
                  } else {
                    setShowSearch(true)
                  }
                }}
                className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors text-blue-200 hover:text-white"
                title={showSearch ? 'Close search' : 'Search tasks'}
                aria-label={showSearch ? 'Close search' : 'Search tasks'}
              >
                {showSearch ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                  </svg>
                )}
              </button>
            </div>
            <div ref={userMenuRef} className="relative">
              <button
                onClick={() => setShowUserMenu((v) => !v)}
                className="w-9 h-9 rounded-full bg-jira-navy text-white font-semibold text-sm flex items-center justify-center border-2 border-white/40 hover:border-white/70 hover:bg-white/10 transition-colors"
                title={userName || 'Account'}
                aria-haspopup="menu"
                aria-expanded={showUserMenu}
              >
                {getInitials(userName)}
              </button>
              {showUserMenu && (
                <div
                  role="menu"
                  className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-xl border border-gray-200 py-2 text-gray-800 z-50"
                >
                  <div className="px-4 py-2 border-b border-gray-100">
                    <p className="text-sm font-semibold leading-tight">{userName || 'Signed in'}</p>
                    {teams.length > 0 && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        {teams.join(', ')} team{teams.length > 1 ? 's' : ''}
                      </p>
                    )}
                  </div>
                  <button
                    role="menuitem"
                    onClick={() => {
                      setShowUserMenu(false)
                      setShowSettings(true)
                    }}
                    className="w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-gray-100 transition-colors text-left"
                  >
                    <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Settings
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => {
                      setShowUserMenu(false)
                      window.open('https://jira.eg.dk/secure/jiraerpOverviewPageWebworkAction.jspa', '_blank')
                    }}
                    className="w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-gray-100 transition-colors text-left border-t border-gray-100"
                  >
                    <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    Go to ERP
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => {
                      setShowUserMenu(false)
                      window.open('https://5177942.app.netsuite.com/app/center/card.nl?sc=-46&whence=', '_blank')
                    }}
                    className="w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-gray-100 transition-colors text-left"
                  >
                    <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    Go to NetSuite
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex flex-col max-w-3xl mx-auto w-full min-h-0">
        {/* Date nav + table header — fixed in flex layout, not scrolled */}
        <div className="flex-shrink-0 bg-white shadow-sm">
          <DateNav date={selectedDate} onNavigate={navigateDate} onSelectDate={selectDate} />
          <div className="flex items-center px-4 py-2 bg-gray-50 border-b border-gray-200 text-xs font-bold uppercase tracking-wider text-gray-400">
            <div className="flex-1">Task</div>
            <div className="w-20 text-center">Hours</div>
          </div>
        </div>

        {/* Success banner */}
        {successMsg && (
          <div className="bg-green-50 border-b border-green-200 px-4 py-2.5 flex items-center gap-2 text-sm text-green-700">
            <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            {successMsg}
            <button onClick={() => setSuccessMsg('')} className="ml-auto text-green-500 hover:text-green-700">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
            </button>
          </div>
        )}

        {/* Loading state */}
        {isLoadingTasks && (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-3">
            <svg className="animate-spin h-8 w-8 text-jira-blue" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <p className="text-sm">Loading tasks from Jira...</p>
          </div>
        )}

        {/* Error state */}
        {!isLoadingTasks && taskError && (
          <div className="m-4 bg-red-50 border border-red-200 rounded-xl p-6 text-center">
            <svg className="w-10 h-10 text-red-400 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <p className="text-sm text-red-700 mb-4">{taskError}</p>
            <div className="flex items-center justify-center gap-3">
              <button onClick={loadTasks} className="btn-secondary text-sm">Retry</button>
              <button onClick={logout} className="btn-secondary text-sm text-red-600 border-red-300 hover:bg-red-50">Reconfigure Token</button>
            </div>
          </div>
        )}

        {/* Task table */}
        {!isLoadingTasks && !taskError && (
          <div className="flex-1 flex flex-col min-h-0 relative">
            {/* Worklog loading overlay */}
            {isLoadingWorklogs && (
              <div className="absolute inset-0 bg-white/80 z-40 flex flex-col items-center justify-center gap-3">
                <svg className="animate-spin h-8 w-8 text-jira-blue" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <p className="text-xs text-gray-600">Loading time entries...</p>
              </div>
            )}
            <div className="flex-1 overflow-y-auto">

            {worklogError && (
              <div className="px-4 py-2 text-xs text-amber-600 bg-amber-50 border-b border-amber-100">
                {worklogError}
              </div>
            )}

            {/* Common Tasks */}
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

            {/* Assigned Tasks */}
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
              <div className="text-center py-16 text-gray-400">
                <svg className="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <p className="text-sm">No tasks found</p>
              </div>
            )}

            <div className="h-2" />
            </div>
          </div>
        )}

        {/* Summary bar */}
        {!isLoadingTasks && !taskError && (
          <SummaryBar
            sessionHours={sessionHours}
            existingTotal={existingTotal}
            isOverLimit={isOverLimit}
            actualTotal={totalLogged}
            canSubmit={canSubmit}
            isSubmitting={isSubmitting}
            onSubmit={() => setShowConfirm(true)}
          />
        )}
      </div>

      {/* Confirm dialog */}
      {showConfirm && (
        <ConfirmDialog
          date={selectedDate}
          sessionHours={sessionHours}
          onConfirm={handleSubmit}
          onCancel={() => setShowConfirm(false)}
        />
      )}

      {/* Settings drawer */}
      {showSettings && (
        <SettingsDrawer
          teams={teams}
          currentPat={getPat()}
          onClose={() => setShowSettings(false)}
          onLogout={() => {
            setShowSettings(false)
            logout()
          }}
        />
      )}

      {/* Edit worklogs modal */}
      {editingTask && (
        <WorklogEditModal
          taskId={editingTask.id}
          taskTitle={editingTask.title}
          date={selectedDate}
          onClose={() => setEditingTask(null)}
          onChanged={(delta) => handleWorklogChanged(editingTask.id, delta)}
        />
      )}
    </div>
  )
}

// --- Sub-components ---

function GroupHeader({ label }: { label: string }) {
  return (
    <div className="px-4 py-1.5 text-[11px] font-bold uppercase tracking-widest text-gray-400 bg-gray-50 border-b border-gray-200">
      {label}
    </div>
  )
}

// "Log for Other Task" control: a button that expands into a Task ID input so the
// user can add a task that isn't in their common/assigned list.
function OtherTaskAdder({
  onAdd,
  isAdding,
  error,
  onClearError,
}: {
  onAdd: (taskId: string) => Promise<boolean>
  isAdding: boolean
  error: string
  onClearError: () => void
}) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  function close() {
    setOpen(false)
    setValue('')
    onClearError()
  }

  async function submit() {
    if (!value.trim() || isAdding) return
    const ok = await onAdd(value)
    if (ok) {
      setValue('')
      setOpen(false)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 w-full px-4 py-2.5 text-sm font-medium text-jira-blue hover:bg-blue-50 transition-colors border-b border-gray-100"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        Log for other task
      </button>
    )
  }

  return (
    <div className="px-4 py-3 border-b border-gray-100 bg-blue-50/40">
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            if (error) onClearError()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
            if (e.key === 'Escape') close()
          }}
          placeholder="Enter Task ID (e.g. DMO-13745)"
          className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-jira-blue focus:border-transparent bg-white uppercase placeholder:normal-case"
        />
        <button
          type="button"
          onClick={submit}
          disabled={!value.trim() || isAdding}
          className="btn-primary text-sm px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
        >
          {isAdding && (
            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
          Add
        </button>
        <button
          type="button"
          onClick={close}
          className="btn-secondary text-sm px-3 py-2"
        >
          Cancel
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
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

function ConfirmDialog({
  date,
  sessionHours,
  onConfirm,
  onCancel,
}: {
  date: Date
  sessionHours: number
  onConfirm: () => void
  onCancel: () => void
}) {
  const dateStr = date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 px-4 pb-4 sm:pb-0">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-jira-blue-light rounded-full flex items-center justify-center">
            <svg className="w-5 h-5 text-jira-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h3 className="font-semibold text-gray-800">Confirm Time Log</h3>
            <p className="text-xs text-gray-500">{dateStr}</p>
          </div>
        </div>
        <p className="text-sm text-gray-600 mb-6">
          You are about to log <strong>{sessionHours.toFixed(2).replace(/\.?0+$/, '')} hours</strong>. This action cannot be undone.
        </p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="btn-secondary flex-1">Cancel</button>
          <button onClick={onConfirm} className="btn-primary flex-1">Submit</button>
        </div>
      </div>
    </div>
  )
}

function SettingsDrawer({
  teams,
  currentPat,
  onClose,
  onLogout,
}: {
  teams: string[]
  currentPat: string
  onClose: () => void
  onLogout: () => void
}) {
  const [copied, setCopied] = useState(false)

  const handleCopyPat = () => {
    navigator.clipboard.writeText(currentPat)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-t-2xl shadow-2xl w-full max-w-3xl p-6 pb-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />
        <h3 className="font-semibold text-gray-800 mb-1">Settings</h3>
        <p className="text-sm text-gray-500 mb-5">Logged in as team <strong>{teams.join(', ')}</strong></p>

        {/* Current token display */}
        <div className="mb-5 p-4 bg-gray-50 rounded-xl border border-gray-200">
          <p className="text-xs font-semibold text-gray-600 mb-2">Current Token</p>
          <div className="flex items-center gap-2">
            <input
              type="password"
              value={currentPat}
              readOnly
              className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white text-gray-700"
            />
            <button
              onClick={handleCopyPat}
              className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                copied
                  ? 'bg-green-100 text-green-700 border border-green-300'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300 border border-gray-300'
              }`}
            >
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>
        </div>

        <button
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 transition-colors text-sm font-medium"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Sign out &amp; change token
        </button>

        <p className="text-center text-xs text-gray-400 mt-6">✨ Made with love, Dynaway. ✨</p>
      </div>
    </div>
  )
}
