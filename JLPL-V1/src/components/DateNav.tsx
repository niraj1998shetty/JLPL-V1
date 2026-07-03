import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { jiraService } from '../services/jiraService'
import Calendar from './Calendar'

interface DateNavProps {
  date: Date
  onNavigate: (direction: -1 | 1) => void
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

export default function DateNav({ date, onNavigate, onSelectDate }: DateNavProps) {
  const today = isToday(date)
  const weekend = isWeekend(date)

  const dateButtonRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const [showCalendar, setShowCalendar] = useState(false)
  const [popoverPos, setPopoverPos] = useState({ top: 0, left: 0 })

  // Monthly totals: { "YYYY-MM-DD": hours }  — accumulated across all viewed months.
  const [dailyTotals, setDailyTotals] = useState<Record<string, number>>({})
  // Months whose data has fully arrived — used by Calendar to decide when to colour cells.
  const [loadedMonths, setLoadedMonths] = useState<Set<string>>(new Set())
  // Which month is currently being fetched (drives the spinner in Calendar).
  const [loadingMonth, setLoadingMonth] = useState<string | null>(null)
  // Tracks months already requested to prevent duplicate API calls.
  const fetchingRef = useRef<Set<string>>(new Set())

  function toYearMonth(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }

  async function loadMonth(yearMonth: string) {
    if (fetchingRef.current.has(yearMonth)) return
    fetchingRef.current.add(yearMonth)
    setLoadingMonth(yearMonth)
    try {
      const totals = await jiraService.getMonthlyTotals(yearMonth)
      setDailyTotals((prev) => ({ ...prev, ...totals }))
      setLoadedMonths((prev) => new Set([...prev, yearMonth]))
    } catch {
      // Mark loaded even on error so cells just stay neutral
      setLoadedMonths((prev) => new Set([...prev, yearMonth]))
    } finally {
      setLoadingMonth((prev) => (prev === yearMonth ? null : prev))
    }
  }

  function handleDateClick() {
    if (!dateButtonRef.current) return
    const rect = dateButtonRef.current.getBoundingClientRect()
    const popoverWidth = 288 // matches w-72 in Calendar
    let left = rect.left + rect.width / 2 - popoverWidth / 2
    left = Math.max(8, Math.min(left, window.innerWidth - popoverWidth - 8))
    setPopoverPos({ top: rect.bottom + 6, left })
    const opening = !showCalendar
    setShowCalendar((v) => !v)
    if (opening) loadMonth(toYearMonth(date))
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
      className={`flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 ${
        weekend ? 'bg-amber-50 dark:bg-amber-900/20' : 'bg-white dark:bg-gray-800'
      }`}
    >
      <button
        onClick={() => onNavigate(-1)}
        className="p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-800 dark:hover:text-gray-100 transition-colors"
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
          className={`flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors font-semibold text-sm sm:text-base ${
            weekend ? 'text-amber-700 dark:text-amber-500' : 'text-gray-800 dark:text-gray-100'
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
          <span className="text-xs font-medium text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5 rounded">
            Weekend
          </span>
        )}
        {today && !weekend && (
          <span className="text-xs font-medium text-jira-blue dark:text-blue-400 bg-jira-blue-light dark:bg-blue-900/30 px-1.5 py-0.5 rounded">
            Today
          </span>
        )}
      </div>

      <button
        onClick={() => onNavigate(1)}
        disabled={today}
        className="p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-800 dark:hover:text-gray-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
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
            <Calendar
              selectedDate={date}
              onSelect={handleSelect}
              dailyTotals={dailyTotals}
              loadedMonths={loadedMonths}
              loadingMonth={loadingMonth}
              onViewMonthChange={(ym) => loadMonth(ym)}
            />
          </div>,
          document.body
        )}
    </div>
  )
}
