import { Router } from 'express'
import { JiraClient } from '../jiraClient'
import { requireAuth } from '../middleware'

function extractJiraMessage(data: unknown): string {
  if (!data) return ''
  if (typeof data === 'string') return data
  const d = data as Record<string, unknown>
  if (Array.isArray(d.errorMessages) && d.errorMessages.length > 0) return String(d.errorMessages[0])
  if (typeof d.message === 'string') return d.message
  return JSON.stringify(data)
}

function handleJiraError(err: unknown, res: import('express').Response, label: string): void {
  const axiosErr = err as { response?: { status?: number; data?: unknown }; message?: string }
  const status = axiosErr?.response?.status
  const jiraMsg = extractJiraMessage(axiosErr?.response?.data)
  console.error(`[${label}] Jira error`, status ?? axiosErr?.message, jiraMsg)
  if (status === 401 || status === 403) {
    res.status(401).json({ error: 'Unauthorized.' })
  } else if (status === 404) {
    res.status(404).json({ error: 'Worklog or issue not found in Jira.' })
  } else {
    res.status(502).json({ error: `Jira API error${jiraMsg ? ': ' + jiraMsg : ''}` })
  }
}

const router = Router()

// GET /worklogs?date=YYYY-MM-DD
// Uses JQL to find issues where the user has worklogs on the date, then fetches
// only those worklogs. Accurate for subtasks and 'parent-only' tasks.
router.get('/', requireAuth, async (req, res) => {
  const dateStr = req.query.date as string
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    res.status(400).json({ error: 'Query param "date" must be YYYY-MM-DD.' })
    return
  }

  const client = new JiraClient(req.pat!)

  try {
    const [myself, issuesWithWorklogs] = await Promise.all([
      client.getMyself(),
      client.getIssuesWithWorklogsOnDate(dateStr),
    ])

    const myUserId = myself.accountId ?? myself.name ?? myself.key ?? ''

    if (issuesWithWorklogs.length === 0) {
      res.json([])
      return
    }

    const entries = await client.getExistingWorklogs(
      issuesWithWorklogs.map((i) => i.key),
      dateStr,
      myUserId
    )

    // Attach the issue summary so the UI can render tasks the user logged time on
    // that day even when those tasks are no longer in their active/common task list.
    const summaryByKey = new Map(issuesWithWorklogs.map((i) => [i.key, i.summary]))
    for (const e of entries) e.taskSummary = summaryByKey.get(e.taskId)

    res.json(entries)
  } catch (err: unknown) {
    handleJiraError(err, res, 'worklogs GET')
  }
})

// POST /worklogs
// Body: { date: string; entries: Array<{ taskId, hours, date, comment? }> }
router.post('/', requireAuth, async (req, res) => {
  const { date, entries } = req.body as {
    date?: string
    entries?: Array<{ taskId: string; hours: number; date: string; comment?: string }>
  }

  if (!date || !Array.isArray(entries) || entries.length === 0) {
    res.status(400).json({ error: 'Body must include "date" and non-empty "entries" array.' })
    return
  }

  const invalid = entries.find((e) => !e.taskId || !e.hours || e.hours <= 0)
  if (invalid) {
    res.status(400).json({ error: 'Each entry must have a taskId and hours > 0.' })
    return
  }

  const client = new JiraClient(req.pat!)
  try {
    await client.logWorkEntries(entries)
    res.status(204).send()
  } catch (err: unknown) {
    handleJiraError(err, res, 'worklogs POST')
  }
})

// GET /worklogs/task/:taskId?date=YYYY-MM-DD
// Returns the current user's worklog entries for this task on this date, with IDs.
router.get('/task/:taskId', requireAuth, async (req, res) => {
  const dateStr = req.query.date as string
  const { taskId } = req.params
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    res.status(400).json({ error: 'Query param "date" must be YYYY-MM-DD.' })
    return
  }
  const client = new JiraClient(req.pat!)
  try {
    const myself = await client.getMyself()
    const myUserId = myself.accountId ?? myself.name ?? myself.key ?? ''
    const entries = await client.getTaskWorklogsOnDate(taskId, dateStr, myUserId)
    res.json(entries)
  } catch (err: unknown) {
    handleJiraError(err, res, 'worklogs GET task')
  }
})

// PUT /worklogs/task/:taskId/:worklogId  Body: { hours, date, comment? }
router.put('/task/:taskId/:worklogId', requireAuth, async (req, res) => {
  const { taskId, worklogId } = req.params
  const { hours, comment, date } = req.body as { hours?: number; comment?: string; date?: string }
  if (typeof hours !== 'number' || hours <= 0 || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.status(400).json({ error: 'Body must include hours > 0 and date YYYY-MM-DD.' })
    return
  }
  const client = new JiraClient(req.pat!)
  try {
    await client.updateWorklog(taskId, worklogId, hours, date, comment)
    res.status(204).send()
  } catch (err: unknown) {
    handleJiraError(err, res, 'worklogs PUT')
  }
})

// DELETE /worklogs/task/:taskId/:worklogId
router.delete('/task/:taskId/:worklogId', requireAuth, async (req, res) => {
  const { taskId, worklogId } = req.params
  const client = new JiraClient(req.pat!)
  try {
    await client.deleteWorklog(taskId, worklogId)
    res.status(204).send()
  } catch (err: unknown) {
    handleJiraError(err, res, 'worklogs DELETE')
  }
})

export default router
