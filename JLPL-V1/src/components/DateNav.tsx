interface DateNavProps {
  date: Date
  onNavigate: (direction: -1 | 1) => void
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

export default function DateNav({ date, onNavigate }: DateNavProps) {
  const today = isToday(date)
  const weekend = isWeekend(date)

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

      <div className="text-center">
        <span className={`font-semibold text-sm sm:text-base ${weekend ? 'text-amber-700' : 'text-gray-800'}`}>
          {formatDate(date)}
        </span>
        {weekend && (
          <span className="ml-2 text-xs font-medium text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded">
            Weekend
          </span>
        )}
        {today && !weekend && (
          <span className="ml-2 text-xs font-medium text-jira-blue bg-jira-blue-light px-1.5 py-0.5 rounded">
            Today
          </span>
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
    </div>
  )
}
