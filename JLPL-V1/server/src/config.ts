import 'dotenv/config'

function readEnv(name: string): string {
  return (process.env[name] ?? '').trim()
}

function normalizeBaseUrl(raw: string): string {
  return raw.replace(/\/$/, '')
}

export const config = {
  port: parseInt(process.env.PORT ?? '3001', 10),
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',

  jira: {
    baseUrl: normalizeBaseUrl(readEnv('JIRA_BASE_URL')),
    apiVersion: process.env.JIRA_API_VERSION ?? '2',
    storyPointsField: process.env.JIRA_STORY_POINTS_FIELD ?? 'customfield_10016',
    defaultTasks: {
      DMO: ['DMO-6276', 'DMO-6270'],
      DFO: ['DFO-100', 'DFO-101'],
    } as Record<string, string[]>,
  },
}
