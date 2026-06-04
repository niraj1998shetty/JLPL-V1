import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { JiraTask } from '../types/jira'
import EstimatePanel from './EstimatePanel'

interface TaskRowProps {
  task: JiraTask
  isSubtask?: boolean
  isExpandable?: boolean
  isExpanded?: boolean
  hours: string
  comment: string
  existingHours: number
  showEstimate?: boolean
  onHoursChange: (taskId: string, hours: string) => void
  onCommentChange: (taskId: string, comment: string) => void
  onToggleExpand?: (taskId: string) => void
}

export default function TaskRow({
  task,
  isSubtask = false,
  isExpandable = false,
  isExpanded = false,
  hours,
  comment,
  existingHours,
  showEstimate = false,
  onHoursChange,
  onCommentChange,
  onToggleExpand,
}: TaskRowProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const infoButtonRef = useRef<HTMLButtonElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const [showPopup, setShowPopup] = useState(false)
  const [popupPos, setPopupPos] = useState({ top: 0, left: 0 })
  const hasHours = parseFloat(hours) > 0

  const hasEstimateData =
    showEstimate &&
    (task.estimatedHours !== undefined ||
      task.remainingHours !== undefined ||
      task.totalLoggedHours !== undefined ||
      task.storyPoints !== undefined)

  function handleInfoClick(e: React.MouseEvent) {
    e.stopPropagation()
    if (!infoButtonRef.current) return
    const rect = infoButtonRef.current.getBoundingClientRect()
    setPopupPos({
      top: rect.bottom + 6,
      left: Math.min(rect.left - 180, window.innerWidth - 250),
    })
    setShowPopup((v) => !v)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (['-', '+', 'e', 'E'].includes(e.key)) e.preventDefault()
  }

  function handleWheel(e: React.WheelEvent<HTMLInputElement>) {
    ;(e.currentTarget as HTMLInputElement).blur()
  }

  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    const handler = (e: WheelEvent) => e.preventDefault()
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [])

  useEffect(() => {
    if (!showPopup) return
    function onDown(e: MouseEvent) {
      if (
        !popupRef.current?.contains(e.target as Node) &&
        !infoButtonRef.current?.contains(e.target as Node)
      ) {
        setShowPopup(false)
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setShowPopup(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [showPopup])

  return (
    <div
      className={`border-b border-gray-100 last:border-0 ${
        isSubtask ? 'bg-gray-50/60' : 'bg-white'
      } ${isExpandable ? 'cursor-pointer' : ''}`}
      onClick={isExpandable ? () => onToggleExpand?.(task.id) : undefined}
    >
      <div
        className={`flex items-start gap-2 py-2.5 pr-3 ${isSubtask ? 'pl-9' : 'pl-3'}`}
      >
        {/* Expand chevron */}
        {isExpandable ? (
          <div className="mt-0.5 flex-shrink-0 w-5 text-gray-400">
            <svg
              className={`w-4 h-4 transition-transform duration-150 ${isExpanded ? 'rotate-90' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
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
              <span className="text-[9px] font-bold tracking-wide px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 flex-shrink-0">
                TEST
              </span>
            )}
            <span className="text-xs text-gray-700 truncate">{task.summary}</span>
            {hasEstimateData && (
              <button
                ref={infoButtonRef}
                type="button"
                onClick={handleInfoClick}
                className="flex-shrink-0 text-gray-400 hover:text-jira-blue transition-colors"
                aria-label="Show estimate details"
              >
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
              </button>
            )}
          </div>

          {/* Comment input */}
          {hasHours && (
            <div className="mt-1.5" onClick={(e) => e.stopPropagation()}>
              <input
                type="text"
                value={comment}
                onChange={(e) => onCommentChange(task.id, e.target.value)}
                placeholder="Add a comment (optional)"
                className="w-full px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-jira-blue focus:border-transparent bg-white"
              />
            </div>
          )}
        </div>

        {/* Hours column */}
        <div
          className="flex flex-col items-center flex-shrink-0 w-20"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            ref={inputRef}
            type="number"
            step="0.25"
            min="0"
            max="24"
            inputMode="decimal"
            value={hours}
            onChange={(e) => onHoursChange(task.id, e.target.value)}
            onKeyDown={handleKeyDown}
            onWheel={handleWheel}
            placeholder="0"
            className="w-16 px-2 py-1.5 text-sm text-center border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-jira-blue focus:border-transparent bg-white"
          />
          {existingHours > 0 && (
            <span className="text-[10px] text-gray-400 mt-0.5 whitespace-nowrap">{existingHours}h logged</span>
          )}
        </div>
      </div>

      {/* Estimate popup rendered via portal so it isn't clipped by overflow:hidden parents */}
      {showPopup &&
        hasEstimateData &&
        createPortal(
          <div
            ref={popupRef}
            className="fixed z-50 w-56 bg-white rounded-xl shadow-xl border border-gray-200 p-3"
            style={{ top: popupPos.top, left: popupPos.left }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">
              {task.id}
            </p>
            <EstimatePanel
              estimatedHours={task.estimatedHours ?? null}
              remainingHours={task.remainingHours ?? null}
              totalLoggedHours={task.totalLoggedHours ?? null}
              storyPoints={task.storyPoints ?? null}
            />
          </div>,
          document.body
        )}
    </div>
  )
}
