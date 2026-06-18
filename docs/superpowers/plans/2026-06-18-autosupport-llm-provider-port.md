# LlmProvider Port (F1a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Abstrair o LLM atrás de um port `LlmProvider` implementado via Vercel AI SDK, com adapters Anthropic e OpenAI, sem quebrar o modo embedded.

**Architecture:** O tool-loop (hoje `runToolLoop` acoplado ao `@anthropic-ai/sdk`) passa a viver num core agnóstico (`src/llm/loop.ts`) que recebe um `LanguageModelV2` (AI SDK). Providers (`anthropic`/`openai`) só resolvem `nome do modelo → LanguageModelV2`. Os 4 tiers deixam de instanciar `new Anthropic()` e passam a receber um `LlmProvider` injetado pela factory. Retrocompat: `anthropicApiKey` continua aceito e é mapeado para `llm: { provider: 'anthropic' }`.

**Tech Stack:** TypeScript ESM (imports com `.js`), Vitest, Biome, pnpm workspace. Vercel AI SDK v5 (`ai`, `@ai-sdk/anthropic`, `@ai-sdk/openai`).

## Global Constraints

- **ESM:** todo import relativo termina em `.js` (ex: `import { x } from './loop.js'`).
- **Node:** `engines.node >= 18`. Nenhuma API acima disso.
- **API pública estável:** `index.ts` não pode remover exports existentes nesta fase; `createSupportPipeline(cfg)` deve continuar funcionando com `cfg.anthropicApiKey` (retrocompat).
- **Rodar testes:** `pnpm --filter @devorama/autosupport test` (vitest run). Lint: `pnpm --filter @devorama/autosupport lint`.
- **Modelos por papel (`modelMap`):** `fast` → Anthropic `claude-haiku-4-5` / OpenAI `gpt-4.1-mini`; `heavy` → Anthropic `claude-opus-4-7` / OpenAI `gpt-4.1`. Tier 1 usa `fast`; Tiers 2–4 usam `heavy`.
- **Mensagens neutras:** o pipeline usa `LlmMessage = { role: 'user' | 'assistant' | 'system'; content: string }`. Conversão para/de formatos de provider fica dentro de `src/llm/`.

---

### Task 1: Dependências e contrato do port

**Files:**
- Modify: `packages/autosupport/package.json` (adicionar deps)
- Create: `packages/autosupport/src/llm/types.ts`
- Test: `packages/autosupport/tests/llm/types.test.ts`

**Interfaces:**
- Produces:
  - `type LlmMessage = { role: 'user' | 'assistant' | 'system'; content: string }`
  - `type LlmModelRole = 'fast' | 'heavy'`
  - `type LlmRunOptions = { role: LlmModelRole; system: string; messages: LlmMessage[]; tools: ToolBundle; maxToolLoops: number; maxTokens?: number; onToolResult?: (name: string, input: Record<string, unknown>, result: unknown) => void }`
  - `type LlmRunResult = { text: string; steps: number; finishReason: string | null }`
  - `interface LlmProvider { runWithTools(opts: LlmRunOptions): Promise<LlmRunResult> }`

- [ ] **Step 1: Adicionar deps**

Em `packages/autosupport/package.json`, dentro de `dependencies` (criar a chave se não existir), adicionar:
```json
"ai": "^5.0.0",
"@ai-sdk/anthropic": "^2.0.0",
"@ai-sdk/openai": "^2.0.0"
```
Rodar: `pnpm --filter @devorama/autosupport install`
Expected: instala sem erro de peer.

- [ ] **Step 2: Escrever o teste do contrato (falha)**

`packages/autosupport/tests/llm/types.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import type { LlmProvider, LlmRunOptions, LlmRunResult } from '../../src/llm/types'
import type { ToolBundle } from '../../src/types'

describe('LlmProvider contract', () => {
  it('runWithTools resolve um LlmRunResult', async () => {
    const tools: ToolBundle = { definitions: [], execute: async () => ({}) }
    const fake: LlmProvider = {
      runWithTools: async (opts: LlmRunOptions): Promise<LlmRunResult> => ({
        text: `${opts.role}:ok`,
        steps: 0,
        finishReason: 'stop',
      }),
    }
    const r = await fake.runWithTools({
      role: 'fast',
      system: 's',
      messages: [{ role: 'user', content: 'hi' }],
      tools,
      maxToolLoops: 5,
    })
    expect(r.text).toBe('fast:ok')
  })
})
```

