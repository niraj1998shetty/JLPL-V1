// Raw Jira API response shapes (subset of fields we actually use)

export interface JiraUser {
  accountId?: string   // Jira Cloud
  name?: string        // Jira Server/DC
  key?: string         // Jira Server/DC (legacy)
  displayName: string
  emailAddress?: string
}

export interface JiraIssueFields {
  summary: string
  issuetype: { name: string; subtask: boolean }
  status: { name: string }
  timeoriginalestimate: number | null   // seconds
  timeestimate: number | null           // remaining seconds
  timespent: number | null              // logged seconds (own fields)
  aggregatetimespent: number | null     // logged seconds (including subtasks)
  subtasks: Array<{
    id: string
    key: string
    fields: { summary: string; issuetype: { name: string; subtask: boolean } }
  }>
  parent?: { key: string; id: string }  // present when this issue is a subtask
  // story points — field name varies per instance (customfield_10016 etc.)
  [key: string]: unknown
}

export interface JiraIssue {
  id: string
  key: string
  fields: JiraIssueFields
}

export interface JiraSearchResponse {
  issues: JiraIssue[]
  total: number
  maxResults: number
}

export interface JiraWorklog {
  id: string
  author: JiraUser
  timeSpentSeconds: number
  started: string   // ISO datetime string
  comment?: string | { content: Array<{ content: Array<{ text: string }> }> }
}

export interface JiraWorklogResponse {
  worklogs: JiraWorklog[]
  total: number
  maxResults: number
  startAt: number
}
