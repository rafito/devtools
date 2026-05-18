import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
}))

vi.mock('execa', () => ({
  execaSync: vi.fn(),
  execa: vi.fn(),
}))

vi.mock('../push', () => ({ push: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../pull', () => ({ pull: vi.fn().mockResolvedValue(undefined) }))

import { existsSync } from 'node:fs'
import { execaSync } from 'execa'
import { checkPreflight } from '../cli'

describe('checkPreflight', () => {
  afterEach(() => {
    Reflect.deleteProperty(process.env, 'AWS_ACCESS_KEY_ID')
    Reflect.deleteProperty(process.env, 'AWS_SECRET_ACCESS_KEY')
    Reflect.deleteProperty(process.env, 'AWS_PROFILE')
    vi.clearAllMocks()
  })

  it('não lança erro quando chamber está disponível e credentials existem via env vars', () => {
    vi.mocked(execaSync).mockReturnValue({
      stdout: 'chamber version 2.0',
      stderr: '',
      exitCode: 0,
    } as unknown as ReturnType<typeof execaSync>)
    vi.mocked(existsSync).mockReturnValue(false)
    process.env.AWS_ACCESS_KEY_ID = 'test-key'
    process.env.AWS_SECRET_ACCESS_KEY = 'test-secret'
    expect(() => checkPreflight()).not.toThrow()
  })

  it('não lança erro quando credentials existem via arquivo ~/.aws/credentials', () => {
    vi.mocked(execaSync).mockReturnValue({
      stdout: 'chamber version 2.0',
      stderr: '',
      exitCode: 0,
    } as unknown as ReturnType<typeof execaSync>)
    vi.mocked(existsSync).mockReturnValue(true)
    expect(() => checkPreflight()).not.toThrow()
  })

  it('chama process.exit(1) quando chamber não está no PATH', () => {
    vi.mocked(execaSync).mockImplementation(() => {
      throw new Error('not found')
    })
    vi.mocked(existsSync).mockReturnValue(false)
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exit')
    })
    expect(() => checkPreflight()).toThrow('exit')
    exitSpy.mockRestore()
  })

  it('chama process.exit(1) quando chamber está disponível mas não há credentials', () => {
    vi.mocked(execaSync).mockReturnValue({
      stdout: 'chamber version 2.0',
      stderr: '',
      exitCode: 0,
    } as unknown as ReturnType<typeof execaSync>)
    vi.mocked(existsSync).mockReturnValue(false)
    // No env vars set, no credentials file
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exit')
    })
    expect(() => checkPreflight()).toThrow('exit')
    exitSpy.mockRestore()
  })
})
