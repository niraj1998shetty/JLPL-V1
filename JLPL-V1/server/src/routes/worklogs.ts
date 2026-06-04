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
    res.json(entries)
  } catch (err: unknown) {
    const axiosErr = err as { response?: { status?: number; data?: unknown }; message?: string }
    const status = axiosErr?.response?.status
    const jiraMsg = extractJiraMessage(axiosErr?.response?.data)
    console.error('[worklogs GET] Jira error', status ?? axiosErr?.message, jiraMsg)
    if (status === 401 || status === 403) {
      res.status(401).json({ error: 'Unauthorized.' })
    } else {
      res.status(502).json({ error: `Jira API error${jiraMsg ? ': ' + jiraMsg : ''}` })
    }
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
    const axiosErr = err as { response?: { status?: number; data?: unknown }; message?: string }
    const status = axiosErr?.response?.status
    const jiraMsg = extractJiraMessage(axiosErr?.response?.data)
    console.error('[worklogs POST] Jira error', status ?? axiosErr?.message, jiraMsg)
    if (status === 401 || status === 403) {
      res.status(401).json({ error: 'Unauthorized.' })
    } else if (status === 404) {
      res.status(404).json({ error: 'One or more issues not found in Jira.' })
    } else {
      res.status(502).json({ error: `Jira API error${jiraMsg ? ': ' + jiraMsg : ''}` })
    }
  }
})

export default router
