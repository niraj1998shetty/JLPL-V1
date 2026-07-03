import { useEffect, useState } from 'react'
import { jiraService } from '../services/jiraService'
import { JiraTimeEntry } from '../types/jira'

interface WorklogEditModalProps {
  taskId: string
  taskTitle: string
  date: Date
  onClose: () => void
  // Called after a successful save or delete. `deltaHours` may be negative.
  onChanged: (deltaHours: number) => void
}

function formatDateForApi(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function formatStartedTime(started?: string): string {
  if (!started) return ''
  // started format: "2024-01-15T09:00:00.000+0000"
  const d = new Date(started)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function WorklogEditModal({
  taskId,
  taskTitle,
  date,
  onClose,
  onChanged,
}: WorklogEditModalProps) {
  const dateStr = formatDateForApi(date)
  const [entries, setEntries] = useState<JiraTimeEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [actionError, setActionError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError('')
      try {
        const list = await jiraService.getTaskWorklogs(taskId, dateStr)
        if (!cancelled) setEntries(list)
      } catch {
        if (!cancelled) setError('Failed to load worklog entries.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [taskId, dateStr])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  async function handleSave(id: string, hours: number, comment: string) {
    setSavingId(id)
    setActionError('')
    try {
      const old = entries.find((e) => e.id === id)
      await jiraService.updateWorklog(taskId, id, hours, dateStr, comment)
      const delta = hours - (old?.hours ?? 0)
      setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, hours, comment } : e)))
      onChanged(delta)
    } catch {
      setActionError('Failed to save changes. Please try again.')
    } finally {
      setSavingId(null)
    }
  }

  async function handleConfirmDelete(id: string) {
    setDeletingId(id)
    setActionError('')
    try {
      const old = entries.find((e) => e.id === id)
      await jiraService.deleteWorklog(taskId, id)
      setEntries((prev) => prev.filter((e) => e.id !== id))
      onChanged(-(old?.hours ?? 0))
    } catch {
      setActionError('Failed to delete entry. Please try again.')
    } finally {
      setDeletingId(null)
      setConfirmDeleteId(null)
    }
  }

  const headerDate = date.toLocaleDateString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-gray-200 dark:border-gray-700">
          <div className="min-w-0">
            <h3 className="font-semibold text-gray-800 dark:text-gray-100">Edit logged hours</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
              {taskTitle} <span className="text-gray-400">·</span> {headerDate}
            </p>
          </div>
          <button
            onClick={onClose}
            className="ml-3 p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 flex-shrink-0"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading && (
            <div className="flex items-center justify-center py-8 text-gray-400">
              <svg className="animate-spin h-6 w-6 text-jira-blue" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
          )}

          {!loading && error && (
            <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
              {error}
            </p>
          )}

          {!loading && !error && entries.length === 0 && (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
              No worklog entries for this day.
            </p>
          )}

          {actionError && (
            <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 mb-3">
              {actionError}
            </p>
          )}

          <div className="space-y-2">
            {entries.map((entry) => (
              <EntryRow
                key={entry.id}
                entry={entry}
                isSaving={savingId === entry.id}
                isBusy={deletingId === entry.id || confirmDeleteId === entry.id}
                onSave={(h, c) => handleSave(entry.id!, h, c)}
                onDeleteRequest={() => setConfirmDeleteId(entry.id!)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Confirm delete dialog */}
      {confirmDeleteId && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4"
          onClick={() => setConfirmDeleteId(null)}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-100 dark:bg-red-900/40 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h4 className="font-semibold text-gray-800 dark:text-gray-100">Delete this entry?</h4>
                <p className="text-xs text-gray-500 dark:text-gray-400">This cannot be undone.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDeleteId(null)}
                disabled={deletingId === confirmDeleteId}
                className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleConfirmDelete(confirmDeleteId)}
                disabled={deletingId === confirmDeleteId}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-50"
              >
                {deletingId === confirmDeleteId ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

interface EntryRowProps {
  entry: JiraTimeEntry
  isSaving: boolean
  isBusy: boolean
  onSave: (hours: number, comment: string) => void
  onDeleteRequest: () => void
}

function EntryRow({ entry, isSaving, isBusy, onSave, onDeleteRequest }: EntryRowProps) {
  const [hoursStr, setHoursStr] = useState<string>(String(entry.hours))
  const [comment, setComment] = useState<string>(entry.comment ?? '')

  // Re-sync local state if entry prop changes (e.g. after a save)
  useEffect(() => {
    setHoursStr(String(entry.hours))
    setComment(entry.comment ?? '')
  }, [entry.hours, entry.comment])

  const hoursNum = parseFloat(hoursStr)
  const valid = Number.isFinite(hoursNum) && hoursNum > 0 && hoursNum <= 24
  const dirty = hoursStr !== String(entry.hours) || comment !== (entry.comment ?? '')
  const timeLabel = formatStartedTime(entry.started)

  return (
    <div className="border border-gray-200 dark:border-gray-600 rounded-lg p-3 bg-white dark:bg-gray-700 space-y-2">
      <div className="flex items-center gap-2">
        <input
          type="number"
          step="0.25"
          min="0"
          max="24"
          inputMode="decimal"
          value={hoursStr}
          onChange={(e) => setHoursStr(e.target.value)}
          onKeyDown={(e) => {
            if (['-', '+', 'e', 'E'].includes(e.key)) e.preventDefault()
          }}
          className="w-16 px-2 py-1.5 text-sm text-center border border-gray-300 dark:border-gray-500 rounded focus:outline-none focus:ring-1 focus:ring-jira-blue bg-white dark:bg-gray-600 dark:text-gray-100"
        />
        <span className="text-xs text-gray-500 dark:text-gray-400">h</span>
        {timeLabel && (
          <span className="text-[10px] text-gray-400 dark:text-gray-500 ml-1 whitespace-nowrap">at {timeLabel}</span>
        )}
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => onSave(hoursNum, comment)}
          disabled={!dirty || !valid || isSaving || isBusy}
          className="px-3 py-1.5 text-xs font-medium text-white bg-jira-blue hover:bg-jira-blue/90 rounded disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSaving ? 'Saving...' : 'Save'}
        </button>
        <button
          type="button"
          onClick={onDeleteRequest}
          disabled={isSaving || isBusy}
          className="p-1.5 text-red-500 hover:bg-red-50 rounded disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="Delete entry"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" />
          </svg>
        </button>
      </div>
      <input
        type="text"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Comment (optional)"
          className="w-full px-2 py-1.5 text-xs border border-gray-200 dark:border-gray-500 rounded focus:outline-none focus:ring-1 focus:ring-jira-blue bg-white dark:bg-gray-600 dark:text-gray-100 dark:placeholder-gray-400"
      />
    </div>
  )
}
