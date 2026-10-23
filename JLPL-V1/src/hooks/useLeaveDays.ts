import { useCallback, useSyncExternalStore } from 'react'

// Leave days are a purely local, per-browser preference — the backend is a
// stateless Jira proxy, so there's nowhere server-side to keep them. The key is
// deliberately not one of the auth keys jiraService.clearAuth() removes, so
// leave days survive signing out and back in.
const STORAGE_KEY = 'jlpl_leave_days'

export type LeaveType = 'full' | 'half' | 'holiday'

export const LEAVE_LABELS: Record<LeaveType, string> = {
  full: 'Full day leave',
  half: 'Half day leave',
  holiday: 'Public holiday',
}

export const FULL_DAY_HOURS = 8
export const HALF_DAY_HOURS = 4

// Full-day leave and public holidays lock the day; half-day leave only lowers its cap.
export function blocksLogging(leave: LeaveType | undefined): boolean {
  return leave === 'full' || leave === 'holiday'
}

// Max hours a day's total may reach: half a day on a half-day leave, otherwise the
// normal 8h. Blocked days aren't capped here — they block new logging outright,
// and a 0h cap would flag hours already in Jira as over the limit.
export function dailyLimitFor(leave: LeaveType | undefined): number {
  return leave === 'half' ? HALF_DAY_HOURS : FULL_DAY_HOURS
}

type LeaveMap = ReadonlyMap<string, LeaveType>

const listeners = new Set<() => void>()
let cache: { raw: string | null; days: LeaveMap } = { raw: null, days: new Map() }

function parse(raw: string | null): LeaveMap {
  const days = new Map<string, LeaveType>()
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : {}
    if (Array.isArray(parsed)) {
      // Older format: a plain list of full-day leave dates.
      for (const d of parsed) if (typeof d === 'string') days.set(d, 'full')
    } else if (parsed && typeof parsed === 'object') {
      for (const [d, t] of Object.entries(parsed)) if (t === 'full' || t === 'half' || t === 'holiday') days.set(d, t)
    }
  } catch {
    // corrupt value — treat as no leave days
  }
  return days
}

function read(): LeaveMap {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (raw !== cache.raw) cache = { raw, days: parse(raw) }
  return cache.days
}

function write(days: Map<string, LeaveType>) {
  const sorted = Object.fromEntries([...days].sort(([a], [b]) => a.localeCompare(b)))
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sorted))
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

  // Pass null to clear the day's leave.
  const setLeave = useCallback((dateStr: string, type: LeaveType | null) => {
    const next = new Map(read())
    if (type) next.set(dateStr, type)
    else next.delete(dateStr)
    write(next)
  }, [])

  return { leaveDays, setLeave }
}
