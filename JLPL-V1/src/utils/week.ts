export function formatDateForApi(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export interface WeekRange {
  monday: Date
  sunday: Date
  days: Date[]
}

// Returns the Monday-Sunday week containing `date`.
export function getWeekRange(date: Date): WeekRange {
  const day = date.getDay() // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const diffToMonday = day === 0 ? -6 : 1 - day
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate() + diffToMonday)
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d
  })
  return { monday, sunday: days[6], days }
}

export function isSameWeek(a: Date, b: Date): boolean {
  const { monday: mA } = getWeekRange(a)
  const { monday: mB } = getWeekRange(b)
  return (
    mA.getFullYear() === mB.getFullYear() &&
    mA.getMonth() === mB.getMonth() &&
    mA.getDate() === mB.getDate()
  )
}

export function isWeekendDay(date: Date): boolean {
  const day = date.getDay()
  return day === 0 || day === 6
}

export function isToday(date: Date): boolean {
  const today = new Date()
  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  )
}

export function formatWeekRangeLabel(range: WeekRange): string {
  const { monday, sunday } = range
  const sameMonth = monday.getMonth() === sunday.getMonth()
  const startFmt = monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const endFmt = sunday.toLocaleDateString('en-US', sameMonth ? { day: 'numeric' } : { month: 'short', day: 'numeric' })
  const year = sunday.getFullYear()
  return `${startFmt} – ${endFmt}, ${year}`
}
