import axios, { AxiosInstance } from 'axios'
import { JiraSubmitPayload, JiraTask, JiraTeam, JiraTimeEntry } from '../types/jira'

const STORAGE_KEY_PAT = 'jlpl_pat'
const STORAGE_KEY_TEAMS = 'jlpl_teams'

class JiraService {
  private client: AxiosInstance

  constructor() {
    // In dev the Vite proxy rewrites /api → backend.
    // In production set VITE_API_BASE_URL to the deployed backend URL (no trailing slash).
    const base = import.meta.env.VITE_API_BASE_URL
      ? import.meta.env.VITE_API_BASE_URL.replace(/\/$/, '')
      : '/api'
    this.client = axios.create({
      baseURL: base,
    })

    this.client.interceptors.request.use((config) => {
      const pat = this.getPat()
      if (pat) {
        config.headers['Authorization'] = `Bearer ${pat}`
        // Only set X-Team if not already explicitly set in the request
        if (!config.headers['X-Team']) {
          const teams = this.getTeams()
          if (teams.length > 0) {
            config.headers['X-Team'] = teams[0]
          }
        }
      }
      return config
    })
  }

  hasPat(): boolean {
    return !!localStorage.getItem(STORAGE_KEY_PAT)
  }

  getPat(): string {
    return localStorage.getItem(STORAGE_KEY_PAT) ?? ''
  }

  setPat(pat: string): void {
    localStorage.setItem(STORAGE_KEY_PAT, pat)
  }

  getTeams(): JiraTeam[] {
    const stored = localStorage.getItem(STORAGE_KEY_TEAMS)
    if (stored) {
      try {
        return JSON.parse(stored) as JiraTeam[]
      } catch {
        return ['DMO']
      }
    }
    return ['DMO']
  }S

  setTeams(teams: JiraTeam[]): void {
    localStorage.setItem(STORAGE_KEY_TEAMS, JSON.stringify(teams))
  }

  // Deprecated: kept for compatibility
  getTeam(): JiraTeam {
    return this.getTeams()[0]
  }

  // Deprecated: kept for compatibility
  setTeam(team: JiraTeam): void {
    this.setTeams([team])
  }

  clearAuth(): void {
    localStorage.removeItem(STORAGE_KEY_PAT)
    localStorage.removeItem(STORAGE_KEY_TEAMS)
  }

  async validatePat(pat: string, teams: JiraTeam[]): Promise<{ valid: boolean; name?: string }> {
    try {
      const res = await this.client.post<{ valid: boolean; name?: string; error?: string }>('/auth/validate', { pat, teams })
      if (!res.data.valid) {
        throw new Error(res.data.error ?? 'Invalid PAT or unauthorized access.')
      }
      return { valid: true, name: res.data.name }
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        const errorMsg = err.response?.data?.error
        if (typeof errorMsg === 'string' && errorMsg.trim()) {
          throw new Error(errorMsg)
        }
      }
      throw err
    }
  }

  async getDefaultTasks(): Promise<JiraTask[]> {
    const teams = this.getTeams()
    if (teams.length === 0) return []

    // Fetch from all teams with error handling for individual teams
    const results = await Promise.allSettled(
      teams.map((team) =>
        this.client.get<JiraTask[]>('/tasks/default', {
          headers: { 'X-Team': team },
        })
      )
    )

    // Collect all tasks, handling errors gracefully
    const allTasks: JiraTask[] = []
    results.forEach((result) => {
      if (result.status === 'fulfilled') {
        allTasks.push(...result.value.data)
      }
      // Silently skip failed teams (e.g., no access to DFO)
    })

    // Deduplicate by task ID (keep first occurrence)
    const seen = new Set<string>()
    return allTasks.filter((task) => {
      if (seen.has(task.id)) return false
      seen.add(task.id)
      return true
    })
  }

  async getAssignedTasks(): Promise<JiraTask[]> {
    const teams = this.getTeams()
    if (teams.length === 0) return []

    // Fetch from all teams with error handling for individual teams
    const results = await Promise.allSettled(
      teams.map((team) =>
        this.client.get<JiraTask[]>('/tasks/assigned', {
          headers: { 'X-Team': team },
        })
      )
    )

    // Collect all tasks, handling errors gracefully
    const allTasks: JiraTask[] = []
    results.forEach((result) => {
      if (result.status === 'fulfilled') {
        allTasks.push(...result.value.data)
      }
      // Silently skip failed teams (e.g., no access to DFO)
    })

    // Deduplicate by task ID (keep first occurrence)
    const seen = new Set<string>()
    return allTasks.filter((task) => {
      if (seen.has(task.id)) return false
      seen.add(task.id)
      return true
    })
  }

  async getSubtasks(taskId: string): Promise<JiraTask[]> {
    const res = await this.client.get<JiraTask[]>(`/tasks/${taskId}/subtasks`)
    return res.data
  }

  async getExistingWorklogs(dateStr: string): Promise<JiraTimeEntry[]> {
    const res = await this.client.get<JiraTimeEntry[]>('/worklogs', {
      params: { date: dateStr },
    })
    return res.data
  }

  async logWork(payload: JiraSubmitPayload): Promise<void> {
    await this.client.post('/worklogs', payload)
  }
}

export const jiraService = new JiraService()
