import React, { createContext, useCallback, useContext, useState } from 'react'
import { JiraTeam } from '../types/jira'
import { jiraService } from '../services/jiraService'

interface AuthState {
  isAuthenticated: boolean
  teams: JiraTeam[]
  userName: string
}

interface AuthContextValue extends AuthState {
  login: (pat: string, teams: JiraTeam[]) => Promise<void>
  logout: () => void
  getPat: () => string
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>(() => ({
    isAuthenticated: jiraService.hasPat(),
    teams: jiraService.getTeams(),
    userName: '',
  }))

  const login = useCallback(async (pat: string, teams: JiraTeam[]) => {
    const result = await jiraService.validatePat(pat, teams)
    if (!result.valid) {
      throw new Error('Invalid PAT or unauthorized access.')
    }
    jiraService.setPat(pat)
    jiraService.setTeams(teams)
    setState({ isAuthenticated: true, teams, userName: result.name ?? '' })
  }, [])

  const logout = useCallback(() => {
    jiraService.clearAuth()
    setState({ isAuthenticated: false, teams: ['DMO'], userName: '' })
  }, [])

  const getPat = useCallback(() => {
    return jiraService.getPat()
  }, [])

  return (
    <AuthContext.Provider value={{ ...state, login, logout, getPat }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