- [ ] **Step 3: Rodar o teste (deve falhar)**

Run: `pnpm --filter @devorama/autosupport test -- tests/llm/types.test.ts`
Expected: FAIL — `Cannot find module '../../src/llm/types'`.

- [ ] **Step 4: Criar `src/llm/types.ts`**

```ts
import type { ToolBundle } from '../types.js'

export type LlmMessage = { role: 'user' | 'assistant' | 'system'; content: string }
export type LlmModelRole = 'fast' | 'heavy'

export type LlmRunOptions = {
  role: LlmModelRole
  system: string
  messages: LlmMessage[]
  tools: ToolBundle
  maxToolLoops: number
  maxTokens?: number
  onToolResult?: (name: string, input: Record<string, unknown>, result: unknown) => void
}

export type LlmRunResult = {
  text: string
  steps: number
  finishReason: string | null
}

export interface LlmProvider {
  runWithTools(opts: LlmRunOptions): Promise<LlmRunResult>
}
```

- [ ] **Step 5: Rodar o teste (passa)**

Run: `pnpm --filter @devorama/autosupport test -- tests/llm/types.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/autosupport/package.json packages/autosupport/src/llm/types.ts packages/autosupport/tests/llm/types.test.ts
git commit -m "feat(autosupport): add LlmProvider port contract + AI SDK deps"
```

---

### Task 2: Core agent loop sobre AI SDK (model-agnóstico)

**Files:**
- Create: `packages/autosupport/src/llm/loop.ts`
- Test: `packages/autosupport/tests/llm/loop.test.ts`

**Interfaces:**
- Consumes: `LlmMessage`, `LlmRunResult` (Task 1); `ToolBundle` (`src/types.ts`).
- Produces: `runAgentLoop(model: LanguageModelV2, opts: { system; messages; tools; maxToolLoops; maxTokens?; onToolResult? }): Promise<LlmRunResult>` — o tool-loop via `generateText`. `model` é um `LanguageModelV2` do AI SDK, injetável (testável com `MockLanguageModelV2` de `ai/test`).

**Reference:** AI SDK v5 docs — `generateText({ model, system, messages, tools, stopWhen: stepCountIs(n), onStepFinish })`, `tool({ description, inputSchema, execute })`, `jsonSchema(schema)`. Confira `https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling` se a assinatura divergir.

- [ ] **Step 1: Escrever o teste do loop (falha)**

