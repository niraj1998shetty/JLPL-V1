import { useEffect, useState } from 'react'

interface CalendarProps {
  selectedDate: Date
  onSelect: (date: Date) => void
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1)
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

export default function Calendar({ selectedDate, onSelect }: CalendarProps) {
  const [viewMonth, setViewMonth] = useState<Date>(startOfMonth(selectedDate))

  // Keep the visible month aligned with the externally-selected date if it changes.
  useEffect(() => {
    setViewMonth(startOfMonth(selectedDate))
  }, [selectedDate])

  const today = startOfDay(new Date())
  const nextMonthDisabled = addMonths(viewMonth, 1) > startOfMonth(today)

  // Build the 6-row × 7-col grid starting on Sunday of the week containing the 1st.
  const gridStart = new Date(viewMonth)
  gridStart.setDate(viewMonth.getDate() - viewMonth.getDay())

  const days: Date[] = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart)
    d.setDate(gridStart.getDate() + i)
    days.push(d)
  }

  const monthLabel = viewMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  return (
    <div className="w-72 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 p-3">
      {/* Month header */}
      <div className="flex items-center justify-between mb-2">
        <button
          type="button"
          onClick={() => setViewMonth(addMonths(viewMonth, -1))}
          className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
          aria-label="Previous month"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">{monthLabel}</span>
        <button
          type="button"
          onClick={() => setViewMonth(addMonths(viewMonth, 1))}
          disabled={nextMonthDisabled}
          className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="Next month"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Weekday header row */}
      <div className="grid grid-cols-7 gap-0.5 mb-1">
        {WEEKDAYS.map((d) => (
          <div key={d} className="text-[10px] font-bold text-gray-400 dark:text-gray-500 text-center py-1 uppercase">
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-0.5">
        {days.map((d) => {
          const inMonth = d.getMonth() === viewMonth.getMonth()
          const isFuture = d > today
          const isSelected = isSameDay(d, selectedDate)
          const isTodayCell = isSameDay(d, today)
          const isWeekendCell = d.getDay() === 0 || d.getDay() === 6

          let cls = 'h-8 text-xs rounded flex items-center justify-center transition-colors'
          if (isSelected) {
            cls += ' bg-jira-blue text-white font-semibold'
          } else if (isFuture) {
            cls += ' text-gray-300 dark:text-gray-600 cursor-not-allowed'
          } else if (!inMonth) {
            cls += ' text-gray-300 dark:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700'
          } else if (isWeekendCell) {
            cls += ' text-amber-700 dark:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20'
          } else {
            cls += ' text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
          }
          if (isTodayCell && !isSelected) cls += ' ring-1 ring-jira-blue'

          return (
            <button
              key={d.toISOString()}
              type="button"
              disabled={isFuture}
              onClick={() => onSelect(d)}
              className={cls}
            >
              {d.getDate()}
            </button>
          )
        })}
      </div>
    </div>
  )
}
