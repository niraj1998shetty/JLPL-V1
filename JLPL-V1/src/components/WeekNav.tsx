import { formatWeekRangeLabel, isSameWeek, WeekRange } from '../utils/week'

interface WeekNavProps {
  range: WeekRange
  onNavigateWeek: (dir: -1 | 1) => void
}

export default function WeekNav({ range, onNavigateWeek }: WeekNavProps) {
  const isCurrentWeek = isSameWeek(range.monday, new Date())

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
        <span className="font-semibold text-sm sm:text-base text-gray-800 dark:text-gray-100">
          {formatWeekRangeLabel(range)}
        </span>
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
    </div>
  )
}
