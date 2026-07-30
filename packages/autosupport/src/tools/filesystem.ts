import { execFile } from 'node:child_process'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { promisify } from 'node:util'
import { toErrorMessage } from '../errors.js'
import type { ToolBundle, ToolDefinition } from '../types.js'

const execFileAsync = promisify(execFile)

export type FilesystemToolsConfig = {
  rootDir: string
  protectedPatterns?: RegExp[]
}

export function createFilesystemTools(cfg: FilesystemToolsConfig): ToolBundle {
  if (!cfg.rootDir) throw new Error('rootDir não configurado')
  const root = path.resolve(cfg.rootDir)
  const protectedPatterns = cfg.protectedPatterns ?? []

  function safeResolvePath(filePath: string): string {
    const resolved = path.resolve(root, filePath)
    const rootSep = root.endsWith(path.sep) ? root : root + path.sep
    if (resolved !== root && !resolved.startsWith(rootSep))
      throw new Error('Acesso fora do diretório do projeto negado.')
    return resolved
  }

  function isProtected(filePath: string): boolean {
    const normalized = filePath.replace(/\\/g, '/').replace(/^\//, '')
    return protectedPatterns.some((p) => p.test(normalized))
  }

  const definitions: ToolDefinition[] = [
    {
      name: 'read_file',
      description:
        'Lê o conteúdo de um arquivo do codebase. Use para entender o código relevante ao bug.',
      input_schema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Caminho relativo ao root do projeto' },
        },
        required: ['path'],
      },
    },
    {
      name: 'search_code',
      description: 'Busca por uma string ou padrão no codebase usando grep.',
      input_schema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Texto ou padrão regex a buscar' },
          directory: { type: 'string', description: "Diretório a buscar (padrão: '.')" },
        },
        required: ['query'],
      },
    },
    {
      name: 'write_file',
      description:
        'Escreve conteúdo em um arquivo do codebase. Arquivos protegidos não podem ser modificados.',
      input_schema: {
        type: 'object',
        properties: { path: { type: 'string' }, content: { type: 'string' } },
        required: ['path', 'content'],
      },
    },
  ]

  async function execute(name: string, input: Record<string, unknown>): Promise<unknown> {
    switch (name) {
      case 'read_file': {
        const filePath = input.path as string
        if (isProtected(filePath)) return { error: `Arquivo protegido: ${filePath}` }
        try {
          const resolved = safeResolvePath(filePath)
          const content = await fs.readFile(resolved, 'utf8')
          return { content: content.slice(0, 8000) }
        } catch (err) {
          console.error('[autosupport-fs]', err)
          return { error: toErrorMessage(err) }
        }
      }
      case 'search_code': {
        try {
          const dir = safeResolvePath((input.directory as string) ?? '.')
          const { stdout } = await execFileAsync(
            'grep',
            [
              '-r',
              '-n',
              '--binary-files=without-match',
              '--exclude-dir=.git',
              '--exclude-dir=node_modules',
              '--exclude-dir=.venv',
              '--exclude-dir=venv',
              '--exclude-dir=dist',
              '--exclude=.env',
              '--exclude=.env.*',
              '--exclude=*.pem',
              '--exclude=*.key',
              '--max-count=20',
              '--',
              input.query as string,
              dir,
            ],
            { maxBuffer: 1024 * 1024 }
          )
          return { matches: stdout.slice(0, 4000) }
        } catch (err) {
          // grep exits 1 when there are no matches — not an error here.
          if ((err as { code?: number }).code === 1) return { matches: '(nenhum resultado)' }
          console.error('[autosupport-fs]', err)
          return { error: toErrorMessage(err) }
        }
      }
      case 'write_file': {
        const filePath = input.path as string
        if (isProtected(filePath)) return { error: `Arquivo protegido: ${filePath}` }
        try {
          const resolved = safeResolvePath(filePath)
          await fs.mkdir(path.dirname(resolved), { recursive: true })
          await fs.writeFile(resolved, input.content as string, 'utf8')
          return { success: true }
        } catch (err) {
          console.error('[autosupport-fs]', err)
          return { error: toErrorMessage(err) }
        }
      }
      default:
        return { error: `Ferramenta desconhecida: ${name}` }
    }
  }

  return { definitions, execute }
}
