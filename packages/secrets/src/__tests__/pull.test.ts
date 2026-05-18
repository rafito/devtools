import { describe, expect, it, vi } from 'vitest'

vi.mock('node:fs', () => ({
  writeFileSync: vi.fn(),
}))

vi.mock('execa', () => ({
  execa: vi.fn().mockResolvedValue({
    stdout: 'KEY1=value1\nKEY2=value2\n',
    stderr: '',
  }),
}))

import { writeFileSync } from 'node:fs'
import { execa } from 'execa'
import { pull } from '../pull'

describe('pull', () => {
  it('chama chamber env com o service correto', async () => {
    await pull({ service: 'app', envName: 'staging', output: '.env.staging' })
    expect(execa).toHaveBeenCalledWith('chamber', ['env', 'app/staging'])
  })

  it('escreve o output do chamber no arquivo de destino', async () => {
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
})