`packages/autosupport/tests/llm/loop.test.ts`:
```ts
import { MockLanguageModelV2 } from 'ai/test'
import { describe, expect, it, vi } from 'vitest'
import { runAgentLoop } from '../../src/llm/loop'
import type { ToolBundle } from '../../src/types'

function tools(execute = vi.fn().mockResolvedValue({ ok: true })): ToolBundle {
  return {
    definitions: [{ name: 'test_tool', description: 'd', input_schema: { type: 'object', properties: {} } }],
    execute,
  }
}

it('end_turn imediato — retorna texto, 0 tool steps', async () => {
  const model = new MockLanguageModelV2({
    doGenerate: async () => ({
      finishReason: 'stop',
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      content: [{ type: 'text', text: 'hello' }],
      warnings: [],
    }),
  })
  const r = await runAgentLoop(model, {
    system: 's',
    messages: [{ role: 'user', content: 'hi' }],
    tools: tools(),
    maxToolLoops: 5,
  })
  expect(r.text).toBe('hello')
  expect(r.finishReason).toBe('stop')
})

it('onToolResult dispara no execute de cada tool', async () => {
  // Primeira geração chama a tool; segunda encerra com texto.
  let call = 0
  const model = new MockLanguageModelV2({
    doGenerate: async () => {
      call++
      if (call === 1) {
        return {
          finishReason: 'tool-calls',
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          content: [{ type: 'tool-call', toolCallId: 't1', toolName: 'test_tool', input: '{}' }],
          warnings: [],
        }
      }
      return {
        finishReason: 'stop',
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        content: [{ type: 'text', text: 'done' }],
        warnings: [],
      }
    },
  })
  const onToolResult = vi.fn()
  const r = await runAgentLoop(model, {
    system: 's',
    messages: [{ role: 'user', content: 'hi' }],
    tools: tools(),
    maxToolLoops: 5,
    onToolResult,
  })
  expect(r.text).toBe('done')
  expect(onToolResult).toHaveBeenCalledWith('test_tool', {}, { ok: true })
})

it('tool execute lançando vira { error }', async () => {
  let call = 0
  const model = new MockLanguageModelV2({
    doGenerate: async () => {
      call++
      return call === 1
        ? { finishReason: 'tool-calls', usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, content: [{ type: 'tool-call', toolCallId: 't1', toolName: 'test_tool', input: '{}' }], warnings: [] }
        : { finishReason: 'stop', usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, content: [{ type: 'text', text: 'ok' }], warnings: [] }
    },
  })
  const onToolResult = vi.fn()
  await runAgentLoop(model, {
    system: 's',
    messages: [{ role: 'user', content: 'hi' }],
    tools: tools(vi.fn().mockRejectedValue(new Error('boom'))),
    maxToolLoops: 5,
    onToolResult,
  })
  expect(onToolResult).toHaveBeenCalledWith('test_tool', {}, expect.objectContaining({ error: expect.stringContaining('boom') }))
})
```

- [ ] **Step 2: Rodar (falha)**

Run: `pnpm --filter @devorama/autosupport test -- tests/llm/loop.test.ts`
Expected: FAIL — `Cannot find module '../../src/llm/loop'`.

- [ ] **Step 3: Implementar `src/llm/loop.ts`**

```ts
import { type LanguageModelV2, generateText, jsonSchema, stepCountIs, tool } from 'ai'
import { toErrorMessage } from '../errors.js'
import type { ToolBundle } from '../types.js'
import type { LlmMessage, LlmRunResult } from './types.js'

export type AgentLoopOptions = {
  system: string
  messages: LlmMessage[]
  tools: ToolBundle
  maxToolLoops: number
  maxTokens?: number
  onToolResult?: (name: string, input: Record<string, unknown>, result: unknown) => void
}

export async function runAgentLoop(
  model: LanguageModelV2,
  opts: AgentLoopOptions
): Promise<LlmRunResult> {
  const aiTools = Object.fromEntries(
    opts.tools.definitions.map((d) => [
      d.name,
      tool({
        description: d.description,
        inputSchema: jsonSchema(d.input_schema),
        execute: async (input: Record<string, unknown>) => {
          let result: unknown
          try {
            result = await opts.tools.execute(d.name, input)
          } catch (err) {
            result = { error: `Tool execution failed: ${toErrorMessage(err)}` }
          }
          opts.onToolResult?.(d.name, input, result)
          return result
        },
      }),
    ])
  )

  const { text, steps, finishReason } = await generateText({
    model,
    system: opts.system,
    messages: opts.messages,
    tools: aiTools,
    maxOutputTokens: opts.maxTokens ?? 4096,
    stopWhen: stepCountIs(opts.maxToolLoops + 1),
  })

  return { text, steps: steps.length, finishReason: finishReason ?? null }
}
```

- [ ] **Step 4: Rodar (passa)**

Run: `pnpm --filter @devorama/autosupport test -- tests/llm/loop.test.ts`
Expected: PASS. Se o shape do `MockLanguageModelV2` divergir nesta versão do `ai`, ajuste o mock conforme `ai/test` (campos `content`/`finishReason`), não a implementação.

- [ ] **Step 5: Commit**

```bash
git add packages/autosupport/src/llm/loop.ts packages/autosupport/tests/llm/loop.test.ts
git commit -m "feat(autosupport): provider-agnostic agent loop via AI SDK generateText"
```

---

### Task 3: Adapters Anthropic e OpenAI + factory de provider

