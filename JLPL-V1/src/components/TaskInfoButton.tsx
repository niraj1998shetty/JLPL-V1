import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { JiraTask } from '../types/jira'
import EstimatePanel from './EstimatePanel'

interface TaskInfoButtonProps {
  task: JiraTask
  show: boolean
}

// Small (i) button that opens a portal-rendered popup with the task's estimate/
// logged-hours/story-points breakdown. Shared by the day view's TaskRow and the
// week grid's label cell so both offer the same task details.
export default function TaskInfoButton({ task, show }: TaskInfoButtonProps) {
  const infoButtonRef = useRef<HTMLButtonElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const [showPopup, setShowPopup] = useState(false)
  const [popupPos, setPopupPos] = useState({ top: 0, left: 0 })

  const hasEstimateData =
    show &&
    (task.estimatedHours !== undefined ||
      task.remainingHours !== undefined ||
      task.totalLoggedHours !== undefined ||
      task.storyPoints !== undefined ||
      task.updatedAt !== undefined)

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

  if (!hasEstimateData) return null

  return (
    <>
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
      {showPopup &&
        createPortal(
          <div
            ref={popupRef}
            className="fixed z-50 w-56 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 p-3"
            style={{ top: popupPos.top, left: popupPos.left }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">
              {task.id}
            </p>
            <EstimatePanel
              estimatedHours={task.estimatedHours ?? null}
              remainingHours={task.remainingHours ?? null}
              totalLoggedHours={task.totalLoggedHours ?? null}
              storyPoints={task.storyPoints ?? null}
              updatedAt={task.updatedAt ?? null}
            />
          </div>,
          document.body
        )}
    </>
  )
}
