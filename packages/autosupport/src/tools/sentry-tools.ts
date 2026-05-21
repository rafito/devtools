import type { ToolBundle, ToolDefinition } from '../types.js'
import type { SentryClient } from '../clients/sentry-api.js'

export function createSentryTool(client: SentryClient): ToolBundle {
  if (!client) throw new Error('Sentry client não configurado')

  const definitions: ToolDefinition[] = [{
    name: 'query_sentry',
    description: 'Consulta a API do Sentry. Use issueId se o ticket veio do Sentry, ou query para buscar por palavras-chave.',
    input_schema: {
      type: 'object',
      properties: {
        issueId: { type: 'string', description: 'ID do issue no Sentry' },
        query: { type: 'string', description: 'Palavras-chave para buscar issues' },
      },
    },
  }]

  async function execute(name: string, input: Record<string, unknown>): Promise<unknown> {
    if (name !== 'query_sentry') return { error: `Ferramenta desconhecida: ${name}` }
    const issueId = input.issueId as string | undefined
    const query = input.query as string | undefined
    if (!issueId && !query) return { error: 'issueId ou query obrigatório' }
    try {
      if (issueId) return await client.getIssue(issueId)
      return await client.searchIssues(query!)
    } catch (err: any) {
      console.error('[autosupport-sentry-tools]', err)
      return { error: err.message }
    }
  }

  return { definitions, execute }
}