**Files:**
- Create: `packages/autosupport/src/llm/anthropic.ts`
- Create: `packages/autosupport/src/llm/openai.ts`
- Create: `packages/autosupport/src/llm/index.ts`
- Test: `packages/autosupport/tests/llm/providers.test.ts`

**Interfaces:**
- Consumes: `runAgentLoop` (Task 2); `LlmProvider`, `LlmModelRole`, `LlmRunOptions` (Task 1).
- Produces:
  - `type LlmConfig = { provider: 'anthropic' | 'openai'; apiKey: string; models?: Partial<Record<LlmModelRole, string>> }`
  - `createLlmProvider(cfg: LlmConfig): LlmProvider`
  - internos: `createAnthropicModels(apiKey, models?)` e `createOpenAIModels(apiKey, models?)` retornando `Record<LlmModelRole, LanguageModelV2>`.

- [ ] **Step 1: Teste (falha)** — `packages/autosupport/tests/llm/providers.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { createLlmProvider } from '../../src/llm'

describe('createLlmProvider', () => {
  it('anthropic constrói um LlmProvider', () => {
    const p = createLlmProvider({ provider: 'anthropic', apiKey: 'sk-test' })
    expect(typeof p.runWithTools).toBe('function')
  })
  it('openai constrói um LlmProvider', () => {
    const p = createLlmProvider({ provider: 'openai', apiKey: 'sk-test' })
    expect(typeof p.runWithTools).toBe('function')
  })
  it('provider desconhecido lança', () => {
    // @ts-expect-error provider inválido
    expect(() => createLlmProvider({ provider: 'x', apiKey: 'k' })).toThrow()
  })
})
```

- [ ] **Step 2: Rodar (falha)** — Run: `pnpm --filter @devorama/autosupport test -- tests/llm/providers.test.ts` → FAIL (módulo ausente).

- [ ] **Step 3: `src/llm/anthropic.ts`**
```ts
import { createAnthropic } from '@ai-sdk/anthropic'
import type { LanguageModelV2 } from 'ai'
import type { LlmModelRole } from './types.js'

const DEFAULTS: Record<LlmModelRole, string> = {
  fast: 'claude-haiku-4-5',
  heavy: 'claude-opus-4-7',
}

export function createAnthropicModels(
  apiKey: string,
  models?: Partial<Record<LlmModelRole, string>>
): Record<LlmModelRole, LanguageModelV2> {
  const anthropic = createAnthropic({ apiKey })
  return {
    fast: anthropic(models?.fast ?? DEFAULTS.fast),
    heavy: anthropic(models?.heavy ?? DEFAULTS.heavy),
  }
}
```

- [ ] **Step 4: `src/llm/openai.ts`**
```ts
import { createOpenAI } from '@ai-sdk/openai'
import type { LanguageModelV2 } from 'ai'
import type { LlmModelRole } from './types.js'

const DEFAULTS: Record<LlmModelRole, string> = {
  fast: 'gpt-4.1-mini',
  heavy: 'gpt-4.1',
}

export function createOpenAIModels(
  apiKey: string,
  models?: Partial<Record<LlmModelRole, string>>
): Record<LlmModelRole, LanguageModelV2> {
  const openai = createOpenAI({ apiKey })
  return {
    fast: openai(models?.fast ?? DEFAULTS.fast),
    heavy: openai(models?.heavy ?? DEFAULTS.heavy),
  }
}
```

- [ ] **Step 5: `src/llm/index.ts`**
```ts
import type { LanguageModelV2 } from 'ai'
import { createAnthropicModels } from './anthropic.js'
import { runAgentLoop } from './loop.js'
import { createOpenAIModels } from './openai.js'
import type { LlmModelRole, LlmProvider } from './types.js'

export type LlmConfig = {
  provider: 'anthropic' | 'openai'
  apiKey: string
  models?: Partial<Record<LlmModelRole, string>>
}

export function createLlmProvider(cfg: LlmConfig): LlmProvider {
  let models: Record<LlmModelRole, LanguageModelV2>
  if (cfg.provider === 'anthropic') models = createAnthropicModels(cfg.apiKey, cfg.models)
  else if (cfg.provider === 'openai') models = createOpenAIModels(cfg.apiKey, cfg.models)
  else throw new Error(`LLM provider desconhecido: ${(cfg as { provider: string }).provider}`)

  return {
    runWithTools: (opts) =>
      runAgentLoop(models[opts.role], {
        system: opts.system,
        messages: opts.messages,
        tools: opts.tools,
        maxToolLoops: opts.maxToolLoops,
        maxTokens: opts.maxTokens,
        onToolResult: opts.onToolResult,
      }),
  }
}

// LlmConfig já é exportado localmente acima (export type LlmConfig). Reexporta o resto de types.ts:
export type { LlmProvider, LlmMessage, LlmRunOptions, LlmRunResult, LlmModelRole } from './types.js'
```

