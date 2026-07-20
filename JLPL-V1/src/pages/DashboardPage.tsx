import { useEffect, useRef, useState } from 'react'
import DayLogView from '../components/DayLogView'
import WeekLogView from '../components/WeekLogView'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { jiraService } from '../services/jiraService'
import { JiraTask } from '../types/jira'
import { isSameWeek, isToday } from '../utils/week'

type ViewMode = 'day' | 'week'

// Week view needs room for 7 columns plus the task list — reserve it for
// tablet-and-up. Phones stay on the day view regardless of the saved preference.
const DESKTOP_QUERY = '(min-width: 768px)'

const VIEW_MODE_STORAGE_KEY = 'jlpl_view_mode'

function loadStoredViewMode(): ViewMode {
  return localStorage.getItem(VIEW_MODE_STORAGE_KEY) === 'week' ? 'week' : 'day'
}

function getInitials(name: string | null | undefined): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export default function DashboardPage() {
  const { logout, teams, userName, getPat } = useAuth()

  const [viewMode, setViewMode] = useState<ViewMode>(loadStoredViewMode)
  const isDesktop = useMediaQuery(DESKTOP_QUERY)
  // The saved preference is ignored on phones — Week always falls back to Day there.
  const effectiveViewMode: ViewMode = isDesktop ? viewMode : 'day'
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [tasks, setTasks] = useState<JiraTask[]>([])

  const [isLoadingTasks, setIsLoadingTasks] = useState(true)
  const [taskError, setTaskError] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const userMenuRef = useRef<HTMLDivElement>(null)
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Focus search input when it opens
  useEffect(() => {
    if (showSearch) searchInputRef.current?.focus()
  }, [showSearch])

  // Persist the view mode preference across reloads.
  useEffect(() => {
    localStorage.setItem(VIEW_MODE_STORAGE_KEY, viewMode)
  }, [viewMode])

  // Close user menu on outside click or Escape
  useEffect(() => {
    if (!showUserMenu) return
    function onDown(e: MouseEvent) {
      if (!userMenuRef.current?.contains(e.target as Node)) {
        setShowUserMenu(false)
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setShowUserMenu(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [showUserMenu])

  // Load tasks on mount
  useEffect(() => {
    loadTasks()
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  async function loadTasks() {
    setIsLoadingTasks(true)
    setTaskError('')
    try {
      const [defaultTasks, assignedTasks] = await Promise.all([
        jiraService.getDefaultTasks(),
        jiraService.getAssignedTasks(),
      ])
      setTasks([...defaultTasks, ...assignedTasks])
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 401) {
        setTaskError('Session expired. Please log in again.')
        logout()
      } else {
        setTaskError('Failed to load tasks. Check your connection and try again.')
      }
    } finally {
      setIsLoadingTasks(false)
    }
  }

  const showJumpButton = effectiveViewMode === 'day' ? !isToday(selectedDate) : !isSameWeek(selectedDate, new Date())

  return (
    <div className="h-screen bg-gray-50 dark:bg-gray-900 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="bg-jira-navy text-white shadow-md flex-shrink-0">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z" />
              </svg>
            </div>
            <div>
              <h1 className="font-bold text-sm leading-tight hidden sm:block">Jira Logging Pvt Ltd</h1>
              <h1 className="font-bold text-sm leading-tight sm:hidden">JLPL</h1>
              <span className="text-blue-200 text-xs">{teams.join(', ')} team{teams.length > 1 ? 's' : ''}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Search */}
            <div className="flex items-center">
              {showSearch && (
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setShowSearch(false)
                      setSearchQuery('')
                    }
                  }}
                  placeholder="Search tasks…"
                  className="w-28 sm:w-44 bg-white/10 border border-white/30 rounded-lg px-3 py-1.5 text-sm text-white placeholder-blue-200 focus:outline-none focus:border-white/60 transition-all"
                />
              )}
              <button
                onClick={() => {
                  if (showSearch) {
                    setShowSearch(false)
                    setSearchQuery('')
                  } else {
                    setShowSearch(true)
                  }
                }}
                className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors text-blue-200 hover:text-white"
                title={showSearch ? 'Close search' : 'Search tasks'}
                aria-label={showSearch ? 'Close search' : 'Search tasks'}
              >
                {showSearch ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                  </svg>
                )}
              </button>
            </div>
            {showJumpButton && (
              <button
                onClick={() => setSelectedDate(new Date())}
                className="px-3 py-1.5 rounded-lg hover:bg-white/10 text-blue-200 hover:text-white transition-colors text-sm font-medium"
                title={effectiveViewMode === 'day' ? 'Jump to today' : 'Jump to this week'}
              >
                {effectiveViewMode === 'day' ? 'Today' : 'This Week'}
              </button>
            )}
            <div ref={userMenuRef} className="relative">
              <button
                onClick={() => setShowUserMenu((v) => !v)}
                className="w-9 h-9 rounded-full bg-jira-navy text-white font-semibold text-sm flex items-center justify-center border-2 border-white/40 hover:border-white/70 hover:bg-white/10 transition-colors"
                title={userName || 'Account'}
                aria-haspopup="menu"
                aria-expanded={showUserMenu}
              >
                {getInitials(userName)}
              </button>
              {showUserMenu && (
                <div
                  role="menu"
                  className="absolute right-0 mt-2 w-56 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 py-2 text-gray-800 dark:text-gray-100 z-50"
                >
                  <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-700">
                    <p className="text-sm font-semibold leading-tight">{userName || 'Signed in'}</p>
                    {teams.length > 0 && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {teams.join(', ')} team{teams.length > 1 ? 's' : ''}
                      </p>
                    )}
                  </div>
                  <button
                    role="menuitem"
                    onClick={() => {
                      setShowUserMenu(false)
                      setShowSettings(true)
                    }}
                    className="w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left"
                  >
                    <svg className="w-4 h-4 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Settings
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => {
                      setShowUserMenu(false)
                      window.open('https://jira.eg.dk/secure/jiraerpOverviewPageWebworkAction.jspa', '_blank')
                    }}
                    className="w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left border-t border-gray-100 dark:border-gray-700"
                  >
                    <svg className="w-4 h-4 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    Go to ERP
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => {
                      setShowUserMenu(false)
                      window.open('https://5177942.app.netsuite.com/app/center/card.nl?sc=-46&whence=', '_blank')
                    }}
                    className="w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left"
                  >
                    <svg className="w-4 h-4 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    Go to NetSuite
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className={`flex-1 flex flex-col w-full min-h-0 mx-auto ${effectiveViewMode === 'week' ? 'max-w-6xl' : 'max-w-3xl'}`}>
        {/* Loading state */}
        {isLoadingTasks && (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400 dark:text-gray-500 gap-3">
            <svg className="animate-spin h-8 w-8 text-jira-blue" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <p className="text-sm">Loading tasks from Jira...</p>
          </div>
        )}

        {/* Error state */}
        {!isLoadingTasks && taskError && (
          <div className="m-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-6 text-center">
            <svg className="w-10 h-10 text-red-400 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <p className="text-sm text-red-700 dark:text-red-400 mb-4">{taskError}</p>
            <div className="flex items-center justify-center gap-3">
              <button onClick={loadTasks} className="btn-secondary text-sm">Retry</button>
              <button onClick={logout} className="btn-secondary text-sm text-red-600 border-red-300 hover:bg-red-50">Reconfigure Token</button>
            </div>
          </div>
        )}

        {!isLoadingTasks && !taskError && (
          effectiveViewMode === 'day' ? (
            <DayLogView
              tasks={tasks}
              setTasks={setTasks}
              searchQuery={searchQuery}
              selectedDate={selectedDate}
              onDateChange={setSelectedDate}
              logout={logout}
            />
          ) : (
            <WeekLogView
              tasks={tasks}
              setTasks={setTasks}
              searchQuery={searchQuery}
              selectedDate={selectedDate}
              onDateChange={setSelectedDate}
              logout={logout}
            />
          )
        )}
      </div>

      {/* Settings drawer */}
      {showSettings && (
        <SettingsDrawer
          teams={teams}
          currentPat={getPat()}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          isDesktop={isDesktop}
          onClose={() => setShowSettings(false)}
          onLogout={() => {
            setShowSettings(false)
            logout()
          }}
        />
      )}
    </div>
  )
}

