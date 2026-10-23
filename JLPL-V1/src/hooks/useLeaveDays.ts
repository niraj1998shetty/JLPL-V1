import { useCallback, useSyncExternalStore } from 'react'

// Leave days are a purely local, per-browser preference — the backend is a
// stateless Jira proxy, so there's nowhere server-side to keep them. The key is
// deliberately not one of the auth keys jiraService.clearAuth() removes, so
// leave days survive signing out and back in.
const STORAGE_KEY = 'jlpl_leave_days'

const listeners = new Set<() => void>()
let cache: { raw: string | null; days: ReadonlySet<string> } = { raw: null, days: new Set() }

function read(): ReadonlySet<string> {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (raw === cache.raw) return cache.days
  let days: ReadonlySet<string> = new Set()
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : []
    if (Array.isArray(parsed)) days = new Set(parsed.filter((d): d is string => typeof d === 'string'))
  } catch {
    // corrupt value — treat as no leave days
  }
  cache = { raw, days }
  return days
}

function write(days: Set<string>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...days].sort()))
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  // Keeps other open tabs in sync when leave is toggled in one of them.
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) listener()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

// Dates are keyed as YYYY-MM-DD (formatDateForApi), matching the worklog maps.
export function useLeaveDays() {
  const leaveDays = useSyncExternalStore(subscribe, read)

  const setLeave = useCallback((dateStr: string, onLeave: boolean) => {
    const next = new Set(read())
    if (onLeave) next.add(dateStr)
    else next.delete(dateStr)
    write(next)
  }, [])

  return { leaveDays, setLeave }
}
