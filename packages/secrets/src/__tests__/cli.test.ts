import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('execa', () => ({
  execaSync: vi.fn(),
  execa: vi.fn(),
}))

vi.mock('../push', () => ({ push: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../pull', () => ({ pull: vi.fn().mockResolvedValue(undefined) }))

import { execaSync } from 'execa'
import { checkPreflight } from '../cli'

describe('checkPreflight', () => {
  afterEach(() => {
    delete process.env.AWS_ACCESS_KEY_ID
    delete process.env.AWS_SECRET_ACCESS_KEY
  })

  it('não lança erro quando chamber está disponível e credentials existem', () => {
    vi.mocked(execaSync).mockReturnValue({ stdout: 'chamber version 2.0', stderr: '', exitCode: 0 } as any)
    process.env.AWS_ACCESS_KEY_ID = 'test'
    process.env.AWS_SECRET_ACCESS_KEY = 'test'
    expect(() => checkPreflight()).not.toThrow()
  })

  it('chama process.exit(1) quando chamber não está no PATH', () => {
    vi.mocked(execaSync).mockImplementation(() => { throw new Error('not found') })
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit') })
    expect(() => checkPreflight()).toThrow('exit')
    exitSpy.mockRestore()
  })
})
