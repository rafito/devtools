import * as path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { ToolBundle, ToolDefinition } from '../types.js'

const execFileAsync = promisify(execFile)

export type LogsToolConfig = {
  logFilePath: string
  maxLines?: number
}

export function createLogsTool(cfg: LogsToolConfig): ToolBundle {
  if (!cfg.logFilePath) throw new Error('logFilePath não configurado')
  const maxLines = cfg.maxLines ?? 500
  const logFile = path.resolve(cfg.logFilePath)

  const definitions: ToolDefinition[] = [{
    name: 'read_logs',
    description: 'Lê as últimas linhas do log do servidor para encontrar erros recentes.',
    input_schema: {
      type: 'object',
      properties: {
        lines: { type: 'number', description: 'Quantas linhas ler (padrão: 100)' },
        filter: { type: 'string', description: 'Filtrar linhas que contenham este texto' },
      },
    },
  }]

  async function execute(name: string, input: Record<string, unknown>): Promise<unknown> {
    if (name !== 'read_logs') return { error: `Ferramenta desconhecida: ${name}` }
    const lines = Math.min((input.lines as number) ?? 100, maxLines)
    const filter = input.filter as string | undefined
    try {
      const { stdout } = await execFileAsync('tail', ['-n', String(lines), logFile])
      const result = filter
        ? stdout.split('\n').filter((l) => l.includes(filter)).join('\n')
        : stdout
      return { logs: result.slice(0, 6000) }
    } catch {
      return { logs: '(arquivo de log não disponível)' }
    }
  }

  return { definitions, execute }
}