- [ ] **Step 6: Rodar (passa)** — Run: `pnpm --filter @devorama/autosupport test -- tests/llm/providers.test.ts` → PASS.

- [ ] **Step 7: Commit**
```bash
git add packages/autosupport/src/llm/anthropic.ts packages/autosupport/src/llm/openai.ts packages/autosupport/src/llm/index.ts packages/autosupport/tests/llm/providers.test.ts
git commit -m "feat(autosupport): anthropic + openai LLM adapters and provider factory"
```

---

### Task 4: Migrar Tier 1 para o port

**Files:**
- Modify: `packages/autosupport/src/tiers/tier1.ts`
- Test: `packages/autosupport/tests/tiers/tier1.test.ts` (atualizar)

**Interfaces:**
- Consumes: `LlmProvider` (Task 1/3).
- Produces: `Tier1Config` passa a ter `llm: LlmProvider` no lugar de `anthropicApiKey`/`model`. `maxToolLoops` permanece. Chamada interna usa `cfg.llm.runWithTools({ role: 'fast', ... })`.

- [ ] **Step 1: Atualizar o teste de tier1** para injetar um `LlmProvider` fake em vez de mockar Anthropic. Abra `tests/tiers/tier1.test.ts`, substitua a construção do agente por:
```ts
import type { LlmProvider } from '../../src/llm/types'

const llm: LlmProvider = {
  runWithTools: vi.fn(async (opts) => {
    // simula o agente chamando create_ticket
    await opts.tools.execute('create_ticket', { description: 'x' })
    return { text: 'resposta', steps: 1, finishReason: 'stop' }
  }),
}
const agent = createTier1Agent({ llm, systemPromptBuilder: () => 's', customTools, db, schema })
```
(mantenha as asserções existentes sobre `result.text`/`ticketId`/persistência de histórico).

- [ ] **Step 2: Rodar (falha)** — Run: `pnpm --filter @devorama/autosupport test -- tests/tiers/tier1.test.ts` → FAIL (tipo `llm` não existe em `Tier1Config`).

- [ ] **Step 3: Editar `src/tiers/tier1.ts`** — trocar o acoplamento:
  - Remover `import Anthropic from '@anthropic-ai/sdk'` e `const client = new Anthropic(...)`.
  - Importar tipos do port: `import type { LlmMessage, LlmProvider } from '../llm/types.js'`.
  - `Tier1Config`: remover `anthropicApiKey` e `model`; adicionar `llm: LlmProvider`.
  - `loadHistory` retorna `LlmMessage[]`: trocar `Anthropic.MessageParam[]` por `LlmMessage[]` (o `.map` já produz `{ role, content }`).
  - `initial`: `const initial: LlmMessage[] = [...history, { role: 'user', content: message }]`.
  - Substituir a chamada `runToolLoop({ client, model, maxTokens, system, maxToolLoops, initialMessages: initial, tools, onToolResult })` por:
```ts
const result = await cfg.llm.runWithTools({
  role: 'fast',
  system: cfg.systemPromptBuilder(userContext),
  messages: initial,
  tools: cfg.customTools ?? { definitions: [], execute: async () => ({ error: 'no tools' }) },
  maxToolLoops: cfg.maxToolLoops ?? 5,
  maxTokens: 2048,
  onToolResult: (name, _input, r) => {
    const ticket = r as { ticketId?: string }
    if (name === 'create_ticket' && ticket.ticketId) ticketId = ticket.ticketId
  },
})
```
  - Remover o `import { runToolLoop } from './runner.js'` se não houver mais uso.

