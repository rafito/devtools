import { describe, expect, it, vi } from 'vitest'

vi.mock('node:fs', () => ({
  readFileSync: vi.fn().mockReturnValue('KEY1=value1\nKEY2=value2\n# comentário\n\nKEY3=value3\n'),
}))

vi.mock('execa', () => ({
  execa: vi.fn().mockResolvedValue({ stdout: '', stderr: '' }),
}))

import { execa } from 'execa'
import { push } from '../push'

describe('push', () => {
  it('chama chamber write para cada variável do .env', async () => {
    await push({ envFile: '.env', service: 'app', envName: 'staging' })
    expect(execa).toHaveBeenCalledWith('chamber', ['write', 'app/staging', 'KEY1', 'value1'])
    expect(execa).toHaveBeenCalledWith('chamber', ['write', 'app/staging', 'KEY2', 'value2'])
    expect(execa).toHaveBeenCalledWith('chamber', ['write', 'app/staging', 'KEY3', 'value3'])
  })

  it('ignora comentários e linhas em branco', async () => {
    vi.mocked(execa).mockClear()
    await push({ envFile: '.env', service: 'app', envName: 'staging' })
    expect(execa).toHaveBeenCalledTimes(3)
  })

  it('não chama o chamber em dry-run', async () => {
    vi.mocked(execa).mockClear()
    await push({ envFile: '.env', service: 'app', envName: 'staging', dryRun: true })
    expect(execa).not.toHaveBeenCalled()
  })
})
