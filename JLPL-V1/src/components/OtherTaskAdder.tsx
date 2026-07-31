import { useEffect, useRef, useState } from 'react'

// "Log for Other Task" control: a button that expands into a Task ID input so the
// user can add a task that isn't in their common/assigned list.
export default function OtherTaskAdder({
  onAdd,
  isAdding,
  error,
  onClearError,
}: {
  onAdd: (taskId: string) => Promise<boolean>
  isAdding: boolean
  error: string
  onClearError: () => void
}) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  function close() {
    setOpen(false)
    setValue('')
    onClearError()
  }

  async function submit() {
    if (!value.trim() || isAdding) return
    const ok = await onAdd(value)
    if (ok) {
      setValue('')
      setOpen(false)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        // Carries the same surface as the task rows above it, in both themes — with no
        // background of its own the hover tint was the only thing painting this row.
        className="flex items-center gap-1.5 w-full px-4 py-2.5 text-sm font-medium text-jira-blue bg-white dark:bg-gray-800 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors border-b border-gray-100 dark:border-gray-700"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        Log for other task
      </button>
    )
  }

  return (
    <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 bg-blue-50/40 dark:bg-blue-900/10">
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            if (error) onClearError()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
            if (e.key === 'Escape') close()
          }}
          placeholder="Enter Task ID (e.g. DMO-13745)"
          className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-jira-blue focus:border-transparent bg-white dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400 uppercase placeholder:normal-case"
        />
        <button
          type="button"
          onClick={submit}
          disabled={!value.trim() || isAdding}
          className="btn-primary text-sm px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
        >
          {isAdding && (
            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
          Add
        </button>
        <button
          type="button"
          onClick={close}
          className="btn-secondary text-sm px-3 py-2"
        >
          Cancel
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}
