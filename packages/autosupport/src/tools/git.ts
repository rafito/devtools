import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { ToolBundle, ToolDefinition } from '../types.js'

const execFileAsync = promisify(execFile)

export type GitToolsConfig = {
  token: string
  repo: string
  rootDir: string
}

export function createGitTools(cfg: GitToolsConfig): ToolBundle {
  if (!cfg.token) throw new Error('GIT token não configurado')
  if (!cfg.repo) throw new Error('GIT repo não configurado')
  if (!cfg.rootDir) throw new Error('rootDir não configurado')

  const definitions: ToolDefinition[] = [
    {
      name: 'git_branch',
      description: 'Cria uma nova branch git e faz checkout.',
      input_schema: {
        type: 'object',
        properties: { name: { type: 'string', description: 'Nome da branch' } },
        required: ['name'],
      },
    },
    {
      name: 'git_commit_push',
      description: 'Stage + commit + push dos arquivos modificados.',
      input_schema: {
        type: 'object',
        properties: {
          files: { type: 'array', items: { type: 'string' } },
          message: { type: 'string' },
          branch: { type: 'string' },
        },
        required: ['files', 'message', 'branch'],
      },
    },
  ]

  async function execute(name: string, input: Record<string, unknown>): Promise<unknown> {
    try {
      switch (name) {
        case 'git_branch': {
          await execFileAsync('git', ['checkout', '-b', input.name as string], { cwd: cfg.rootDir })
          return { success: true }
        }
        case 'git_commit_push': {
          const files = input.files as string[]
          const message = input.message as string
          const branch = input.branch as string
          await execFileAsync('git', [
            'remote', 'set-url', 'origin',
            `https://${cfg.token}@github.com/${cfg.repo}.git`,
          ], { cwd: cfg.rootDir })
          await execFileAsync('git', ['add', '--', ...files], { cwd: cfg.rootDir })
          await execFileAsync('git', ['commit', '-m', message], { cwd: cfg.rootDir })
          await execFileAsync('git', ['push', 'origin', branch], { cwd: cfg.rootDir })
          return { success: true }
        }
        default:
          return { error: `Ferramenta desconhecida: ${name}` }
      }
    } catch (err: any) {
      const sanitized = (err.message ?? '').split(cfg.token).join('***')
      console.error('[autosupport-git]', sanitized)
      return { error: sanitized }
    }
  }

  return { definitions, execute }
}
