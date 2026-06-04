import React, { createContext, useCallback, useContext, useState } from 'react'
import { JiraTeam } from '../types/jira'
import { jiraService } from '../services/jiraService'

interface AuthState {
  isAuthenticated: boolean
  team: JiraTeam
  userName: string
}

interface AuthContextValue extends AuthState {
  login: (pat: string, team: JiraTeam) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>(() => ({
    isAuthenticated: jiraService.hasPat(),
    team: jiraService.getTeam(),
    userName: '',
  }))

  const login = useCallback(async (pat: string, team: JiraTeam) => {
    const result = await jiraService.validatePat(pat, team)
    if (!result.valid) {
      throw new Error('Invalid PAT or unauthorized access.')
    }
    jiraService.setPat(pat)
    jiraService.setTeam(team)
    setState({ isAuthenticated: true, team, userName: result.name ?? '' })
  }, [])

  const logout = useCallback(() => {
    jiraService.clearAuth()
    setState({ isAuthenticated: false, team: 'DMO', userName: '' })
  }, [])

  return (
    <AuthContext.Provider value={{ ...state, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
