interface SummaryBarProps {
  sessionHours: number
  existingTotal: number
  isOverLimit: boolean
  actualTotal: number
  canSubmit: boolean
  isSubmitting: boolean
  onSubmit: () => void
}

export default function SummaryBar({
  sessionHours,
  existingTotal,
  isOverLimit,
  actualTotal,
  canSubmit,
  isSubmitting,
  onSubmit,
}: SummaryBarProps) {
  const totalLogged = existingTotal + sessionHours
  const progressPct = Math.min(100, (totalLogged / 8) * 100)

  return (
    <div className="border-t border-gray-200 bg-white">
      {/* Progress bar */}
      <div className="h-1 bg-gray-100">
        <div
          className={`h-full rounded-full transition-all duration-300 ${
            isOverLimit ? 'bg-red-500' : totalLogged >= 8 ? 'bg-green-500' : 'bg-jira-blue'
          }`}
          style={{ width: `${progressPct}%` }}
        />
      </div>

      <div className="px-4 py-3">
        {/* Stats row */}
        <div className="flex items-center justify-between text-sm mb-3">
          <div className="flex items-center gap-4">
            <div>
              <span className="text-gray-500 text-xs">This session</span>
              <div className="font-semibold text-gray-800">{sessionHours.toFixed(2).replace(/\.?0+$/, '')}h</div>
            </div>
            <div className="w-px h-8 bg-gray-200" />
            <div>
              <span className="text-gray-500 text-xs">Total logged</span>
              <div className={`font-semibold ${isOverLimit ? 'text-red-600' : totalLogged >= 8 ? 'text-green-600' : 'text-gray-800'}`}>
                {totalLogged.toFixed(2).replace(/\.?0+$/, '')}h / 8h
              </div>
            </div>
          </div>

          {isOverLimit && (
            <div className="text-xs text-red-600 font-medium bg-red-50 border border-red-200 px-2 py-1 rounded-lg">
              Exceeds 8h ({actualTotal.toFixed(2)}h)
            </div>
          )}
        </div>

        {/* Submit button */}
        <button
          onClick={onSubmit}
          disabled={!canSubmit}
          className="btn-primary w-full flex items-center justify-center gap-2"
        >
          {isSubmitting ? (
            <>
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span>Submitting...</span>
            </>
          ) : (
            'Submit Time Log'
          )}
        </button>
      </div>
    </div>
  )
}
