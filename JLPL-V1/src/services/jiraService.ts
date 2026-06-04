import axios, { AxiosInstance } from 'axios'
import { JiraSubmitPayload, JiraTask, JiraTeam, JiraTimeEntry } from '../types/jira'

const STORAGE_KEY_PAT = 'jlpl_pat'
const STORAGE_KEY_TEAM = 'jlpl_team'

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
        config.headers['X-Team'] = this.getTeam()
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

  getTeam(): JiraTeam {
    return (localStorage.getItem(STORAGE_KEY_TEAM) as JiraTeam) ?? 'DMO'
  }

  setTeam(team: JiraTeam): void {
    localStorage.setItem(STORAGE_KEY_TEAM, team)
  }

  clearAuth(): void {
    localStorage.removeItem(STORAGE_KEY_PAT)
    localStorage.removeItem(STORAGE_KEY_TEAM)
  }

  async validatePat(pat: string, team: JiraTeam): Promise<{ valid: boolean; name?: string }> {
    try {
      const res = await this.client.post<{ valid: boolean; name?: string; error?: string }>('/auth/validate', { pat, team })
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
    const res = await this.client.get<JiraTask[]>('/tasks/default')
    return res.data
  }

  async getAssignedTasks(): Promise<JiraTask[]> {
    const res = await this.client.get<JiraTask[]>('/tasks/assigned')
    return res.data
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
