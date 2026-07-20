import { useState } from 'react'
import { JiraTask } from '../types/jira'
import HoursInput from './HoursInput'
import TaskInfoButton from './TaskInfoButton'

interface TaskRowProps {
  task: JiraTask
  isSubtask?: boolean
  isExpandable?: boolean
  isExpanded?: boolean
  isLoadingExpand?: boolean
  hours: string
  comment: string
  existingHours: number
  ownLoggedHours?: number
  pendingChildHours?: number
  showEstimate?: boolean
  canEdit?: boolean
  onHoursChange: (taskId: string, hours: string) => void
  onCommentChange: (taskId: string, comment: string) => void
  onToggleExpand?: (taskId: string) => void
  onEdit?: (taskId: string) => void
}

export default function TaskRow({
  task,
  isSubtask = false,
  isExpandable = false,
  isExpanded = false,
  isLoadingExpand = false,
  hours,
  comment,
  existingHours,
  ownLoggedHours,
  pendingChildHours = 0,
  showEstimate = false,
  canEdit = false,
  onHoursChange,
  onCommentChange,
  onToggleExpand,
  onEdit,
}: TaskRowProps) {
  const [showPlaceholder, setShowPlaceholder] = useState(true)
  const hasHours = parseFloat(hours) > 0

  function handleRowClick() {
    if (isExpandable && !isSubtask) {
      onToggleExpand?.(task.id)
    }
  }

  return (
    <div
      className={`border-b border-gray-100 dark:border-gray-700 last:border-0 ${
        isSubtask ? 'bg-gray-100 dark:bg-gray-700/50' : 'bg-white dark:bg-gray-800'
      }`}
    >
      <div
        className={`flex items-start gap-2 py-2.5 pr-3 ${isSubtask ? 'pl-9' : 'pl-3'} ${
          isExpandable && !isSubtask ? 'cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors' : ''
        }`}
        onClick={handleRowClick}
      >
        {/* Expand chevron or loader */}
        {isExpandable ? (
          isLoadingExpand ? (
            <div className="mt-0.5 flex-shrink-0 w-5 flex items-center justify-center">
              <svg className="animate-spin h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
          ) : (
            <div className="mt-0.5 flex-shrink-0 w-5 text-gray-400 group-hover:text-gray-600">
              <svg
                className={`w-4 h-4 transition-transform duration-150 ${isExpanded ? 'rotate-90' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          )
        ) : (
          <div className="w-5 flex-shrink-0" />
        )}

        {/* Task info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <a
              href={`https://jira.eg.dk/browse/${task.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-bold text-jira-blue hover:underline flex-shrink-0"
              onClick={(e) => e.stopPropagation()}
            >
              {task.id}
            </a>
            {task.taskType === 'test' && (
              <span className="text-[9px] font-bold tracking-wide px-1.5 py-0.5 rounded bg-amber-200 text-amber-900 border border-amber-300 flex-shrink-0">
                TEST
              </span>
            )}
            <span className="text-xs text-gray-700 dark:text-gray-300 truncate">{task.summary}</span>
            <TaskInfoButton task={task} show={showEstimate} />
          </div>

          {/* Comment input */}
          {hasHours && (
            <div className="mt-1.5" onClick={(e) => e.stopPropagation()}>
              <input
                type="text"
                value={comment}
                onChange={(e) => onCommentChange(task.id, e.target.value)}
                placeholder="Add a comment (optional)"
                className="w-full px-2 py-1 text-xs border border-gray-200 dark:border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-jira-blue focus:border-transparent bg-white dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-500"
              />
            </div>
          )}
        </div>

        {/* Hours column */}
        <div
          className="flex flex-col items-end flex-shrink-0 w-24"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-1">
            {canEdit && (ownLoggedHours ?? 0) > 0 && onEdit && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onEdit(task.id)
                }}
                className="flex-shrink-0 text-gray-400 hover:text-jira-blue transition-colors"
                aria-label="Edit logged hours"
                title="Edit logged hours"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </button>
            )}
            <HoursInput
              value={hours}
              onChange={(v) => onHoursChange(task.id, v)}
              onFocus={() => setShowPlaceholder(false)}
              onBlur={() => setShowPlaceholder(true)}
              placeholder={showPlaceholder ? "0" : ""}
            />
          </div>
          {existingHours > 0 && (
            <span className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5 whitespace-nowrap">{existingHours}h logged</span>
          )}
          {pendingChildHours > 0 && (
            <span className="text-[10px] text-jira-blue mt-0.5 whitespace-nowrap" title="Unsaved hours on subtasks">
              +{pendingChildHours.toFixed(2).replace(/\.?0+$/, '')}h on subtasks
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
