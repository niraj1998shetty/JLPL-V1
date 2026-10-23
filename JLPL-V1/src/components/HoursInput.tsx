import { useEffect, useRef } from 'react'

interface HoursInputProps {
  value: string
  onChange: (value: string) => void
  className?: string
  placeholder?: string
  disabled?: boolean
  onFocus?: () => void
  onBlur?: () => void
}

const DEFAULT_CLASS =
  'w-16 px-2 py-1.5 text-sm text-center border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-jira-blue focus:border-transparent bg-white dark:bg-gray-700 dark:text-gray-100'

// Shared hours-entry input: 0-24 in quarter-hour steps, blocks the keystrokes
// that would let a number input go negative/exponential, and blurs on scroll
// so an accidental mouse-wheel over the field can't silently change the value.
export default function HoursInput({ value, onChange, className, placeholder, disabled, onFocus, onBlur }: HoursInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  // Browsers only step a number input on wheel while it's focused, so blurring
  // it is enough — no preventDefault, so the page still scrolls normally.
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    const handler = () => {
      if (document.activeElement === el) el.blur()
    }
    el.addEventListener('wheel', handler, { passive: true })
    return () => el.removeEventListener('wheel', handler)
  }, [])

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (['-', '+', 'e', 'E'].includes(e.key)) e.preventDefault()
  }

  return (
    <input
      ref={inputRef}
      type="number"
      step="0.25"
      min="0"
      max="24"
      inputMode="decimal"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={handleKeyDown}
      onFocus={onFocus}
      onBlur={onBlur}
      placeholder={placeholder}
      disabled={disabled}
      className={`${className ?? DEFAULT_CLASS} disabled:opacity-40 disabled:cursor-not-allowed`}
    />
  )
}
