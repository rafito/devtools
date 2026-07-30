import { describe, expect, it, vi } from 'vitest'
import { runCli } from '../src/cli'

describe('autosupport CLI', () => {
  it('prints help', async () => {
    const stdout = vi.fn()
    const code = await runCli(['--help'], {}, { stdout, stderr: vi.fn() })
    expect(code).toBe(0)
    expect(stdout.mock.calls.join('\n')).toContain('autosupport serve')
  })

  it('rejects unknown commands', async () => {
    const stderr = vi.fn()
    const code = await runCli(['unknown'], {}, { stdout: vi.fn(), stderr })
    expect(code).toBe(1)
    expect(stderr.mock.calls.join('\n')).toContain('Comando desconhecido')
  })

  it('loads config and starts the service', async () => {
    const startService = vi.fn().mockResolvedValue({
      url: 'http://127.0.0.1:4310',
      close: vi.fn(),
    })
    const stdout = vi.fn()
    const code = await runCli(
      ['serve'],
      {
        AUTOSUPPORT_DATABASE_URL: 'postgres://localhost/autosupport',
        AUTOSUPPORT_GITHUB_TOKEN: 'github-token',
        AUTOSUPPORT_GITHUB_REPO: 'org/repo',
        AUTOSUPPORT_GITHUB_WEBHOOK_SECRET: 'github-secret',
        AUTOSUPPORT_ROOT_DIR: '/workspace/app',
        AUTOSUPPORT_SERVICE_TOKEN: 'service-token-with-enough-entropy',
        OPENAI_API_KEY: 'openai-key',
      },
      { stdout, stderr: vi.fn(), startService, registerSignals: false }
    )

    expect(code).toBe(0)
    expect(startService).toHaveBeenCalled()
    expect(stdout.mock.calls.join('\n')).toContain('http://127.0.0.1:4310')
  })

  it('prints startup errors without leaking a stack', async () => {
    const stderr = vi.fn()
    const code = await runCli(['serve'], {}, { stdout: vi.fn(), stderr })
    expect(code).toBe(1)
    expect(stderr.mock.calls.join('\n')).toContain('AUTOSUPPORT_SERVICE_TOKEN')
  })
})
