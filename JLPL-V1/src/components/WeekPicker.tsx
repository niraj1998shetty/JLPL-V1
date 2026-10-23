import { useEffect, useState } from 'react'
import { getWeekRange, isSameWeek, isToday, isWeekendDay } from '../utils/week'

interface WeekPickerProps {
  selectedDate: Date
  /** Called with the Monday of the picked week */
  onSelect: (monday: Date) => void
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1)
}

// ISO-8601 week number (weeks start Monday; week 1 contains the year's first Thursday).
function isoWeekNumber(d: Date): number {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7))
  const yearStart = Date.UTC(t.getUTCFullYear(), 0, 1)
  return Math.ceil(((t.getTime() - yearStart) / 86400000 + 1) / 7)
}

// Month calendar where each Monday–Sunday row is a single selectable week, matching
// the week view's columns. Weeks that start in the future can't be picked.
export default function WeekPicker({ selectedDate, onSelect }: WeekPickerProps) {
  const [viewMonth, setViewMonth] = useState<Date>(startOfMonth(selectedDate))

  useEffect(() => {
    setViewMonth(startOfMonth(selectedDate))
  }, [selectedDate])

  const today = new Date()
  const nextMonthDisabled = addMonths(viewMonth, 1) > today

  // Every week that overlaps the visible month, Monday-first.
  const weeks: Date[][] = []
  const monthEnd = addMonths(viewMonth, 1)
  for (let monday = getWeekRange(viewMonth).monday; monday < monthEnd; ) {
    const { days } = getWeekRange(monday)
    weeks.push(days)
    monday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 7)
  }

  const monthLabel = viewMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  return (
    <div className="w-80 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 p-3">
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
      <div className="grid grid-cols-[2rem_repeat(7,minmax(0,1fr))] gap-0.5 mb-1">
        <div className="text-[10px] font-bold text-gray-400 dark:text-gray-500 text-center py-1 uppercase">Wk</div>
        {WEEKDAYS.map((d) => (
          <div key={d} className="text-[10px] font-bold text-gray-400 dark:text-gray-500 text-center py-1 uppercase">
            {d}
          </div>
        ))}
      </div>

      {/* One button per week */}
      <div className="flex flex-col gap-0.5">
        {weeks.map((days) => {
          const monday = days[0]
          const isFuture = monday > today
          const isSelected = isSameWeek(monday, selectedDate)
          const isCurrent = isSameWeek(monday, today)
          return (
            <button
              key={monday.toISOString()}
              type="button"
              disabled={isFuture}
              onClick={() => onSelect(monday)}
              aria-pressed={isSelected}
              aria-label={`Week ${isoWeekNumber(monday)}`}
              className={`grid grid-cols-[2rem_repeat(7,minmax(0,1fr))] gap-0.5 rounded-md transition-colors ${
                isSelected
                  ? 'bg-jira-blue text-white'
                  : isFuture
                  ? 'cursor-not-allowed'
                  : 'hover:bg-jira-blue-light dark:hover:bg-blue-900/30'
              } ${isCurrent && !isSelected ? 'ring-1 ring-jira-blue' : ''}`}
            >
              <span
                className={`h-8 flex items-center justify-center text-[10px] font-semibold ${
                  isSelected ? 'text-blue-100' : 'text-gray-400 dark:text-gray-500'
                }`}
              >
                {isoWeekNumber(monday)}
              </span>
              {days.map((d) => {
                const inMonth = d.getMonth() === viewMonth.getMonth()
                let text = 'text-gray-700 dark:text-gray-200'
                if (isSelected) text = inMonth ? 'text-white font-semibold' : 'text-blue-200'
                else if (isFuture || !inMonth) text = 'text-gray-300 dark:text-gray-600'
                else if (isWeekendDay(d)) text = 'text-orange-600 dark:text-orange-400'
                return (
                  <span
                    key={d.toISOString()}
                    className={`h-8 flex items-center justify-center text-xs ${text} ${
                      isToday(d) && !isSelected ? 'font-bold underline underline-offset-2' : ''
                    }`}
                  >
                    {d.getDate()}
                  </span>
                )
              })}
            </button>
          )
        })}
      </div>
    </div>
  )
}
