import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Calendar from './Calendar'

interface DateNavProps {
  date: Date
  onNavigate: (direction: -1 | 1) => void
  onJumpToToday: () => void
  onSelectDate: (date: Date) => void
}

function isToday(date: Date): boolean {
  const today = new Date()
  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  )
}

function isWeekend(date: Date): boolean {
  const day = date.getDay()
  return day === 0 || day === 6
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export default function DateNav({ date, onNavigate, onJumpToToday, onSelectDate }: DateNavProps) {
  const today = isToday(date)
  const weekend = isWeekend(date)

  const dateButtonRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const [showCalendar, setShowCalendar] = useState(false)
  const [popoverPos, setPopoverPos] = useState({ top: 0, left: 0 })

  function handleDateClick() {
    if (!dateButtonRef.current) return
    const rect = dateButtonRef.current.getBoundingClientRect()
    const popoverWidth = 288 // matches w-72 in Calendar
    let left = rect.left + rect.width / 2 - popoverWidth / 2
    left = Math.max(8, Math.min(left, window.innerWidth - popoverWidth - 8))
    setPopoverPos({ top: rect.bottom + 6, left })
    setShowCalendar((v) => !v)
  }

  function handleSelect(d: Date) {
    setShowCalendar(false)
    onSelectDate(d)
  }

  useEffect(() => {
    if (!showCalendar) return
    function onDown(e: MouseEvent) {
      if (
        !popoverRef.current?.contains(e.target as Node) &&
        !dateButtonRef.current?.contains(e.target as Node)
      ) {
        setShowCalendar(false)
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setShowCalendar(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [showCalendar])

  return (
    <div
      className={`flex items-center justify-between px-4 py-3 border-b border-gray-200 ${
        weekend ? 'bg-amber-50' : 'bg-white'
      }`}
    >
      <button
        onClick={() => onNavigate(-1)}
        className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-800 transition-colors"
        aria-label="Previous day"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      <div className="flex items-center gap-2">
        <button
          ref={dateButtonRef}
          type="button"
          onClick={handleDateClick}
          aria-haspopup="dialog"
          aria-expanded={showCalendar}
          className={`flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors font-semibold text-sm sm:text-base ${
            weekend ? 'text-amber-700' : 'text-gray-800'
          }`}
        >
          <span>{formatDate(date)}</span>
          <svg
            className={`w-3.5 h-3.5 text-gray-400 transition-transform ${showCalendar ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {weekend && (
          <span className="text-xs font-medium text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded">
            Weekend
          </span>
        )}
        {today && !weekend && (
          <span className="text-xs font-medium text-jira-blue bg-jira-blue-light px-1.5 py-0.5 rounded">
            Today
          </span>
        )}
        {!today && (
          <button
            onClick={onJumpToToday}
            className="text-xs font-medium text-jira-blue hover:bg-jira-blue-light px-1.5 py-0.5 rounded border border-jira-blue/30 transition-colors"
            aria-label="Jump to today"
          >
            Today
          </button>
        )}
      </div>

      <button
        onClick={() => onNavigate(1)}
        disabled={today}
        className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-800 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        aria-label="Next day"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {showCalendar &&
        createPortal(
          <div
            ref={popoverRef}
            className="fixed z-50"
            style={{ top: popoverPos.top, left: popoverPos.left }}
          >
            <Calendar selectedDate={date} onSelect={handleSelect} />
          </div>,
          document.body
        )}
    </div>
  )
}
