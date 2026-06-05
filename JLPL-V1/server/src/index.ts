import cors from 'cors'
import express from 'express'
import { config } from './config'
import authRouter from './routes/auth'
import tasksRouter from './routes/tasks'
import worklogsRouter from './routes/worklogs'

const app = express()

const allowedOrigins = config.corsOrigin.split(',').map(o => o.trim())
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true)
    } else {
      callback(new Error('Not allowed by CORS'))
    }
  },
  credentials: true
}))
app.use(express.json())

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', jira: config.jira.baseUrl })
})

app.use('/auth', authRouter)
app.use('/tasks', tasksRouter)
app.use('/worklogs', worklogsRouter)

// 404 catch-all
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found.' })
})

app.listen(config.port, () => {
  console.log(`[server] Listening on http://localhost:${config.port}`)
  console.log(`[server] Jira base URL: ${config.jira.baseUrl}`)
})

export default app