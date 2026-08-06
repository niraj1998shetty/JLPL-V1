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
  isParentOnly?: boolean
  subtaskKeys?: string[]
  subtasks?: AppTask[]
  taskType?: 'dev' | 'test'
  estimatedHours?: number
  remainingHours?: number
  totalLoggedHours?: number
  storyPoints?: number
  updatedAt?: string
}

export interface AppTimeEntry {
  taskId: string
  hours: number
  date: string
  comment?: string
  id?: string         // worklog id
  started?: string    // original Jira-format started timestamp
  taskSummary?: string // issue summary, so the UI can render tasks not in the task list
}

// Thrown by logWorkEntriesAcrossDays when one day's submission fails after
// others already succeeded; the successful ones have already been rolled back
// by the time this is thrown, so the caller can report failure with no cleanup.
export class BulkSubmitError extends Error {
  constructor(public readonly date: string, public readonly taskId: string, public readonly cause: unknown) {
    super(`Failed to log work for ${taskId} on ${date}`)
    this.name = 'BulkSubmitError'
  }
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

function resolveTypeFromSubtasks(subtasks: AppTask[]): 'test' | 'dev' {
  return subtasks.some((s) => TEST_KEYWORDS.some((k) => s.summary.toLowerCase().includes(k)))
    ? 'test'
    : 'dev'
}

function parseStoryPoints(raw: unknown): number | undefined {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  if (typeof raw === 'string') {
    const n = parseFloat(raw)
    return Number.isFinite(n) ? n : undefined
  }
  if (raw && typeof raw === 'object') {
    const v = (raw as { value?: unknown }).value
    if (typeof v === 'number' && Number.isFinite(v)) return v
    if (typeof v === 'string') {
      const n = parseFloat(v)
      return Number.isFinite(n) ? n : undefined
    }
  }
  return undefined
}

function mapIssueToTask(issue: JiraIssue, isDefault: boolean): AppTask {
  const f = issue.fields
  const fieldId = storyPointsFieldId ?? config.jira.storyPointsField
  const storyPoints = fieldId ? parseStoryPoints(f[fieldId]) : undefined

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
    updatedAt: f.updated ?? undefined,
  }
}

function userIdentifier(user: JiraUser): string {
  return user.accountId ?? user.name ?? user.key ?? ''
}

function getWorklogComment(worklog: JiraWorklog): string | undefined {
  if (!worklog.comment) return undefined
  if (typeof worklog.comment === 'object') {
    // Jira v3 ADF format
    try {
      return worklog.comment.content
        .flatMap((block) => block.content)
        .map((node) => node.text)
        .join(' ')
    } catch {
      return undefined
    }
  }
  return worklog.comment
}

// ── Story points field discovery ──────────────────────────────────────────

// Resolved once per process; the field ID never changes for a given Jira instance.
let storyPointsFieldId: string | null | undefined = undefined

async function discoverStoryPointsField(http: AxiosInstance): Promise<string | null> {
  if (storyPointsFieldId !== undefined) return storyPointsFieldId
  try {
    const res = await http.get<Array<{ id: string; name?: string; custom?: boolean }>>('/field')
    const match = res.data.find((f) => {
      const name = (f.name ?? '').toLowerCase()
      return f.custom && (name === 'story points' || name === 'story point estimate')
    })
    storyPointsFieldId = match?.id ?? config.jira.storyPointsField ?? null
  } catch {
    storyPointsFieldId = config.jira.storyPointsField ?? null
  }
  console.log(`[jiraClient] Story points field: ${storyPointsFieldId ?? '(none)'}`)
  return storyPointsFieldId
}

// ── Jira API client ────────────────────────────────────────────────────────

export class JiraClient {
  private http: AxiosInstance

  // 'parent' is required to detect whether an issue is a subtask.
  private static readonly BASE_FIELDS = [
    'summary',
    'issuetype',
    'status',
    'updated',
    'timeoriginalestimate',
    'timeestimate',
    'timespent',
    'aggregatetimespent',
    'subtasks',
    'parent',
  ].join(',')

