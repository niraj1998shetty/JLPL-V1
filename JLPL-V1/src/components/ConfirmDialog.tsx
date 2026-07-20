export default function ConfirmDialog({
  label,
  sessionHours,
  onConfirm,
  onCancel,
}: {
  /** Human-readable period being submitted, e.g. "Friday, July 17, 2026" or "Jul 13 – 19, 2026". */
  label: string
  sessionHours: number
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 px-4 pb-4 sm:pb-0">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-jira-blue-light dark:bg-blue-900/40 rounded-full flex items-center justify-center">
            <svg className="w-5 h-5 text-jira-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h3 className="font-semibold text-gray-800 dark:text-gray-100">Confirm Time Log</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
          </div>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-6">
          You are about to log <strong>{sessionHours.toFixed(2).replace(/\.?0+$/, '')} hours</strong>. This action cannot be undone.
        </p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="btn-secondary flex-1">Cancel</button>
          <button onClick={onConfirm} className="btn-primary flex-1">Submit</button>
        </div>
      </div>
    </div>
  )
}
