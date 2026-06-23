import { Router } from 'express'
import { JiraClient } from '../jiraClient'
import { requireAuth } from '../middleware'

const router = Router()

router.get('/default', requireAuth, async (req, res) => {
  const client = new JiraClient(req.pat!)
  const team = req.team ?? 'DMO'
  try {
    const tasks = await client.getDefaultTasks(team)
    res.json(tasks)
  } catch (err: unknown) {
    handleJiraError(err, res)
  }
})

router.get('/assigned', requireAuth, async (req, res) => {
  const client = new JiraClient(req.pat!)
  const team = req.team ?? 'DMO'
  try {
    const tasks = await client.getAssignedTasks(team)
    res.json(tasks)
  } catch (err: unknown) {
    handleJiraError(err, res)
  }
})

// GET /tasks/logged?date=YYYY-MM-DD
// Tasks the user logged time on that day, structured like assigned tasks
// (test badge, expandable subtasks). Lets old logged tasks render fully.
router.get('/logged', requireAuth, async (req, res) => {
  const dateStr = req.query.date as string
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    res.status(400).json({ error: 'Query param "date" must be YYYY-MM-DD.' })
    return
  }
  const client = new JiraClient(req.pat!)
  const team = req.team ?? 'DMO'
  try {
    const tasks = await client.getLoggedTasks(dateStr, team)
    res.json(tasks)
  } catch (err: unknown) {
    handleJiraError(err, res)
  }
})

router.get('/:id/subtasks', requireAuth, async (req, res) => {
  const client = new JiraClient(req.pat!)
  const { id } = req.params
  try {
    const tasks = await client.getSubtasksForTask(id)
    res.json(tasks)
  } catch (err: unknown) {
    handleJiraError(err, res)
  }
})

function extractJiraMessage(data: unknown): string {
  if (!data) return ''
  if (typeof data === 'string') return data
  const d = data as Record<string, unknown>
  if (Array.isArray(d.errorMessages) && d.errorMessages.length > 0) return String(d.errorMessages[0])
  if (typeof d.message === 'string') return d.message
  return JSON.stringify(data)
}

function handleJiraError(err: unknown, res: import('express').Response): void {
  const axiosErr = err as { response?: { status?: number; data?: unknown }; message?: string }
  const status = axiosErr?.response?.status
  const jiraMsg = extractJiraMessage(axiosErr?.response?.data)
  console.error('[tasks] Jira error', status ?? axiosErr?.message, jiraMsg)
  if (status === 401 || status === 403) {
    res.status(401).json({ error: 'Unauthorized. Check your PAT.' })
  } else if (status === 404) {
    res.status(404).json({ error: 'Issue not found in Jira.' })
  } else if (status === 400) {
    res.status(400).json({ error: `Jira rejected the request: ${jiraMsg || 'bad JQL or unknown field'}` })
  } else {
    res.status(502).json({ error: `Jira API error${jiraMsg ? ': ' + jiraMsg : ''}` })
  }
}

export default router
