import { describe, expect, it, vi } from 'vitest'

vi.mock('node:fs', () => ({
  existsSync: vi.fn().mockReturnValue(false),
  writeFileSync: vi.fn(),
}))

vi.mock('execa', () => ({
  execa: vi.fn().mockResolvedValue({
    stdout: 'KEY1=value1\nKEY2=value2\n',
    stderr: '',
  }),
}))

import { existsSync, writeFileSync } from 'node:fs'
import { execa } from 'execa'
import { pull } from '../pull'

describe('pull', () => {
  it('chama chamber export com o service correto e formato dotenv', async () => {
    vi.mocked(existsSync).mockReturnValue(false)
    await pull({ service: 'app', envName: 'staging', output: '.env.staging' })
    expect(execa).toHaveBeenCalledWith('chamber', ['export', 'app/staging', '--format', 'dotenv'])
  })

  it('escreve o output do chamber no arquivo de destino', async () => {
    vi.mocked(existsSync).mockReturnValue(false)
    await pull({ service: 'app', envName: 'staging', output: '.env.staging' })
    expect(writeFileSync).toHaveBeenCalledWith(
      '.env.staging',
      'KEY1=value1\nKEY2=value2\n',
      'utf-8'
    )
  })

  it('não escreve o arquivo em dry-run', async () => {
    vi.mocked(writeFileSync).mockClear()
    await pull({ service: 'app', envName: 'staging', output: '.env.staging', dryRun: true })
    expect(writeFileSync).not.toHaveBeenCalled()
  })

  it('recusa sobrescrever output existente sem --force', async () => {
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(writeFileSync).mockClear()
    await expect(
      pull({ service: 'app', envName: 'staging', output: '.env.staging' })
    ).rejects.toThrow(/Refusing to overwrite/)
    expect(writeFileSync).not.toHaveBeenCalled()
  })

  it('sobrescreve output existente quando --force', async () => {
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(writeFileSync).mockClear()
    await pull({ service: 'app', envName: 'staging', output: '.env.staging', force: true })
    expect(writeFileSync).toHaveBeenCalled()
  })

  it('dry-run imprime só os nomes das keys, não os valores', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    await pull({ service: 'app', envName: 'staging', output: '.env.staging', dryRun: true })
    const printed = log.mock.calls.map((c) => c.join(' ')).join('\n')
    expect(printed).toContain('KEY1')
    expect(printed).toContain('KEY2')
    expect(printed).not.toContain('value1')
    expect(printed).not.toContain('value2')
    log.mockRestore()
  })
})