// --- Sub-components ---

function SettingsDrawer({
  teams,
  currentPat,
  viewMode,
  onViewModeChange,
  isDesktop,
  onClose,
  onLogout,
}: {
  teams: string[]
  currentPat: string
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
  isDesktop: boolean
  onClose: () => void
  onLogout: () => void
}) {
  const { isDark, toggleDark } = useTheme()
  const [copied, setCopied] = useState(false)

  const handleCopyPat = () => {
    navigator.clipboard.writeText(currentPat)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-t-2xl shadow-2xl w-full max-w-3xl p-6 pb-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-gray-200 dark:bg-gray-600 rounded-full mx-auto mb-5" />
        <h3 className="font-semibold text-gray-800 dark:text-gray-100 mb-1">Settings</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">Logged in as team <strong>{teams.join(', ')}</strong></p>

        {/* Time log view */}
        <div className="mb-5 p-4 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-800 dark:text-gray-100">Time log view</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {isDesktop ? 'Log a single day, or a full Monday–Sunday week' : 'Week view needs a tablet or larger screen'}
              </p>
            </div>
            <div className="flex items-center bg-gray-200 dark:bg-gray-700 rounded-lg p-0.5 text-xs font-medium flex-shrink-0">
              <button
                type="button"
                onClick={() => onViewModeChange('day')}
                className={`px-2.5 py-1.5 rounded-md transition-colors ${
                  viewMode === 'day' || !isDesktop
                    ? 'bg-white dark:bg-gray-600 text-gray-800 dark:text-gray-100 shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
              >
                Day
              </button>
              <button
                type="button"
                onClick={() => isDesktop && onViewModeChange('week')}
                disabled={!isDesktop}
                title={isDesktop ? undefined : 'Week view needs a tablet or larger screen'}
                className={`px-2.5 py-1.5 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                  viewMode === 'week' && isDesktop
                    ? 'bg-white dark:bg-gray-600 text-gray-800 dark:text-gray-100 shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
              >
                Week
              </button>
            </div>
          </div>
        </div>

        {/* Dark mode toggle */}
        <div className="flex items-center justify-between mb-5 p-4 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700">
          <div>
            <p className="text-sm font-medium text-gray-800 dark:text-gray-100">Dark mode</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Switch to dark theme</p>
          </div>
          <button
            type="button"
            onClick={toggleDark}
            className={`relative w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-jira-blue focus:ring-offset-2 dark:focus:ring-offset-gray-800 ${
              isDark ? 'bg-jira-blue' : 'bg-gray-300'
            }`}
            aria-label="Toggle dark mode"
            aria-checked={isDark}
            role="switch"
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
                isDark ? 'translate-x-5' : ''
              }`}
            />
          </button>
        </div>

        {/* Current token display */}
        <div className="mb-5 p-4 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700">
          <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">Current Token</p>
          <div className="flex items-center gap-2">
            <input
              type="password"
              value={currentPat}
              readOnly
              className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300"
            />
            <button
              onClick={handleCopyPat}
              className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                copied
                  ? 'bg-green-100 text-green-700 border border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300 border border-gray-300 dark:bg-gray-600 dark:text-gray-200 dark:hover:bg-gray-500 dark:border-gray-500'
              }`}
            >
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>
        </div>

        <button
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-sm font-medium"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Sign out &amp; change token
        </button>

        <p className="text-center text-xs text-gray-400 dark:text-gray-500 mt-6">✨ Made with love, Dynaway. ✨</p>
      </div>
    </div>
  )
}
