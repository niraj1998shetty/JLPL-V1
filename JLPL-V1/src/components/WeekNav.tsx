import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { formatWeekRangeLabel, isSameWeek, WeekRange } from '../utils/week'
import WeekPicker from './WeekPicker'

interface WeekNavProps {
  range: WeekRange
  onNavigateWeek: (dir: -1 | 1) => void
  /** Jump straight to the week starting on the given Monday */
  onSelectWeek: (monday: Date) => void
}

const POPOVER_WIDTH = 320 // matches w-80 in WeekPicker

export default function WeekNav({ range, onNavigateWeek, onSelectWeek }: WeekNavProps) {
  const isCurrentWeek = isSameWeek(range.monday, new Date())

  const labelButtonRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const [showPicker, setShowPicker] = useState(false)
  const [popoverPos, setPopoverPos] = useState({ top: 0, left: 0 })

  // Same positioning as DateNav's calendar: centred under the label, clamped to the viewport.
  function handleLabelClick() {
    if (!labelButtonRef.current) return
    const rect = labelButtonRef.current.getBoundingClientRect()
    let left = rect.left + rect.width / 2 - POPOVER_WIDTH / 2
    left = Math.max(8, Math.min(left, window.innerWidth - POPOVER_WIDTH - 8))
    setPopoverPos({ top: rect.bottom + 6, left })
    setShowPicker((v) => !v)
  }

  function handleSelect(monday: Date) {
    setShowPicker(false)
    onSelectWeek(monday)
  }

  useEffect(() => {
    if (!showPicker) return
    function onDown(e: MouseEvent) {
      if (!popoverRef.current?.contains(e.target as Node) && !labelButtonRef.current?.contains(e.target as Node)) {
        setShowPicker(false)
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setShowPicker(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [showPicker])

  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
      <button
        onClick={() => onNavigateWeek(-1)}
        className="p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-800 dark:hover:text-gray-100 transition-colors"
        aria-label="Previous week"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      <div className="flex items-center gap-2">
        <button
          ref={labelButtonRef}
          type="button"
          onClick={handleLabelClick}
          aria-haspopup="dialog"
          aria-expanded={showPicker}
          title="Pick a week"
          className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors font-semibold text-sm sm:text-base text-gray-800 dark:text-gray-100"
        >
          <span>{formatWeekRangeLabel(range)}</span>
          <svg
            className={`w-3.5 h-3.5 text-gray-400 transition-transform ${showPicker ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {isCurrentWeek && (
          <span className="text-xs font-medium text-jira-blue dark:text-blue-400 bg-jira-blue-light dark:bg-blue-900/30 px-1.5 py-0.5 rounded">
            This Week
          </span>
        )}
      </div>

      <button
        onClick={() => onNavigateWeek(1)}
        disabled={isCurrentWeek}
        className="p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-800 dark:hover:text-gray-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        aria-label="Next week"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {showPicker &&
        createPortal(
          <div ref={popoverRef} className="fixed z-50" style={{ top: popoverPos.top, left: popoverPos.left }}>
            <WeekPicker selectedDate={range.monday} onSelect={handleSelect} />
          </div>,
          document.body
        )}
    </div>
  )
}
