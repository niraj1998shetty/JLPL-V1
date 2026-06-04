import axios, { AxiosInstance } from 'axios'
import { config } from './config'
import {
  JiraIssue,
  JiraSearchResponse,
  JiraUser,
  JiraWorklog,
  JiraWorklogResponse,
} from './jiraTypes'

// ── Shared types returned to the frontend ─────────────────────────────────

export interface AppTask {
  id: string
  summary: string
  isDefault: boolean
  isExpandable: boolean
  isParentOnly?: boolean    // parent not directly assigned; shown as expand-only container
  subtaskKeys?: string[]   // keys of immediate subtasks, populated for default tasks
  subtasks?: AppTask[]
  taskType?: 'dev' | 'test'
  estimatedHours?: number
  remainingHours?: number
  totalLoggedHours?: number
  storyPoints?: number
}

export interface AppTimeEntry {
  taskId: string
  hours: number
  date: string
  comment?: string
}

// ── Helpers ────────────────────────────────────────────────────────────────

function secondsToHours(seconds: number | null): number | undefined {
  if (seconds === null || seconds === undefined) return undefined
  return Math.round((seconds / 3600) * 100) / 100
}

function hoursToJiraTimeSpent(hours: number): string {
  const totalMinutes = Math.round(hours * 60)
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

function detectTaskType(issue: JiraIssue): 'dev' | 'test' | undefined {
  const typeName = issue.fields.issuetype?.name?.toLowerCase() ?? ''
  if (typeName.includes('test')) return 'test'
  if (typeName.includes('bug') || typeName.includes('story') || typeName.includes('task')) return 'dev'
  return undefined
}

const TEST_KEYWORDS = ['test', 'qa', 'quality', 'verify', 'verification', 'testing']

// Derive task type from the summaries of a user's assigned subtasks
function resolveTypeFromSubtasks(subtasks: AppTask[]): 'test' | 'dev' {
  return subtasks.some((s) => TEST_KEYWORDS.some((k) => s.summary.toLowerCase().includes(k)))
    ? 'test'
    : 'dev'
}

function mapIssueToTask(issue: JiraIssue, isDefault: boolean): AppTask {
  const f = issue.fields
  const storyPointsRaw = f[config.jira.storyPointsField]
  const storyPoints = typeof storyPointsRaw === 'number' ? storyPointsRaw : undefined

  return {
    id: issue.key,
    summary: f.summary,
    isDefault,
    isExpandable: f.subtasks.length > 0,
    subtaskKeys: f.subtasks.length > 0 ? f.subtasks.map((s) => s.key) : undefined,
    taskType: detectTaskType(issue),
    estimatedHours: secondsToHours(f.timeoriginalestimate),
    remainingHours: secondsToHours(f.timeestimate),
    totalLoggedHours: secondsToHours(f.aggregatetimespent),
    storyPoints,
  }
}

function userIdentifier(user: JiraUser): string {
  // Jira Cloud uses accountId; Server/DC uses name or key
  return user.accountId ?? user.name ?? user.key ?? ''
}

function getWorklogComment(worklog: JiraWorklog): string | undefined {
  if (!worklog.comment) return undefined
  // Jira v3 ADF format
  if (typeof worklog.comment === 'object') {
    try {
      return worklog.comment.content
        .flatMap((block) => block.content)
        .map((node) => node.text)
        .join(' ')
    } catch {
      return undefined
    }
  }
  // Jira v2 plain string
  return worklog.comment
}

// ── Jira API client ────────────────────────────────────────────────────────

export class JiraClient {
  private http: AxiosInstance
  private apiBase: string

  constructor(pat: string) {
    if (!config.jira.baseUrl) {
      throw new Error('Server configuration error: JIRA_BASE_URL is not set.')
    }
    if (config.jira.baseUrl.includes('jira.example.com')) {
      throw new Error('Server configuration error: JIRA_BASE_URL is still set to the example value.')
    }

    this.apiBase = `${config.jira.baseUrl}/rest/api/${config.jira.apiVersion}`
    this.http = axios.create({
      baseURL: this.apiBase,
      headers: {
        Authorization: `Bearer ${pat}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: 15000,
    })
  }

  async getMyself(): Promise<JiraUser> {
    const res = await this.http.get<JiraUser>('/myself')
    return res.data
  }

  async getIssue(key: string): Promise<JiraIssue> {
    const res = await this.http.get<JiraIssue>(`/issue/${key}`, {
      params: { fields: JiraClient.BASE_FIELDS },
    })
    return res.data
  }

  // Base fields safe for all Jira versions. Story points / custom fields are excluded
  // because unknown field IDs cause a 400 on some Jira Data Center instances.
  // 'parent' is required to detect whether an issue is a subtask.
  private static readonly BASE_FIELDS = [
    'summary',
    'issuetype',
    'status',
    'timeoriginalestimate',
    'timeestimate',
    'timespent',
    'aggregatetimespent',
    'subtasks',
    'parent',
  ].join(',')

  async getIssues(keys: string[]): Promise<JiraIssue[]> {
    if (keys.length === 0) return []
    const jql = `key in (${keys.join(',')}) ORDER BY key ASC`
    const res = await this.http.get<JiraSearchResponse>('/search', {
      params: { jql, fields: JiraClient.BASE_FIELDS, maxResults: keys.length },
    })
    return res.data.issues
  }

  // Search for issues where the current user has worklogs on a specific date.
  // Uses JQL so we only fetch issues actually worked on, not all possible task keys.
  async getIssuesWithWorklogsOnDate(dateStr: string): Promise<Array<{ key: string }>> {
    try {
      const jql = `worklogAuthor = currentUser() AND worklogDate = "${dateStr}"`
      const res = await this.http.get<JiraSearchResponse>('/search', {
        params: { jql, fields: 'summary', maxResults: 50 },
      })
      return res.data.issues.map((i) => ({ key: i.key }))
    } catch {
      return []
    }
  }

  async getSubtasks(parentKey: string): Promise<JiraIssue[]> {
    const jql = `parent = ${parentKey} ORDER BY created ASC`
    const res = await this.http.get<JiraSearchResponse>('/search', {
      params: { jql, fields: JiraClient.BASE_FIELDS, maxResults: 50 },
    })
    return res.data.issues
  }

  async getWorklogs(issueKey: string): Promise<JiraWorklog[]> {
    const res = await this.http.get<JiraWorklogResponse>(`/issue/${issueKey}/worklog`, {
      params: { maxResults: 5000 },
    })
    return res.data.worklogs
  }

  async logWork(
    issueKey: string,
    hours: number,
    dateStr: string,
    comment?: string
  ): Promise<void> {
    // started must be in Jira's format: "2024-01-15T09:00:00.000+0000"
    const started = `${dateStr}T09:00:00.000+0000`
    const body: Record<string, unknown> = {
      timeSpent: hoursToJiraTimeSpent(hours),
      started,
    }
    if (comment?.trim()) {
      // v2 plain string; v3 would need ADF format
      body.comment = comment.trim()
    }
    await this.http.post(`/issue/${issueKey}/worklog`, body)
  }

  // ── Higher-level methods used by route handlers ─────────────────────────

  async getDefaultTasks(team: string): Promise<AppTask[]> {
    const keys = config.jira.defaultTasks[team] ?? []
    if (keys.length === 0) return []
    try {
      const issues = await this.getIssues(keys)
      // Preserve the config order
      const issueMap = new Map(issues.map((i) => [i.key, i]))
      return keys
        .map((k) => issueMap.get(k))
        .filter((i): i is JiraIssue => !!i)
        .map((i) => mapIssueToTask(i, true))
    } catch (err: unknown) {
      // Non-existent keys or permission issues should not crash the whole dashboard
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 400 || status === 404) {
        console.warn(`[jiraClient] Default tasks for team ${team} could not be loaded (${status}). Check JIRA_DEFAULT_TASKS_${team} in .env`)
        return []
      }
      throw err
    }
  }

  async getAssignedTasks(team: string): Promise<AppTask[]> {
    const defaultIds = new Set(config.jira.defaultTasks[team] ?? [])

    // Include done tasks if updated within 2 weeks (mirrors old app behaviour)
    const jql =
      'assignee = currentUser() AND (statusCategory != Done OR updated >= -2w) ORDER BY updated DESC'
    const res = await this.http.get<JiraSearchResponse>('/search', {
      params: { jql, fields: JiraClient.BASE_FIELDS, maxResults: 50 },
    })

    // Drop issues that are already shown as default tasks
    const issues = res.data.issues.filter((i) => !defaultIds.has(i.key))

    // Build a position map from Jira's updated-DESC order so we can re-sort
    // after fetching missing parents.
    const positionMap = new Map<string, number>()
    issues.forEach((issue, idx) => {
      positionMap.set(issue.key, idx)
      const parentKey = issue.fields.parent?.key
      if (parentKey) {
        const existing = positionMap.get(parentKey)
        if (existing === undefined || idx < existing) positionMap.set(parentKey, idx)
      }
    })
    const sortByPosition = (tasks: AppTask[]): AppTask[] =>
      [...tasks].sort((a, b) => (positionMap.get(a.id) ?? Infinity) - (positionMap.get(b.id) ?? Infinity))

    // Split: top-level tasks (no parent) vs subtasks (have parent field)
    const topLevelIssues = issues.filter((i) => !i.fields.parent)
    const subtaskIssues = issues.filter((i) => !!i.fields.parent)

    // Group assigned subtasks by their parent key
    const subtasksByParent = new Map<string, AppTask[]>()
    for (const issue of subtaskIssues) {
      const parentKey = issue.fields.parent!.key
      const existing = subtasksByParent.get(parentKey) ?? []
      existing.push(mapIssueToTask(issue, false))
      subtasksByParent.set(parentKey, existing)
    }

    // Map top-level tasks; derive TEST badge from any assigned subtask summaries
    const topLevelIds = new Set(topLevelIssues.map((i) => i.key))
    const topLevelTasks: AppTask[] = topLevelIssues.map((issue) => {
      const task = mapIssueToTask(issue, false)
      const subs = subtasksByParent.get(issue.key)
      if (subs?.length) task.taskType = resolveTypeFromSubtasks(subs)
      return task
    })

    // Parents whose subtasks are assigned to me but the parent itself is not in results
    const missingParentIds = [...subtasksByParent.keys()].filter(
      (id) => !topLevelIds.has(id) && !defaultIds.has(id)
    )

    if (missingParentIds.length === 0) {
      return sortByPosition(topLevelTasks)
    }

    // Fetch missing parent issues in parallel
    const parentIssues = await Promise.all(
      missingParentIds.map((id) =>
        this.http
          .get<JiraIssue>(`/issue/${id}`, { params: { fields: JiraClient.BASE_FIELDS } })
          .then((r) => r.data)
      )
    )

    const parentTasks: AppTask[] = parentIssues.map((issue) => {
      const assignedSubs = subtasksByParent.get(issue.key) ?? []
      const task = mapIssueToTask(issue, false)
      task.isExpandable = true
      task.isParentOnly = true
      task.subtasks = assignedSubs  // pre-loaded; only the user's assigned subtasks
      task.subtaskKeys = undefined  // clear: don't expose all subtask keys, only assigned
      task.taskType = resolveTypeFromSubtasks(assignedSubs)
      return task
    })

    return sortByPosition([...topLevelTasks, ...parentTasks])
  }

  async getSubtasksForTask(parentKey: string): Promise<AppTask[]> {
    const issues = await this.getSubtasks(parentKey)
    return issues.map((i) => mapIssueToTask(i, false))
  }

  async getExistingWorklogs(
    allTaskKeys: string[],
    dateStr: string,
    myUserId: string
  ): Promise<AppTimeEntry[]> {
    if (allTaskKeys.length === 0) return []

    const results = await Promise.allSettled(
      allTaskKeys.map((key) => this.getWorklogs(key))
    )

    const entries: AppTimeEntry[] = []
    for (let i = 0; i < allTaskKeys.length; i++) {
      const result = results[i]
      if (result.status !== 'fulfilled') continue
      const worklogs = result.value

      for (const wl of worklogs) {
        const authorId = userIdentifier(wl.author)
        if (myUserId && authorId !== myUserId) continue
        // Check the date matches (started: "2024-01-15T09:00:00.000+0000")
        if (!wl.started.startsWith(dateStr)) continue

        entries.push({
          taskId: allTaskKeys[i],
          hours: Math.round((wl.timeSpentSeconds / 3600) * 100) / 100,
          date: dateStr,
          comment: getWorklogComment(wl),
        })
      }
    }
    return entries
  }

  async logWorkEntries(
    entries: Array<{ taskId: string; hours: number; date: string; comment?: string }>
  ): Promise<void> {
    await Promise.all(entries.map((e) => this.logWork(e.taskId, e.hours, e.date, e.comment)))
  }

}
