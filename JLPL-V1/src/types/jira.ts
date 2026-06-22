export type JiraTeam = 'DMO' | 'DFO'

export interface JiraTask {
  id: string
  summary: string
  isDefault: boolean
  isExpandable: boolean
  isParentOnly?: boolean  // parent not directly assigned; expand-only container for assigned subtasks
  subtaskKeys?: string[]
  subtasks?: JiraTask[]
  taskType?: 'dev' | 'test'
  estimatedHours?: number
  remainingHours?: number
  totalLoggedHours?: number
  storyPoints?: number
  updatedAt?: string
}

export interface JiraTimeEntry {
  taskId: string
  hours: number
  date: string
  comment?: string
}

export interface JiraSubmitPayload {
  date: string
  entries: JiraTimeEntry[]
}

export interface AuthConfig {
  pat: string
  teams: JiraTeam[]
}