- [ ] **Step 4: Rodar (passa)** — Run: `pnpm --filter @devorama/autosupport test -- tests/tiers/tier1.test.ts` → PASS.

- [ ] **Step 5: Commit**
```bash
git add packages/autosupport/src/tiers/tier1.ts packages/autosupport/tests/tiers/tier1.test.ts
git commit -m "refactor(autosupport): tier1 uses LlmProvider port"
```

---

### Task 5: Migrar Tiers 2, 3 e 4 para o port

**Files:**
- Modify: `packages/autosupport/src/tiers/tier2.ts`, `tier3.ts`, `tier4.ts`
- Test: `packages/autosupport/tests/tiers/tier2.test.ts`, `tier3.test.ts`, `tier4.test.ts`

**Interfaces:**
- Consumes: `LlmProvider`.
- Produces: `Tier2Config`/`Tier3Config`/`Tier4Config` trocam `anthropicApiKey`+`model` por `llm: LlmProvider`. Todas as chamadas usam `role: 'heavy'`.

Aplique a **mesma transformação da Task 4** em cada tier (cada um é um arquivo, faça um por vez com seu próprio ciclo de teste e commit):

- [ ] **Step 1 (tier2): atualizar teste** — injetar `llm: LlmProvider` fake cujo `runWithTools` chama `opts.tools.execute('create_github_issue', {...})` retornando `{ issueNumber: 42 }`; manter asserção de que o ticket recebe `githubIssueId`.
- [ ] **Step 2 (tier2): rodar** → FAIL.
- [ ] **Step 3 (tier2): editar `src/tiers/tier2.ts`** — remover `new Anthropic`; `Tier2Config` ganha `llm: LlmProvider` (remove `anthropicApiKey`/`model`); `initial` tipado como `LlmMessage[]`; trocar `runToolLoop({ client, model: cfg.model ?? 'claude-opus-4-7', ... })` por `cfg.llm.runWithTools({ role: 'heavy', system: cfg.systemPrompt ?? DEFAULT_SYSTEM, messages: initial, tools: cfg.tools, maxToolLoops: cfg.maxToolLoops ?? 8, onToolResult })`.
- [ ] **Step 4 (tier2): rodar** → PASS. **Commit:** `refactor(autosupport): tier2 uses LlmProvider port`.
- [ ] **Step 5 (tier3): idem** — `tier3.ts` mantém `githubClient` e demais deps; só troca o bloco LLM (`role: 'heavy'`, `maxToolLoops ?? cfg`). Atualizar `tests/tiers/tier3.test.ts`. Rodar → PASS. **Commit.**
- [ ] **Step 6 (tier4): idem** — `tier4.run(pr, id)` preserva assinatura; troca o bloco LLM (`role: 'heavy'`). Atualizar `tests/tiers/tier4.test.ts`. Rodar → PASS. **Commit.**

---

### Task 6: Factory monta o provider + retrocompat; reconciliar `runToolLoop`

**Files:**
- Modify: `packages/autosupport/src/factory.ts`
- Modify: `packages/autosupport/src/tiers/runner.ts` (deprecação)
- Modify: `packages/autosupport/src/index.ts` (exports)
- Test: `packages/autosupport/tests/factory.test.ts` (atualizar)

**Interfaces:**
- Consumes: `createLlmProvider`, `LlmConfig` (Task 3).
- Produces: `SupportPipelineConfig` ganha `llm?: LlmConfig`. Mantém `anthropicApiKey?: string` (deprecated). Regra: se `cfg.llm` presente, usa-o; senão se `cfg.anthropicApiKey` presente, monta `{ provider: 'anthropic', apiKey: cfg.anthropicApiKey }`; senão lança.

- [ ] **Step 1: Atualizar `tests/factory.test.ts`** — adicionar caso: `createSupportPipeline` aceita `llm: { provider: 'openai', apiKey: 'k' }` e também o legado `anthropicApiKey: 'k'`; ambos produzem um pipeline com `tier1/tier2/...`. Manter os casos existentes (que usam `anthropicApiKey`) funcionando.

