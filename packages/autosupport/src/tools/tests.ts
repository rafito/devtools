import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { toErrorMessage } from '../errors.js'
import type { ToolBundle, ToolDefinition } from '../types.js'

const execFileAsync = promisify(execFile)

export type TestsToolConfig = {
  command?: string
  args?: string[]
  env?: Record<string, string>
  cwd?: string
  timeoutMs?: number
}

export function createTestsTool(cfg: TestsToolConfig = {}): ToolBundle {
  const command = cfg.command ?? 'npx'
  const baseArgs = cfg.args ?? ['vitest', 'run', '--reporter=verbose']
  const extraEnv = cfg.env ?? {}
  const cwd = cfg.cwd
  const timeout = cfg.timeoutMs ?? 120_000

  const definitions: ToolDefinition[] = [
    {
      name: 'run_tests',
      description:
        'Executa os testes unitários. Use após escrever o fix para verificar que não quebrou nada.',
      input_schema: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Padrão de arquivo de teste (opcional)' },
        },
      },
    },
  ]

  async function execute(name: string, input: Record<string, unknown>): Promise<unknown> {
    if (name !== 'run_tests') return { error: `Ferramenta desconhecida: ${name}` }
    const pattern = input.pattern as string | undefined
    const args = pattern ? [...baseArgs, pattern] : baseArgs
    try {
      const { stdout, stderr } = await execFileAsync(command, args, {
        env: { ...process.env, ...extraEnv },
        cwd,
        timeout,
      })
      return { passed: true, output: (stdout + stderr).slice(0, 6000) }
    } catch (err) {
      const e = err as { stdout?: string; stderr?: string }
      const output = ((e.stdout ?? '') + (e.stderr ?? '') + toErrorMessage(err)).slice(0, 6000)
      return { passed: false, output }
    }
  }

  return { definitions, execute }
}
