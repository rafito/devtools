import { describe, it, expect } from 'vitest'
import { createTestsTool } from '../../src/tools/tests'

describe('createTestsTool', () => {
  it('roda um comando que passa retorna passed=true', async () => {
    const t = createTestsTool({ command: 'true', args: [] })
    const r = await t.execute('run_tests', {}) as any
    expect(r.passed).toBe(true)
  })

  it('roda um comando que falha retorna passed=false', async () => {
    const t = createTestsTool({ command: 'false', args: [] })
    const r = await t.execute('run_tests', {}) as any
    expect(r.passed).toBe(false)
  })

  it('repassa pattern como último arg', async () => {
    // Usa `node -e` pra logar argv e exit 0
    const t = createTestsTool({ command: 'node', args: ['-e', 'console.log(process.argv.slice(1).join("|"))'] })
    const r = await t.execute('run_tests', { pattern: 'foo.test.ts' }) as any
    expect(r.output).toContain('foo.test.ts')
  })

  it('nome desconhecido retorna erro', async () => {
    const t = createTestsTool()
    const r = await t.execute('unknown', {}) as any
    expect(r.error).toContain('desconhecida')
  })
})