  constructor(pat: string) {
    if (!config.jira.baseUrl) {
      throw new Error('Server configuration error: JIRA_BASE_URL is not set.')
    }
    if (config.jira.baseUrl.includes('jira.example.com')) {
      throw new Error('Server configuration error: JIRA_BASE_URL is still set to the example value.')
    }

    this.http = axios.create({
      baseURL: `${config.jira.baseUrl}/rest/api/${config.jira.apiVersion}`,
      headers: {
        Authorization: `Bearer ${pat}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: 15000,
    })
  }

  private async fields(): Promise<string> {
    const sp = await discoverStoryPointsField(this.http)
    return sp ? `${JiraClient.BASE_FIELDS},${sp}` : JiraClient.BASE_FIELDS
  }

  // ── Low-level Jira calls ──────────────────────────────────────────────

  async getMyself(): Promise<JiraUser> {
    const res = await this.http.get<JiraUser>('/myself')
    return res.data
  }

  private async searchIssues(jql: string, maxResults: number): Promise<JiraIssue[]> {
    const res = await this.http.get<JiraSearchResponse>('/search', {
      params: { jql, fields: await this.fields(), maxResults },
    })
    return res.data.issues
  }

  private async fetchIssue(key: string): Promise<JiraIssue> {
    const res = await this.http.get<JiraIssue>(`/issue/${key}`, {
      params: { fields: await this.fields() },
    })
    return res.data
  }

  async getIssuesWithWorklogsOnDate(dateStr: string): Promise<Array<{ key: string; summary: string }>> {
    try {
      const jql = `worklogAuthor = currentUser() AND worklogDate = "${dateStr}"`
      const res = await this.http.get<JiraSearchResponse>('/search', {
        params: { jql, fields: 'summary', maxResults: 100 },
      })
      return res.data.issues.map((i) => ({ key: i.key, summary: i.fields?.summary ?? '' }))
    } catch {
      return []
    }
  }

  private async getWorklogs(issueKey: string): Promise<JiraWorklog[]> {
    const res = await this.http.get<JiraWorklogResponse>(`/issue/${issueKey}/worklog`, {
      params: { maxResults: 5000 },
    })
    return res.data.worklogs
  }

  private async logWork(issueKey: string, hours: number, dateStr: string, comment?: string): Promise<{ id: string }> {
    const body: Record<string, unknown> = {
      timeSpent: hoursToJiraTimeSpent(hours),
      started: `${dateStr}T09:00:00.000+0000`,
    }
    if (comment?.trim()) body.comment = comment.trim()
    const res = await this.http.post<JiraWorklog>(`/issue/${issueKey}/worklog`, body)
    return { id: res.data.id }
  }

  // ── Higher-level methods used by route handlers ─────────────────────────

  async getDefaultTasks(team: string): Promise<AppTask[]> {
    const keys = config.jira.defaultTasks[team] ?? []
    if (keys.length === 0) return []
    try {
      const issues = await this.searchIssues(`key in (${keys.join(',')}) ORDER BY key ASC`, keys.length)
      const issueMap = new Map(issues.map((i) => [i.key, i]))
      return keys
        .map((k) => issueMap.get(k))
        .filter((i): i is JiraIssue => !!i)
        .map((i) => mapIssueToTask(i, true))
    } catch (err: unknown) {
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

    // Include done tasks if they were completed within the last 2 weeks. Uses the
    // status-change history (not `updated`) so unrelated activity like someone
    // else's comment doesn't resurrect an already-finished task.
    const jql = 'assignee = currentUser() AND (statusCategory != Done OR status changed to "Done" after -2w) ORDER BY updated DESC'
    const allIssues = await this.searchIssues(jql, 50)
    const issues = allIssues.filter((i) => !defaultIds.has(i.key))
    return this.buildTaskTree(issues, defaultIds)
  }

  // Tasks the user logged time on for a given day, structured the same way as
  // assigned tasks (test badge, expandable subtasks, estimates). Used so an old
  // task logged in the past still renders fully even when it's no longer assigned.
  async getLoggedTasks(dateStr: string, team: string): Promise<AppTask[]> {
    const defaultIds = new Set(config.jira.defaultTasks[team] ?? [])
    const jql = `worklogAuthor = currentUser() AND worklogDate = "${dateStr}"`
    let issues: JiraIssue[]
    try {
      issues = await this.searchIssues(jql, 100)
    } catch {
      return []
    }
    const filtered = issues.filter((i) => !defaultIds.has(i.key))
    return this.buildTaskTree(filtered, defaultIds)
  }

  // Groups a flat list of issues into top-level tasks with their subtasks,
  // fetching parents that aren't in the list so assigned subtasks still nest.
  private async buildTaskTree(issues: JiraIssue[], defaultIds: Set<string>): Promise<AppTask[]> {
    // Position map keeps the incoming order even after fetching missing parents.
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

    const topLevelIssues = issues.filter((i) => !i.fields.parent)
    const subtaskIssues = issues.filter((i) => !!i.fields.parent)

    const subtasksByParent = new Map<string, AppTask[]>()
    for (const issue of subtaskIssues) {
      const parentKey = issue.fields.parent!.key
      const existing = subtasksByParent.get(parentKey) ?? []
      existing.push(mapIssueToTask(issue, false))
      subtasksByParent.set(parentKey, existing)
    }

    const topLevelIds = new Set(topLevelIssues.map((i) => i.key))
    const topLevelTasks: AppTask[] = topLevelIssues.map((issue) => {
      const task = mapIssueToTask(issue, false)
      const subs = subtasksByParent.get(issue.key)
      if (subs?.length) task.taskType = resolveTypeFromSubtasks(subs)
      return task
    })

    // Parents whose subtasks are in the list but the parent itself isn't
    const missingParentIds = [...subtasksByParent.keys()].filter(
      (id) => !topLevelIds.has(id) && !defaultIds.has(id)
    )

    if (missingParentIds.length === 0) {
      return sortByPosition(topLevelTasks)
    }

    const parentIssues = await Promise.all(missingParentIds.map((id) => this.fetchIssue(id)))

    const parentTasks: AppTask[] = parentIssues.map((issue) => {
      const assignedSubs = subtasksByParent.get(issue.key) ?? []
      const task = mapIssueToTask(issue, false)
      task.isExpandable = true
      task.isParentOnly = true
      task.subtasks = assignedSubs
      task.subtaskKeys = undefined
      task.taskType = resolveTypeFromSubtasks(assignedSubs)
      return task
    })

    return sortByPosition([...topLevelTasks, ...parentTasks])
  }

  async getSubtasksForTask(parentKey: string): Promise<AppTask[]> {
    const issues = await this.searchIssues(`parent = ${parentKey} ORDER BY created ASC`, 50)
    return issues.map((i) => mapIssueToTask(i, false))
  }

  // Fetch a single arbitrary issue and structure it like an assigned task so a
  // user can log time against a task that isn't in their common/assigned list
  // (e.g. a PR review against another team's ticket).
  async getTaskById(key: string): Promise<AppTask> {
    const issue = await this.fetchIssue(key)
    // Use the issue's own type only — don't infer 'test' from subtask titles the
    // way assigned tasks do, since the user is logging against this exact task.
    return mapIssueToTask(issue, false)
  }

  async getExistingWorklogs(allTaskKeys: string[], dateStr: string, myUserId: string): Promise<AppTimeEntry[]> {
    if (allTaskKeys.length === 0) return []

    const results = await Promise.allSettled(allTaskKeys.map((key) => this.getWorklogs(key)))
    const entries: AppTimeEntry[] = []

    for (let i = 0; i < allTaskKeys.length; i++) {
      const result = results[i]
      if (result.status !== 'fulfilled') continue

      for (const wl of result.value) {
        if (myUserId && userIdentifier(wl.author) !== myUserId) continue
        if (!wl.started.startsWith(dateStr)) continue

        entries.push({
          taskId: allTaskKeys[i],
          hours: Math.round((wl.timeSpentSeconds / 3600) * 100) / 100,
          date: dateStr,
          comment: getWorklogComment(wl),
          id: wl.id,
          started: wl.started,
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

  // Submits worklog entries across multiple days as a single all-or-nothing
  // operation. Jira has no native multi-op transaction, so we fire every entry,
  // and if any fail, delete every entry that *did* succeed — leaving Jira exactly
  // as it was before the call, rather than a half-submitted week.
  async logWorkEntriesAcrossDays(
    days: Array<{ date: string; entries: Array<{ taskId: string; hours: number; comment?: string }> }>
  ): Promise<void> {
    const flat = days.flatMap((d) => d.entries.map((e) => ({ ...e, date: d.date })))
    const results = await Promise.allSettled(
      flat.map((e) => this.logWork(e.taskId, e.hours, e.date, e.comment))
    )

    const failedIndex = results.findIndex((r) => r.status === 'rejected')
    if (failedIndex === -1) return

    await Promise.allSettled(
      results.map((r, i) =>
        r.status === 'fulfilled' ? this.deleteWorklog(flat[i].taskId, r.value.id) : Promise.resolve()
      )
    )

    const failed = flat[failedIndex]
    const reason = (results[failedIndex] as PromiseRejectedResult).reason
    throw new BulkSubmitError(failed.date, failed.taskId, reason)
  }

  // ── Edit / delete worklog entries ──────────────────────────────────────

  async getTaskWorklogsOnDate(issueKey: string, dateStr: string, myUserId: string): Promise<AppTimeEntry[]> {
    const worklogs = await this.getWorklogs(issueKey)
    const entries: AppTimeEntry[] = []
    for (const wl of worklogs) {
      if (myUserId && userIdentifier(wl.author) !== myUserId) continue
      if (!wl.started.startsWith(dateStr)) continue
      entries.push({
        taskId: issueKey,
        hours: Math.round((wl.timeSpentSeconds / 3600) * 100) / 100,
        date: dateStr,
        comment: getWorklogComment(wl),
        id: wl.id,
        started: wl.started,
      })
    }
    return entries
  }

  async updateWorklog(
    issueKey: string,
    worklogId: string,
    hours: number,
    dateStr: string,
    comment?: string
  ): Promise<void> {
    const body: Record<string, unknown> = {
      timeSpent: hoursToJiraTimeSpent(hours),
      started: `${dateStr}T09:00:00.000+0000`,
      // Empty string clears the comment in Jira v2
      comment: comment?.trim() ?? '',
    }
    await this.http.put(`/issue/${issueKey}/worklog/${worklogId}`, body)
  }

  async deleteWorklog(issueKey: string, worklogId: string): Promise<void> {
    await this.http.delete(`/issue/${issueKey}/worklog/${worklogId}`)
  }

  /**
   * Returns a map of { "YYYY-MM-DD": totalHours } for every day between
   * startDateStr and endDateStr on which the current user logged time.
   * Makes 1 JQL search + N parallel worklog fetches (N = distinct issues in range).
   */
  async getDailyTotalsInRange(
    startDateStr: string,
    endDateStr: string,
    myUserId: string,
  ): Promise<Record<string, number>> {
    const jql = `worklogAuthor = currentUser() AND worklogDate >= "${startDateStr}" AND worklogDate <= "${endDateStr}"`
    const res = await this.http.get<JiraSearchResponse>('/search', {
      params: { jql, fields: 'summary', maxResults: 200 },
    })
    const issueKeys = res.data.issues.map((i) => i.key)
    if (issueKeys.length === 0) return {}

    const worklogResults = await Promise.allSettled(
      issueKeys.map((key) => this.getWorklogs(key)),
    )

    const totals: Record<string, number> = {}
    for (let i = 0; i < issueKeys.length; i++) {
      const result = worklogResults[i]
      if (result.status !== 'fulfilled') continue
      for (const wl of result.value) {
        if (myUserId && userIdentifier(wl.author) !== myUserId) continue
        const date = wl.started.substring(0, 10)
        if (date < startDateStr || date > endDateStr) continue
        totals[date] = (totals[date] ?? 0) + Math.round((wl.timeSpentSeconds / 3600) * 100) / 100
      }
    }
    return totals
  }

  /**
   * Returns one row per task+date the current user logged time on between
   * startDateStr and endDateStr — the range equivalent of getExistingWorklogs,
   * used to prefill the weekly grid. Same 1 JQL search + N parallel worklog
   * fetches as getDailyTotalsInRange, but keeps the per-issue breakdown instead
   * of collapsing it into a single daily total.
   */
  async getWorklogBreakdownInRange(
    startDateStr: string,
    endDateStr: string,
    myUserId: string,
  ): Promise<AppTimeEntry[]> {
    const jql = `worklogAuthor = currentUser() AND worklogDate >= "${startDateStr}" AND worklogDate <= "${endDateStr}"`
    const res = await this.http.get<JiraSearchResponse>('/search', {
      params: { jql, fields: 'summary', maxResults: 200 },
    })
    const issues = res.data.issues
    if (issues.length === 0) return []

    const worklogResults = await Promise.allSettled(
      issues.map((issue) => this.getWorklogs(issue.key)),
    )

    // Sum hours per (taskId, date) so multiple entries on the same task/day collapse
    // into one grid cell, mirroring how getExistingWorklogs sums per task per day.
    const byKey = new Map<string, AppTimeEntry>()
    for (let i = 0; i < issues.length; i++) {
      const result = worklogResults[i]
      if (result.status !== 'fulfilled') continue
      const { key, fields } = issues[i]
      for (const wl of result.value) {
        if (myUserId && userIdentifier(wl.author) !== myUserId) continue
        const date = wl.started.substring(0, 10)
        if (date < startDateStr || date > endDateStr) continue
        const mapKey = `${key}__${date}`
        const existing = byKey.get(mapKey)
        const hours = Math.round((wl.timeSpentSeconds / 3600) * 100) / 100
        if (existing) {
          existing.hours += hours
        } else {
          byKey.set(mapKey, { taskId: key, date, hours, taskSummary: fields?.summary })
        }
      }
    }
    return [...byKey.values()]
  }
}
