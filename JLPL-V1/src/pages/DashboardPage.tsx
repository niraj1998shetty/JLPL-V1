import { useCallback, useEffect, useRef, useState } from 'react'
import DateNav from '../components/DateNav'
import SummaryBar from '../components/SummaryBar'
import TaskRow from '../components/TaskRow'
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

function isToday(date: Date): boolean {
  const today = new Date()
  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  )
}

export default function DashboardPage() {
  const { logout, team, userName } = useAuth()

  const [selectedDate, setSelectedDate] = useState(new Date())
  const [tasks, setTasks] = useState<JiraTask[]>([])
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [hours, setHours] = useState<HoursMap>({})
  const [comments, setComments] = useState<CommentMap>({})
  const [existingWorklogs, setExistingWorklogs] = useState<Record<string, number>>({})

  const [isLoadingTasks, setIsLoadingTasks] = useState(true)
  const [isLoadingWorklogs, setIsLoadingWorklogs] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [taskError, setTaskError] = useState('')
  const [worklogError, setWorklogError] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')

  const abortRef = useRef<AbortController | null>(null)
  const dateRef = useRef(selectedDate)
  dateRef.current = selectedDate

  // Derived values
  const commonTasks = tasks.filter((t) => t.isDefault)
  const assignedTasks = tasks.filter((t) => !t.isDefault)

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
      const entries = await jiraService.getExistingWorklogs(dateStr)
      if (dateStr !== formatDateForApi(dateRef.current)) return
      const map: Record<string, number> = {}
      for (const e of entries) map[e.taskId] = (map[e.taskId] ?? 0) + e.hours
      setExistingWorklogs(map)
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
      const task = tasks.find((t) => t.id === taskId)
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
        try {
          const subtasks = await jiraService.getSubtasks(taskId)
          setTasks((prev) =>
            prev.map((t) => (t.id === taskId ? { ...t, subtasks } : t))
          )
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
        }
      }
    },
    [tasks, expandedIds]
  )

  function getCollapsedExistingHours(task: JiraTask): number {
    const own = existingWorklogs[task.id] ?? 0
    // Pre-loaded subtasks (isParentOnly tasks)
    const subtaskHours = (task.subtasks ?? []).reduce((s, sub) => s + (existingWorklogs[sub.id] ?? 0), 0)
    // Known subtask keys from default task fetch (direct children, not yet expanded)
    const subtaskKeyHours = (task.subtaskKeys ?? []).reduce((s, key) => s + (existingWorklogs[key] ?? 0), 0)
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
    setSuccessMsg('')
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
              <h1 className="font-bold text-sm leading-tight">Jira Log Private LTD</h1>
              <span className="text-blue-200 text-xs">{team} team</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {userName && <span className="hidden sm:block text-xs text-blue-200 mr-1">{userName}</span>}
            <button
              onClick={() => setShowSettings(true)}
              className="p-1.5 rounded-lg hover:bg-white/10 text-blue-200 hover:text-white transition-colors"
              title="Settings"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex flex-col max-w-3xl mx-auto w-full min-h-0">
        {/* Date nav + table header — fixed in flex layout, not scrolled */}
        <div className="flex-shrink-0 bg-white shadow-sm">
          <DateNav date={selectedDate} onNavigate={navigateDate} />
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
          <div className="flex-1 overflow-y-auto">
            {/* Worklog loading indicator */}
            {isLoadingWorklogs && (
              <div className="px-4 py-2 text-xs text-gray-400 flex items-center gap-1.5 border-b border-gray-100">
                <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Loading time entries...
              </div>
            )}

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
                    onHoursChange={handleHoursChange}
                    onCommentChange={handleCommentChange}
                    onToggleExpand={handleToggleExpand}
                    getCollapsedExistingHours={getCollapsedExistingHours}
                    showEstimate={false}
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
                    onHoursChange={handleHoursChange}
                    onCommentChange={handleCommentChange}
                    onToggleExpand={handleToggleExpand}
                    getCollapsedExistingHours={getCollapsedExistingHours}
                    showEstimate={true}
                  />
                ))}
              </section>
            )}

            {commonTasks.length === 0 && assignedTasks.length === 0 && (
              <div className="text-center py-16 text-gray-400">
                <svg className="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <p className="text-sm">No tasks found</p>
              </div>
            )}

            <div className="h-2" />
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
          team={team}
          onClose={() => setShowSettings(false)}
          onLogout={() => {
            setShowSettings(false)
            logout()
          }}
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

interface TaskSectionProps {
  task: JiraTask
  hours: HoursMap
  comments: CommentMap
  existingWorklogs: Record<string, number>
  expandedIds: Set<string>
  showEstimate: boolean
  onHoursChange: (id: string, v: string) => void
  onCommentChange: (id: string, v: string) => void
  onToggleExpand: (id: string) => void
  getCollapsedExistingHours: (task: JiraTask) => number
}

function TaskSection({
  task,
  hours,
  comments,
  existingWorklogs,
  expandedIds,
  showEstimate,
  onHoursChange,
  onCommentChange,
  onToggleExpand,
  getCollapsedExistingHours,
}: TaskSectionProps) {
  const isExpanded = expandedIds.has(task.id)
  const existingHours = isExpanded
    ? (existingWorklogs[task.id] ?? 0)
    : getCollapsedExistingHours(task)

  return (
    <>
      <TaskRow
        task={task}
        isExpandable={task.isExpandable}
        isExpanded={isExpanded}
        hours={hours[task.id] ?? ''}
        comment={comments[task.id] ?? ''}
        existingHours={existingHours}
        showEstimate={showEstimate}
        onHoursChange={onHoursChange}
        onCommentChange={onCommentChange}
        onToggleExpand={onToggleExpand}
      />
      {task.isExpandable && isExpanded && task.subtasks?.map((sub) => (
        <TaskRow
          key={sub.id}
          task={sub}
          isSubtask
          hours={hours[sub.id] ?? ''}
          comment={comments[sub.id] ?? ''}
          existingHours={existingWorklogs[sub.id] ?? 0}
          onHoursChange={onHoursChange}
          onCommentChange={onCommentChange}
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
  team,
  onClose,
  onLogout,
}: {
  team: string
  onClose: () => void
  onLogout: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-t-2xl shadow-2xl w-full max-w-3xl p-6 pb-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />
        <h3 className="font-semibold text-gray-800 mb-1">Settings</h3>
        <p className="text-sm text-gray-500 mb-5">Logged in as team <strong>{team}</strong></p>

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
