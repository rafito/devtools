export type SentryConfig = {
  apiToken: string
  orgSlug: string
  projectSlug: string
  apiBase?: string  // default https://us.sentry.io/api/0
}

export type SentryIssueResult = {
  title: string
  culprit: string
  occurrences: number
  usersAffected: number
  firstSeen: string
  lastSeen: string
  permalink: string
  stackTrace: string
}

export type SentrySearchResult = {
  issues: Array<{
    id: string
    title: string
    culprit: string
    occurrences: number
    usersAffected: number
    lastSeen: string
    permalink: string
  }>
}

export function createSentryClient(cfg: SentryConfig) {
  if (!cfg.apiToken) throw new Error('SENTRY_API_TOKEN não configurado')
  if (!cfg.orgSlug) throw new Error('SENTRY_ORG_SLUG não configurado')
  if (!cfg.projectSlug) throw new Error('SENTRY_PROJECT_SLUG não configurado')

  const base = (cfg.apiBase ?? 'https://us.sentry.io/api/0') +
               `/organizations/${cfg.orgSlug}`
  const headers = {
    Authorization: `Bearer ${cfg.apiToken}`,
    'Content-Type': 'application/json',
  }

  async function getIssue(issueId: string): Promise<SentryIssueResult | { error: string }> {
    try {
      const [issueRes, eventRes] = await Promise.all([
        fetch(`${base}/issues/${issueId}/`, { headers }),
        fetch(`${base}/issues/${issueId}/events/latest/`, { headers }),
      ])
      if (!issueRes.ok) return { error: `Sentry API error: ${issueRes.status}` }
      const issue = await issueRes.json() as any
      let stackTrace = '(stack trace não disponível)'
      if (eventRes.ok) {
        const event = await eventRes.json() as any
        const exc = event.entries?.find((e: any) => e.type === 'exception')
        const frames: any[] = exc?.data?.values?.[0]?.stacktrace?.frames ?? []
        stackTrace = frames.slice(-10)
          .map((f: any) => `  ${f.filename}:${f.lineno} in ${f.function}`)
          .join('\n').slice(0, 4000)
      }
      return {
        title: issue.title,
        culprit: issue.culprit,
        occurrences: parseInt(issue.count ?? '0', 10),
        usersAffected: issue.userCount ?? 0,
        firstSeen: issue.firstSeen,
        lastSeen: issue.lastSeen,
        permalink: issue.permalink,
        stackTrace,
      }
    } catch (err: any) {
      return { error: `Erro ao consultar Sentry: ${err.message}` }
    }
  }

  async function searchIssues(query: string): Promise<SentrySearchResult | { error: string }> {
    try {
      const url = `${base}/issues/?query=${encodeURIComponent(query)}&project=${cfg.projectSlug}&limit=3`
      const res = await fetch(url, { headers })
      if (!res.ok) return { error: `Sentry API error: ${res.status}` }
      const issues = await res.json() as any[]
      return {
        issues: issues.map((i: any) => ({
          id: i.id,
          title: i.title,
          culprit: i.culprit,
          occurrences: parseInt(i.count ?? '0', 10),
          usersAffected: i.userCount ?? 0,
          lastSeen: i.lastSeen,
          permalink: i.permalink,
        })),
      }
    } catch (err: any) {
      return { error: `Erro ao consultar Sentry: ${err.message}` }
    }
  }

  return { getIssue, searchIssues }
}

export type SentryClient = ReturnType<typeof createSentryClient>
