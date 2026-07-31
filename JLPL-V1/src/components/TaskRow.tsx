import { useState } from 'react'
import { JiraTask } from '../types/jira'
import HoursInput from './HoursInput'
import TaskInfoButton from './TaskInfoButton'

interface TaskRowProps {
  task: JiraTask
  /** Key this row's hours/comment are stored under — `task.id` unless it's a duplicate. */
  rowKey: string
  isSubtask?: boolean
  isExpandable?: boolean
  isExpanded?: boolean
  isLoadingExpand?: boolean
  /**
   * A second entry for the same task. Renders as a bare logging line: no children,
   * no estimates, and none of the already-logged indicators that belong to the task
   * as a whole rather than to this one entry.
   */
  isDuplicate?: boolean
  hours: string
  comment: string
  existingHours: number
  ownLoggedHours?: number
  pendingChildHours?: number
  showEstimate?: boolean
  canEdit?: boolean
  onHoursChange: (rowKey: string, hours: string) => void
  onCommentChange: (rowKey: string, comment: string) => void
  onToggleExpand?: (taskId: string) => void
  onEdit?: (taskId: string) => void
  onDuplicate?: (taskId: string) => void
  onRemoveDuplicate?: (taskId: string, rowKey: string) => void
}

export default function TaskRow({
  task,
  rowKey,
  isSubtask = false,
  isExpandable = false,
  isExpanded = false,
  isLoadingExpand = false,
  isDuplicate = false,
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
  onDuplicate,
  onRemoveDuplicate,
}: TaskRowProps) {
  const [showPlaceholder, setShowPlaceholder] = useState(true)
  // A duplicate exists purely to carry its own comment, so don't make the user
  // enter hours first to reveal the field.
  const showComment = isDuplicate || parseFloat(hours) > 0
  const canExpand = isExpandable && !isSubtask && !isDuplicate
  // The row is "being logged" while its hours field has focus or already holds a
  // value; a second entry only makes sense then, so the duplicate button is hidden
  // (but keeps its slot) the rest of the time. `showPlaceholder` is false on focus.
  const isLogging = !showPlaceholder || parseFloat(hours) > 0

  function handleRowClick() {
    if (canExpand) onToggleExpand?.(task.id)
  }

  return (
    <div
      className={`border-b border-gray-100 dark:border-gray-700 last:border-0 ${
        isSubtask ? 'bg-gray-100 dark:bg-gray-700/50' : 'bg-white dark:bg-gray-800'
      }`}
    >
      <div
        className={`flex items-start gap-2 py-2.5 pr-3 ${isSubtask ? 'pl-9' : 'pl-3'} ${
          canExpand ? 'cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors' : ''
        }`}
        onClick={handleRowClick}
      >
        {/* Expand chevron, loader, or duplicate marker */}
        {isDuplicate ? (
          <div className="mt-0.5 flex-shrink-0 w-5 text-gray-300 dark:text-gray-600 flex items-center justify-center" aria-hidden="true">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v8a4 4 0 004 4h11m0 0l-4-4m4 4l-4 4" />
            </svg>
          </div>
        ) : isExpandable ? (
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
              className={`text-xs font-bold hover:underline flex-shrink-0 ${
                isDuplicate ? 'text-jira-blue/60' : 'text-jira-blue'
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              {task.id}
            </a>
            {isDuplicate ? (
              <span className="text-[10px] text-gray-400 dark:text-gray-500 italic truncate">extra entry</span>
            ) : (
              <>
                {task.taskType === 'test' && (
                  <span className="text-[9px] font-bold tracking-wide px-1.5 py-0.5 rounded bg-amber-200 text-amber-900 border border-amber-300 flex-shrink-0">
                    TEST
                  </span>
                )}
                <span className="text-xs text-gray-700 dark:text-gray-300 truncate">{task.summary}</span>
                <TaskInfoButton task={task} show={showEstimate} />
              </>
            )}
          </div>

          {/* Comment input */}
          {showComment && (
            <div className="mt-1.5" onClick={(e) => e.stopPropagation()}>
              <input
                type="text"
                value={comment}
                onChange={(e) => onCommentChange(rowKey, e.target.value)}
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
            {isDuplicate ? (
              <button
                type="button"
                onClick={() => onRemoveDuplicate?.(task.id, rowKey)}
                className="flex-shrink-0 text-gray-400 hover:text-red-500 transition-colors"
                aria-label="Remove this entry"
                title="Remove this entry"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            ) : (
              <>
                {/* Not gated on canEdit: that's the 30-day *edit* window, whereas
                    entering hours — and so adding a second entry — is allowed for any
                    non-future date. */}
                {onDuplicate && (
                  <button
                    type="button"
                    // Without this the mousedown blurs the hours field, which hides the
                    // button before the click lands on it.
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={(e) => {
                      e.stopPropagation()
                      onDuplicate(task.id)
                    }}
                    className={`flex-shrink-0 text-gray-400 hover:text-jira-blue transition-colors ${
                      isLogging ? '' : 'invisible pointer-events-none'
                    }`}
                    aria-hidden={!isLogging}
                    tabIndex={isLogging ? 0 : -1}
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
              </>
            )}
            <HoursInput
              value={hours}
              onChange={(v) => onHoursChange(rowKey, v)}
              onFocus={() => setShowPlaceholder(false)}
              onBlur={() => setShowPlaceholder(true)}
              placeholder={showPlaceholder ? "0" : ""}
            />
          </div>
          {/* Already-logged and rolled-up-child hours describe the task as a whole,
              so they're shown once on the primary row rather than on every entry. */}
          {!isDuplicate && existingHours > 0 && (
            <span className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5 whitespace-nowrap">{existingHours}h logged</span>
          )}
          {!isDuplicate && pendingChildHours > 0 && (
            <span className="text-[10px] text-jira-blue mt-0.5 whitespace-nowrap" title="Unsaved hours on subtasks">
              +{pendingChildHours.toFixed(2).replace(/\.?0+$/, '')}h on subtasks
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
