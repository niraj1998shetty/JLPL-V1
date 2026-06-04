import { Router } from 'express'
import { JiraClient } from '../jiraClient'

const router = Router()

router.post('/validate', async (req, res) => {
  const { pat, team } = req.body as { pat?: string; team?: string }

  if (!pat?.trim()) {
    res.status(400).json({ valid: false, error: 'PAT is required.' })
    return
  }

  try {
    const client = new JiraClient(pat.trim())
    const user = await client.getMyself()
    res.json({ valid: true, name: user.displayName, team })
  } catch (err: unknown) {
    const message = (err as { message?: string })?.message ?? ''
    const status = (err as { response?: { status?: number } })?.response?.status

    if (message.includes('JIRA_BASE_URL')) {
      res.status(500).json({ valid: false, error: message })
    } else if (status === 401 || status === 403) {
      res.status(401).json({ valid: false, error: 'Invalid or expired PAT.' })
    } else {
      res.status(502).json({ valid: false, error: 'Could not reach Jira. Check JIRA_BASE_URL.' })
    }
  }
})

export default router