- [ ] **Step 2: Rodar (falha)** — Run: `pnpm --filter @devorama/autosupport test -- tests/factory.test.ts` → FAIL.

- [ ] **Step 3: Editar `src/factory.ts`**
  - Importar: `import { createLlmProvider, type LlmConfig } from './llm/index.js'`.
  - `SupportPipelineConfig`: adicionar `llm?: LlmConfig`; manter `anthropicApiKey?: string` (era obrigatório, vira opcional).
  - No início de `createSupportPipeline`, substituir o guard `if (!cfg.anthropicApiKey) throw ...` por:
```ts
const llmConfig: LlmConfig = cfg.llm
  ?? (cfg.anthropicApiKey
    ? { provider: 'anthropic', apiKey: cfg.anthropicApiKey }
    : (() => { throw new Error('Configure cfg.llm ou cfg.anthropicApiKey') })())
const llm = createLlmProvider(llmConfig)
```
  - Em cada `createTierNAgent({ ... })`, remover `anthropicApiKey: cfg.anthropicApiKey` e `model: cfg.tierN?.model` e adicionar `llm`. (O `model` por papel agora vem do `modelMap` do provider; overrides finos ficam para fase futura — remover os campos `model` dos `tierN` config no factory call.)

- [ ] **Step 4: Deprecar `runToolLoop`** em `src/tiers/runner.ts` — adicionar no topo do JSDoc `@deprecated use LlmProvider.runWithTools`. **Não** remover ainda (mantém `index.ts` export e os testes de `runner.test.ts` válidos enquanto houver consumidores). Se nenhum tier mais o importa, manter o arquivo e seus testes intactos para não quebrar a API pública nesta fase.

- [ ] **Step 5: Atualizar `src/index.ts`** — adicionar exports do port:
```ts
export { createLlmProvider } from './llm/index.js'
export type { LlmProvider, LlmConfig, LlmMessage, LlmRunOptions, LlmRunResult, LlmModelRole } from './llm/index.js'
```

- [ ] **Step 6: Rodar a suíte inteira** — Run: `pnpm --filter @devorama/autosupport test` → todos PASS. Run: `pnpm --filter @devorama/autosupport lint` → sem erros. Run: `pnpm --filter @devorama/autosupport build` → compila.

- [ ] **Step 7: Commit**
```bash
git add packages/autosupport/src/factory.ts packages/autosupport/src/tiers/runner.ts packages/autosupport/src/index.ts packages/autosupport/tests/factory.test.ts
git commit -m "feat(autosupport): factory builds LlmProvider (openai|anthropic) + retrocompat"
```

---

### Task 7: Atualizar README e exemplo

**Files:**
- Modify: `packages/autosupport/README.md`

- [ ] **Step 1: Documentar o novo bloco `llm`** — no exemplo de `createSupportPipeline`, trocar `anthropicApiKey: process.env.ANTHROPIC_API_KEY!` por:
```ts
llm: {
  provider: 'openai', // ou 'anthropic'
  apiKey: process.env.OPENAI_API_KEY!,
  // models opcional: { fast: '...', heavy: '...' }
},
```
e adicionar uma nota: "`anthropicApiKey` continua aceito (retrocompat) e equivale a `llm: { provider: 'anthropic', apiKey }`."

- [ ] **Step 2: Commit**
```bash
git add packages/autosupport/README.md
git commit -m "docs(autosupport): document llm provider config (openai|anthropic)"
```

---

## Notas de execução

- **Versões do AI SDK:** o plano assume AI SDK v5 (`ai@^5`, `@ai-sdk/*@^2`). Se `pnpm` resolver outra major, ajustar imports (`stepCountIs`, `jsonSchema`, `MockLanguageModelV2`) conforme a doc da versão instalada antes de implementar a Task 2.
- **Próximos planos (fora deste):** F1b = ports `VcsProvider`/`ErrorSource` (refatorar `clients/github.ts` e `clients/sentry-api.ts`). F2 = adapters GitLab/Bugsnag. F3 = serviço standalone. F4 = domain tools via MCP.
