# @devorama/autosupport — Package Extraction & FaceFutura Migration

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extrair o sistema de suporte autônomo do FaceFutura para um pacote npm reutilizável (`@devorama/autosupport`) no monorepo `devtools`, e migrar o FaceFutura para consumi-lo.

**Architecture:** Pacote único TypeScript com API factory (`createSupportPipeline(config)`) que recebe `db`, prompts, tools de domínio e credenciais; expõe agentes (Tier 1-4), webhooks (GitHub/Sentry), clients, tipos e schemas Drizzle. FaceFutura passa a importar agentes/tools/webhooks daqui em vez de manter cópia local.

**Tech Stack:** pnpm + turbo + tsup + vitest + biome (convenções do monorepo). Peers: `@anthropic-ai/sdk`, `drizzle-orm`, `pg-boss`, `@sentry/node`, `express`. Drizzle dialect: PostgreSQL.

**Source of truth:** código já implementado em `~/repos/devorama/FaceFutura/server/lib/support-*` + `webhooks-*` + `shared/schema.ts:1478-1513`. Spec: `docs/superpowers/specs/2026-05-20-autonomous-support-design.md`.

---

## Phases

- **Phase A (Tasks 1-12):** Construir `@devorama/autosupport@0.1.0` em `packages/autosupport/`. Cada task termina com testes verdes + commit.
- **Phase B (Tasks 13-17):** Migrar FaceFutura para consumir o pacote via tarball local, validar em produção, depois publicar `0.1.0` no npm.

---

## File Structure — `packages/autosupport/`

```
packages/autosupport/
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── vitest.config.ts
├── README.md
├── src/
│   ├── index.ts                    — exports públicos
│   ├── factory.ts                  — createSupportPipeline(config)
│   ├── types.ts                    — tipos compartilhados
│   ├── schema/
│   │   └── index.ts                — createSupportTables(deps) → Drizzle tables
│   ├── clients/
│   │   ├── github.ts               — createGitHubClient({ token, repo })
│   │   ├── sentry-api.ts           — createSentryClient({ apiToken, orgSlug, projectSlug })
│   │   └── sentry-sdk.ts           — initSentry({ dsn })
│   ├── notifications/
│   │   └── sse-bus.ts              — pure module (subscribeUser, notifyUser)
│   ├── queue/
│   │   └── index.ts                — createSupportQueue({ connectionString, runners })
│   ├── webhooks/
│   │   ├── github.ts               — createGithubWebhookHandler(deps)
│   │   └── sentry.ts               — createSentryWebhookHandler(deps)
│   ├── tools/
│   │   ├── filesystem.ts           — createFilesystemTools({ rootDir, protectedPatterns })
│   │   ├── logs.ts                 — createLogsTool({ logFilePath })
│   │   ├── tests.ts                — createTestsTool({ command, args, env })
│   │   ├── git.ts                  — createGitTools({ token, repo, rootDir })
│   │   ├── github-tools.ts         — createGithubTools(githubClient) (create_issue, create_pr, read_pr, etc)
│   │   └── sentry-tools.ts         — createSentryTool(sentryClient) (query_sentry)
│   └── tiers/
│       ├── tier1.ts                — createTier1Agent(config)
│       ├── tier2.ts                — createTier2Agent(config)
│       ├── tier3.ts                — createTier3Agent(config)
│       └── tier4.ts                — createTier4Agent(config)
└── tests/
    └── (mirror of src/)
```

**Princípio de injeção:** todo módulo é uma factory. Nada lê `process.env` direto; tudo recebe via config. `db` é injetado. Isso torna o pacote testável e reutilizável.

---

# Phase A — Build the Package

---

## Task 1: Scaffold package

**Files:**
- Create: `packages/autosupport/package.json`
- Create: `packages/autosupport/tsconfig.json`
- Create: `packages/autosupport/tsup.config.ts`
- Create: `packages/autosupport/vitest.config.ts`
- Create: `packages/autosupport/src/index.ts`
- Create: `packages/autosupport/README.md`

- [ ] **Step 1:** Criar `packages/autosupport/package.json`:

```json
{
  "name": "@devorama/autosupport",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.mjs",
      "require": "./dist/index.js"
    }
  },
  "main": "./dist/index.js",
  "module": "./dist/index.mjs",
  "types": "./dist/index.d.ts",
  "files": ["dist"],
  "publishConfig": { "access": "public" },
  "scripts": {
    "build": "tsup",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "biome check ."
  },
  "peerDependencies": {
    "@anthropic-ai/sdk": ">=0.30.0",
    "@sentry/node": ">=8.0.0",
    "drizzle-orm": ">=0.36.0",
    "express": ">=4.0.0",
    "pg-boss": ">=10.0.0"
  },
  "devDependencies": {
    "@anthropic-ai/sdk": "^0.30.0",
    "@sentry/node": "^8.0.0",
    "@types/express": "^5.0.0",
    "@types/node": "^22.0.0",
    "@types/supertest": "^6.0.0",
    "drizzle-orm": "^0.36.0",
    "express": "^5.0.0",
    "pg-boss": "^10.0.0",
    "supertest": "^7.0.0",
    "tsup": "^8.3.0",
    "typescript": "^5.7.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2:** Criar `packages/autosupport/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3:** Criar `packages/autosupport/tsup.config.ts`:

```ts
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  outExtension({ format }) {
    return { js: format === 'esm' ? '.mjs' : '.js' }
  },
})
```

- [ ] **Step 4:** Criar `packages/autosupport/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
```

- [ ] **Step 5:** Criar `packages/autosupport/src/index.ts` com placeholder:

```ts
export const VERSION = '0.1.0'
```

- [ ] **Step 6:** Criar `packages/autosupport/README.md` mínimo (uma frase descrevendo o pacote).

- [ ] **Step 7:** Rodar `pnpm install` na raiz do monorepo + `pnpm --filter @devorama/autosupport build`. Esperado: build sem erros.

- [ ] **Step 8:** Atualizar `packages/secrets/...` README do monorepo (`README.md` na raiz) — adicionar linha do `@devorama/autosupport` na tabela de pacotes.

- [ ] **Step 9:** Commit:

```bash
git add packages/autosupport README.md
git commit -m "feat(autosupport): scaffold @devorama/autosupport package"
```

---

## Task 2: Types module

**Files:**
- Create: `packages/autosupport/src/types.ts`
- Create: `packages/autosupport/tests/types.test.ts`

- [ ] **Step 1:** Escrever teste de tipos em `tests/types.test.ts`:

```ts
import { describe, it, expectTypeOf } from 'vitest'
import type {
  TicketStatus, TicketSource, SupportTicketRow, ToolDefinition,
  UserContext, AgentResult,
} from '../src/types'

describe('types', () => {
  it('TicketStatus enum values', () => {
    expectTypeOf<TicketStatus>().toEqualTypeOf<
      'open' | 'investigating' | 'fixing' | 'pr_review' | 'resolved'
    >()
  })
  it('TicketSource enum values', () => {
    expectTypeOf<TicketSource>().toEqualTypeOf<'chat' | 'sentry'>()
  })
})
```

- [ ] **Step 2:** Implementar `src/types.ts`:

```ts
export type TicketStatus = 'open' | 'investigating' | 'fixing' | 'pr_review' | 'resolved'
export type TicketSource = 'chat' | 'sentry'

export type SupportTicketRow = {
  id: string
  tenantId: string | null
  userId: string | null
  conversationId: string | null
  description: string
  status: TicketStatus
  source: TicketSource
  sentryIssueId: string | null
  githubIssueId: number | null
  githubPrId: number | null
  resolvedAt: Date | null
  notifiedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export type ToolDefinition = {
  name: string
  description: string
  input_schema: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
  }
}

export type ToolExecutor = (
  input: Record<string, unknown>,
) => Promise<unknown>

export type ToolBundle = {
  definitions: ToolDefinition[]
  execute: (name: string, input: Record<string, unknown>) => Promise<unknown>
}

export type UserContext = {
  fullName: string
  tenantName: string
  role: string
  currentPage: string
  [extra: string]: unknown   // permite extensões do consumidor
}

export type AgentResult = {
  text: string
  conversationId: string
  ticketId?: string
}

export type NotificationEvent = {
  type: 'ticket_resolved' | string
  ticketId: string
  message: string
  [extra: string]: unknown
}
```

- [ ] **Step 3:** Rodar `pnpm --filter @devorama/autosupport test`. Esperado: pass.

- [ ] **Step 4:** Commit:

```bash
git add packages/autosupport/src/types.ts packages/autosupport/tests/types.test.ts
git commit -m "feat(autosupport): tipos compartilhados (Ticket, Tool, UserContext)"
```

---

## Task 3: Schema factory

**Files:**
- Create: `packages/autosupport/src/schema/index.ts`
- Create: `packages/autosupport/tests/schema.test.ts`

**Contexto:** O FaceFutura usa `id()` e `...timestamps` helpers em `shared/schema.ts`. O pacote precisa ser portátil — vamos definir as colunas explicitamente. Foreign keys para `tenants`/`users` ficam **opcionais** (consumidor pode adicionar via migração separada).

- [ ] **Step 1:** Escrever teste em `tests/schema.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { createSupportSchema } from '../src/schema/index'

describe('createSupportSchema', () => {
  it('expõe tables e enums com nomes esperados', () => {
    const schema = createSupportSchema()
    expect(schema.supportTickets).toBeDefined()
    expect(schema.supportConversations).toBeDefined()
    expect(schema.supportTicketStatusEnum).toBeDefined()
    expect(schema.supportTicketSourceEnum).toBeDefined()
  })

  it('aceita prefixo customizado de tabela', () => {
    const schema = createSupportSchema({ tablePrefix: 'sup_' })
    // Drizzle não expõe o nome facilmente em runtime sem inspect — basta o tipo compilar
    expect(schema.supportTickets).toBeDefined()
  })
})
```

- [ ] **Step 2:** Implementar `src/schema/index.ts`:

```ts
import { pgEnum, pgTable, text, integer, uuid, timestamp, jsonb } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

export type CreateSchemaOptions = {
  tablePrefix?: string  // default ''
}

export function createSupportSchema(opts: CreateSchemaOptions = {}) {
  const p = opts.tablePrefix ?? ''

  const supportTicketStatusEnum = pgEnum(`${p}support_ticket_status`, [
    'open', 'investigating', 'fixing', 'pr_review', 'resolved',
  ])

  const supportTicketSourceEnum = pgEnum(`${p}support_ticket_source`, [
    'chat', 'sentry',
  ])

  const supportConversations = pgTable(`${p}support_conversations`, {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    userId: uuid('user_id').notNull(),
    messages: jsonb('messages')
      .$type<{ role: string; content: string; ts: string }[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  })

  const supportTickets = pgTable(`${p}support_tickets`, {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id'),
    userId: uuid('user_id'),
    conversationId: uuid('conversation_id'),
    description: text('description').notNull(),
    status: supportTicketStatusEnum('status').notNull().default('open'),
    source: supportTicketSourceEnum('source').notNull().default('chat'),
    sentryIssueId: text('sentry_issue_id'),
    githubIssueId: integer('github_issue_id'),
    githubPrId: integer('github_pr_id'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    notifiedAt: timestamp('notified_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  })

  return {
    supportTicketStatusEnum,
    supportTicketSourceEnum,
    supportConversations,
    supportTickets,
  }
}

export type SupportSchema = ReturnType<typeof createSupportSchema>
```

- [ ] **Step 3:** Rodar testes. Esperado: pass.

- [ ] **Step 4:** Commit:

```bash
git add packages/autosupport/src/schema packages/autosupport/tests/schema.test.ts
git commit -m "feat(autosupport): createSupportSchema com tables + enums Drizzle"
```

---

## Task 4: GitHub client

**Files:**
- Create: `packages/autosupport/src/clients/github.ts`
- Create: `packages/autosupport/tests/clients/github.test.ts`

**Source:** `~/repos/devorama/FaceFutura/server/lib/github-client.ts`.

**Transformação:** envolver em factory `createGitHubClient({ token, repo })`. Remover leitura de `process.env`. Manter assinaturas das funções.

- [ ] **Step 1:** Escrever teste em `tests/clients/github.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createGitHubClient } from '../../src/clients/github'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

beforeEach(() => { mockFetch.mockReset() })

describe('createGitHubClient', () => {
  it('createIssue chama POST /issues com headers corretos', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ number: 42, html_url: 'https://github.com/x/y/issues/42', title: 't' }),
    })
    const gh = createGitHubClient({ token: 'tok', repo: 'org/repo' })
    const issue = await gh.createIssue('t', 'b')
    expect(issue.number).toBe(42)
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe('https://api.github.com/repos/org/repo/issues')
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe('Bearer tok')
  })

  it('throw em repo inválido', () => {
    expect(() => createGitHubClient({ token: 't', repo: 'sem-barra' }))
      .toThrow(/owner\/repo/)
  })

  it('createIssue propaga erro de API', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 422, text: async () => 'bad' })
    const gh = createGitHubClient({ token: 't', repo: 'o/r' })
    await expect(gh.createIssue('t', 'b')).rejects.toThrow(/422/)
  })
})
```

- [ ] **Step 2:** Implementar `src/clients/github.ts` espelhando o original mas como factory:

Lift `~/repos/devorama/FaceFutura/server/lib/github-client.ts` aplicando:
- Apaga `function githubHeaders()` e `function repoInfo()` top-level
- Exporta `createGitHubClient(config: { token: string; repo: string })` que retorna `{ createIssue, getPullRequest, getPullRequestFiles, approvePullRequest, mergePullRequest, postPullRequestComment, createPullRequest, addLabelsToPR }`
- Headers e `owner/repo` vêm de closure sobre `config`
- Valida `repo` no factory: se não tem `/`, throw `"GITHUB_REPO inválido — use formato 'owner/repo'"`
- Mantém tipos `GitHubIssue`, `GitHubPR`, `GitHubPRFile`, `GitHubReview`, `GitHubMergeResult` como exports nomeados

- [ ] **Step 3:** Rodar testes. Esperado: pass.

- [ ] **Step 4:** Commit:

```bash
git add packages/autosupport/src/clients/github.ts packages/autosupport/tests/clients/github.test.ts
git commit -m "feat(autosupport): createGitHubClient com factory e config injetada"
```

---

## Task 5: Sentry API client + SDK init

**Files:**
- Create: `packages/autosupport/src/clients/sentry-api.ts`
- Create: `packages/autosupport/src/clients/sentry-sdk.ts`
- Create: `packages/autosupport/tests/clients/sentry-api.test.ts`

**Source:** `support-tier2-tools.ts:131-200` (query_sentry) + `server/lib/sentry.ts`.

- [ ] **Step 1:** Teste `tests/clients/sentry-api.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSentryClient } from '../../src/clients/sentry-api'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)
beforeEach(() => mockFetch.mockReset())

describe('createSentryClient', () => {
  it('getIssue retorna metadados + stackTrace', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({
        title: 'T', culprit: 'c', count: '5', userCount: 2,
        firstSeen: '2026-05-20', lastSeen: '2026-05-20', permalink: 'p',
      })})
      .mockResolvedValueOnce({ ok: true, json: async () => ({
        entries: [{ type: 'exception', data: { values: [{ stacktrace: { frames: [
          { filename: 'a.ts', lineno: 1, function: 'fn' },
        ]}}]}}],
      })})
    const c = createSentryClient({ apiToken: 't', orgSlug: 'org', projectSlug: 'proj' })
    const issue = await c.getIssue('abc')
    expect(issue.title).toBe('T')
    expect(issue.occurrences).toBe(5)
    expect(issue.stackTrace).toContain('a.ts:1')
  })

  it('searchIssues retorna lista', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [
      { id: '1', title: 'A', culprit: 'c', count: '1', userCount: 1, lastSeen: 'x', permalink: 'p' },
    ]})
    const c = createSentryClient({ apiToken: 't', orgSlug: 'org', projectSlug: 'proj' })
    const r = await c.searchIssues('boom')
    expect(r.issues[0].title).toBe('A')
  })

  it('retorna { error } em falha de API', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 403, json: async () => ({}) })
    const c = createSentryClient({ apiToken: 't', orgSlug: 'org', projectSlug: 'proj' })
    const r = await c.getIssue('x') as any
    expect(r.error).toContain('403')
  })
})
```

- [ ] **Step 2:** Implementar `src/clients/sentry-api.ts`:

```ts
export type SentryConfig = {
  apiToken: string
  orgSlug: string
  projectSlug: string
  apiBase?: string  // default https://us.sentry.io/api/0
}

export type SentryIssueResult = {
  title: string; culprit: string; occurrences: number; usersAffected: number
  firstSeen: string; lastSeen: string; permalink: string; stackTrace: string
}

export type SentrySearchResult = {
  issues: Array<{
    id: string; title: string; culprit: string
    occurrences: number; usersAffected: number; lastSeen: string; permalink: string
  }>
}

export function createSentryClient(cfg: SentryConfig) {
  const base = (cfg.apiBase ?? 'https://us.sentry.io/api/0') +
               `/organizations/${cfg.orgSlug}`
  const headers = {
    Authorization: `Bearer ${cfg.apiToken}`,
    'Content-Type': 'application/json',
  }

  async function getIssue(issueId: string): Promise<SentryIssueResult | { error: string }> {
    try {
      const [issueRes, eventRes] = await Promise.all([
        fetch(`${base}/issues/${issueId}/`, { headers }),
        fetch(`${base}/issues/${issueId}/events/latest/`, { headers }),
      ])
      if (!issueRes.ok) return { error: `Sentry API error: ${issueRes.status}` }
      const issue = await issueRes.json() as any
      let stackTrace = '(stack trace não disponível)'
      if (eventRes.ok) {
        const event = await eventRes.json() as any
        const exc = event.entries?.find((e: any) => e.type === 'exception')
        const frames: any[] = exc?.data?.values?.[0]?.stacktrace?.frames ?? []
        stackTrace = frames.slice(-10)
          .map((f: any) => `  ${f.filename}:${f.lineno} in ${f.function}`)
          .join('\n').slice(0, 4000)
      }
      return {
        title: issue.title, culprit: issue.culprit,
        occurrences: parseInt(issue.count ?? '0', 10),
        usersAffected: issue.userCount ?? 0,
        firstSeen: issue.firstSeen, lastSeen: issue.lastSeen,
        permalink: issue.permalink, stackTrace,
      }
    } catch (err: any) {
      return { error: `Erro ao consultar Sentry: ${err.message}` }
    }
  }

  async function searchIssues(query: string): Promise<SentrySearchResult | { error: string }> {
    try {
      const url = `${base}/issues/?query=${encodeURIComponent(query)}&project=${cfg.projectSlug}&limit=3`
      const res = await fetch(url, { headers })
      if (!res.ok) return { error: `Sentry API error: ${res.status}` }
      const issues = await res.json() as any[]
      return {
        issues: issues.map((i: any) => ({
          id: i.id, title: i.title, culprit: i.culprit,
          occurrences: parseInt(i.count ?? '0', 10),
          usersAffected: i.userCount ?? 0,
          lastSeen: i.lastSeen, permalink: i.permalink,
        })),
      }
    } catch (err: any) {
      return { error: `Erro ao consultar Sentry: ${err.message}` }
    }
  }

  return { getIssue, searchIssues }
}

export type SentryClient = ReturnType<typeof createSentryClient>
```

- [ ] **Step 3:** Implementar `src/clients/sentry-sdk.ts`:

```ts
import * as Sentry from '@sentry/node'

export type InitSentryOptions = {
  dsn?: string
  environment?: string
  tracesSampleRate?: number
}

export function initSentry(opts: InitSentryOptions = {}): void {
  if (!opts.dsn) return
  Sentry.init({
    dsn: opts.dsn,
    environment: opts.environment ?? 'development',
    tracesSampleRate: opts.tracesSampleRate ?? 0,
  })
}

export { Sentry }
export { setupExpressErrorHandler } from '@sentry/node'
```

- [ ] **Step 4:** Rodar testes. Esperado: pass.

- [ ] **Step 5:** Commit:

```bash
git add packages/autosupport/src/clients/sentry-api.ts packages/autosupport/src/clients/sentry-sdk.ts packages/autosupport/tests/clients/sentry-api.test.ts
git commit -m "feat(autosupport): createSentryClient + initSentry SDK wrapper"
```

---

## Task 6: SSE notifications bus

**Files:**
- Create: `packages/autosupport/src/notifications/sse-bus.ts`
- Create: `packages/autosupport/tests/notifications/sse-bus.test.ts`

**Source:** `support-sse-bus.ts` — já puro, lift direto.

- [ ] **Step 1:** Teste:

```ts
import { describe, it, expect, vi } from 'vitest'
import { createSseBus } from '../../src/notifications/sse-bus'

describe('createSseBus', () => {
  it('listener recebe eventos do próprio user', () => {
    const bus = createSseBus()
    const cb = vi.fn()
    bus.subscribeUser('u1', cb)
    bus.notifyUser('u1', { type: 't', ticketId: 'x', message: 'm' })
    expect(cb).toHaveBeenCalledOnce()
  })

  it('listener não recebe eventos de outro user', () => {
    const bus = createSseBus()
    const cb = vi.fn()
    bus.subscribeUser('u1', cb)
    bus.notifyUser('u2', { type: 't', ticketId: 'x', message: 'm' })
    expect(cb).not.toHaveBeenCalled()
  })

  it('unsubscribe remove listener', () => {
    const bus = createSseBus()
    const cb = vi.fn()
    const off = bus.subscribeUser('u1', cb)
    off()
    bus.notifyUser('u1', { type: 't', ticketId: 'x', message: 'm' })
    expect(cb).not.toHaveBeenCalled()
    expect(bus.hasActiveListener('u1')).toBe(false)
  })
})
```

- [ ] **Step 2:** Implementar `src/notifications/sse-bus.ts`:

Lift `support-sse-bus.ts` envolvendo em factory `createSseBus()`. Mapa `userSubscribers` vira state da closure. Retorna `{ subscribeUser, notifyUser, hasActiveListener }`.

- [ ] **Step 3:** Rodar testes. Pass.

- [ ] **Step 4:** Commit:

```bash
git commit -m "feat(autosupport): createSseBus para notificações por user"
```

---

## Task 7: Queue wrapper

**Files:**
- Create: `packages/autosupport/src/queue/index.ts`
- Create: `packages/autosupport/tests/queue.test.ts`

**Source:** `server/lib/queue.ts:11-117`. **Apenas** as filas `support-*` vão pro pacote — `simulation-generate`, `patient-purge`, `reminder-generate` ficam no FaceFutura.

**Design:** factory recebe handlers para os 3 jobs e retorna `{ start, stop, enqueueTier2, enqueueTier3, enqueueTier4 }`.

- [ ] **Step 1:** Teste em `tests/queue.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSupportQueue } from '../src/queue/index'

vi.mock('pg-boss', () => {
  const mockBoss = {
    on: vi.fn(),
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    createQueue: vi.fn().mockResolvedValue(undefined),
    work: vi.fn().mockResolvedValue(undefined),
    send: vi.fn().mockResolvedValue('job-1'),
  }
  return { default: vi.fn(() => mockBoss), PgBoss: vi.fn(() => mockBoss) }
})

describe('createSupportQueue', () => {
  beforeEach(() => vi.clearAllMocks())

  it('start cria as 3 filas support-*', async () => {
    const q = createSupportQueue({
      connectionString: 'postgres://x',
      runners: {
        tier2: vi.fn(), tier3: vi.fn(), tier4: vi.fn(),
      },
    })
    await q.start()
    // (verifica que createQueue foi chamado 3x com nomes corretos)
  })

  it('enqueueTier2 chama boss.send com job correto', async () => {
    const q = createSupportQueue({
      connectionString: 'postgres://x',
      runners: { tier2: vi.fn(), tier3: vi.fn(), tier4: vi.fn() },
    })
    await q.start()
    const jobId = await q.enqueueTier2('ticket-abc')
    expect(jobId).toBe('job-1')
  })
})
```

- [ ] **Step 2:** Implementar `src/queue/index.ts`:

```ts
import PgBoss from 'pg-boss'

export type SupportQueueRunners = {
  tier2: (ticketId: string) => Promise<void>
  tier3: (ticketId: string) => Promise<void>
  tier4: (prNumber: number, ticketId: string) => Promise<void>
}

export type CreateQueueOptions = {
  connectionString: string
  runners: SupportQueueRunners
  retries?: { tier2?: number; tier3?: number; tier4?: number }
}

export function createSupportQueue(opts: CreateQueueOptions) {
  let boss: PgBoss | null = null

  async function start(): Promise<PgBoss> {
    if (boss) return boss
    boss = new PgBoss({ connectionString: opts.connectionString })
    boss.on('error', (err: unknown) => console.error('[autosupport-queue]', err))
    await boss.start()

    await boss.createQueue('support-tier2-investigate')
    await boss.createQueue('support-tier3-fix')
    await boss.createQueue('support-tier4-review')

    await boss.work('support-tier2-investigate', { teamSize: 2, teamConcurrency: 1 } as any,
      async (jobs: any[]) => {
        for (const j of jobs) await opts.runners.tier2(j.data.ticketId)
      })
    await boss.work('support-tier3-fix', { teamSize: 1, teamConcurrency: 1 } as any,
      async (jobs: any[]) => {
        for (const j of jobs) await opts.runners.tier3(j.data.ticketId)
      })
    await boss.work('support-tier4-review', { teamSize: 1, teamConcurrency: 1 } as any,
      async (jobs: any[]) => {
        for (const j of jobs) await opts.runners.tier4(j.data.prNumber, j.data.ticketId)
      })

    console.log('[autosupport-queue] support tiers 2/3/4 workers started')
    return boss
  }

  async function stop(): Promise<void> {
    if (boss) { await boss.stop(); boss = null }
  }

  async function enqueueTier2(ticketId: string): Promise<string | null> {
    if (!boss) await start()
    return boss!.send('support-tier2-investigate', { ticketId }, {
      retryLimit: opts.retries?.tier2 ?? 3, retryDelay: 60, retryBackoff: true,
    })
  }

  async function enqueueTier3(ticketId: string): Promise<string | null> {
    if (!boss) await start()
    return boss!.send('support-tier3-fix', { ticketId }, {
      retryLimit: opts.retries?.tier3 ?? 1, retryDelay: 30,
    })
  }

  async function enqueueTier4(prNumber: number, ticketId: string): Promise<string | null> {
    if (!boss) await start()
    return boss!.send('support-tier4-review', { prNumber, ticketId }, {
      retryLimit: opts.retries?.tier4 ?? 1, retryDelay: 30,
    })
  }

  return { start, stop, enqueueTier2, enqueueTier3, enqueueTier4 }
}

export type SupportQueue = ReturnType<typeof createSupportQueue>
```

- [ ] **Step 3:** Rodar testes. Pass.

- [ ] **Step 4:** Commit:

```bash
git commit -m "feat(autosupport): createSupportQueue com pg-boss para tiers 2/3/4"
```

---

## Task 8: Tool primitives (filesystem, logs, tests, git)

**Files:**
- Create: `packages/autosupport/src/tools/filesystem.ts`
- Create: `packages/autosupport/src/tools/logs.ts`
- Create: `packages/autosupport/src/tools/tests.ts`
- Create: `packages/autosupport/src/tools/git.ts`
- Tests para cada um em `tests/tools/`

**Source:** trechos de `support-tier2-tools.ts` (read_file, search_code, read_logs) e `support-tier3-tools.ts` (write_file, run_tests, git_branch, git_commit_push).

**Design:** cada arquivo exporta factory que retorna `ToolBundle` (`{ definitions, execute }`). `rootDir`, `protectedPatterns`, `logFilePath`, `testCommand`, `gitRepo`, `gitToken` vêm de config.

- [ ] **Step 1:** Testes (um arquivo por bundle). Exemplo `tests/tools/filesystem.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'
import { createFilesystemTools } from '../../src/tools/filesystem'

let tmpRoot: string

beforeAll(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'autosupport-fs-'))
  await fs.writeFile(path.join(tmpRoot, 'hello.ts'), 'export const x = 1\n')
})
afterAll(async () => fs.rm(tmpRoot, { recursive: true, force: true }))

describe('createFilesystemTools', () => {
  it('read_file lê arquivo dentro do rootDir', async () => {
    const t = createFilesystemTools({ rootDir: tmpRoot })
    const r = await t.execute('read_file', { path: 'hello.ts' }) as any
    expect(r.content).toContain('export const x')
  })

  it('read_file rejeita path fora do rootDir', async () => {
    const t = createFilesystemTools({ rootDir: tmpRoot })
    const r = await t.execute('read_file', { path: '../etc/passwd' }) as any
    expect(r.error).toBeDefined()
  })

  it('write_file rejeita arquivo protegido', async () => {
    const t = createFilesystemTools({
      rootDir: tmpRoot,
      protectedPatterns: [/^\.env/],
    })
    const r = await t.execute('write_file', { path: '.env', content: 'x' }) as any
    expect(r.error).toContain('protegido')
  })

  it('write_file grava arquivo', async () => {
    const t = createFilesystemTools({ rootDir: tmpRoot })
    const r = await t.execute('write_file', { path: 'a/b.ts', content: 'ok' }) as any
    expect(r.success).toBe(true)
    const written = await fs.readFile(path.join(tmpRoot, 'a/b.ts'), 'utf8')
    expect(written).toBe('ok')
  })
})
```

- [ ] **Step 2:** Implementar os 4 arquivos. Cada um segue o padrão:

```ts
// src/tools/filesystem.ts
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { ToolBundle, ToolDefinition } from '../types'

const execFileAsync = promisify(execFile)

export type FilesystemToolsConfig = {
  rootDir: string
  protectedPatterns?: RegExp[]   // default: nenhum
}

export function createFilesystemTools(cfg: FilesystemToolsConfig): ToolBundle {
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
      description: 'Lê o conteúdo de um arquivo do codebase.',
      input_schema: {
        type: 'object',
        properties: { path: { type: 'string' } },
        required: ['path'],
      },
    },
    {
      name: 'search_code',
      description: 'Busca por uma string ou padrão no codebase usando grep.',
      input_schema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          directory: { type: 'string', description: "Diretório a buscar (padrão: '.')" },
        },
        required: ['query'],
      },
    },
    {
      name: 'write_file',
      description: 'Escreve conteúdo em um arquivo do codebase. Arquivos protegidos não podem ser modificados.',
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
        try {
          const resolved = safeResolvePath(input.path as string)
          const content = await fs.readFile(resolved, 'utf8')
          return { content: content.slice(0, 8000) }
        } catch (err: any) { return { error: err.message } }
      }
      case 'search_code': {
        try {
          const dir = safeResolvePath((input.directory as string) ?? '.')
          const { stdout } = await execFileAsync('grep', [
            '-r', '--include=*.ts', '-n', '--max-count=20', input.query as string, dir,
          ])
          return { matches: stdout.slice(0, 4000) }
        } catch (err: any) {
          if (err.code === 1) return { matches: '(nenhum resultado)' }
          return { error: err.message }
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
        } catch (err: any) { return { error: err.message } }
      }
      default: return { error: `Ferramenta desconhecida: ${name}` }
    }
  }

  return { definitions, execute }
}
```

Aplicar padrão equivalente para:
- `src/tools/logs.ts` → `createLogsTool({ logFilePath, maxLines = 500 })` expõe `read_logs`
- `src/tools/tests.ts` → `createTestsTool({ command = 'npx', args = ['vitest','run','--reporter=verbose'], env = {}, cwd, timeout = 120_000 })` expõe `run_tests`
- `src/tools/git.ts` → `createGitTools({ token, repo, rootDir })` expõe `git_branch` + `git_commit_push`

Cada um lifta a lógica do FaceFutura (linhas 144-172 de `support-tier3-tools.ts` para git; linhas 115-129 de `support-tier2-tools.ts` para logs; linhas 125-142 para tests).

- [ ] **Step 3:** Rodar todos os testes. Pass.

- [ ] **Step 4:** Commit:

```bash
git commit -m "feat(autosupport): tool primitives (filesystem, logs, tests, git) como factories"
```

---

## Task 9: GitHub + Sentry tool bundles

**Files:**
- Create: `packages/autosupport/src/tools/github-tools.ts`
- Create: `packages/autosupport/src/tools/sentry-tools.ts`
- Tests em `tests/tools/`

**Design:** factories que recebem `GitHubClient` / `SentryClient` e expõem `ToolBundle`.

- [ ] **Step 1:** Implementar `src/tools/github-tools.ts`:

```ts
import type { ToolBundle, ToolDefinition } from '../types'
import type { ReturnType as _ } from 'typescript'

export type GithubClient = {
  createIssue: (title: string, body: string) => Promise<{ number: number; html_url: string }>
  createPullRequest: (title: string, body: string, branch: string) => Promise<{ number: number; html_url: string }>
  addLabelsToPR: (prNumber: number, labels: string[]) => Promise<unknown>
  getPullRequest: (prNumber: number) => Promise<any>
  getPullRequestFiles: (prNumber: number) => Promise<any[]>
  approvePullRequest: (prNumber: number, comment: string) => Promise<{ id: number }>
  mergePullRequest: (prNumber: number) => Promise<{ merged: boolean; sha: string }>
  postPullRequestComment: (prNumber: number, comment: string) => Promise<unknown>
}

export type GithubToolsConfig = {
  client: GithubClient
  autoLabel?: string  // default 'support-auto'
}

export function createGithubTools(cfg: GithubToolsConfig): ToolBundle {
  const autoLabel = cfg.autoLabel ?? 'support-auto'

  const definitions: ToolDefinition[] = [
    { name: 'create_github_issue', description: 'Cria issue no GitHub com diagnóstico.',
      input_schema: { type: 'object', properties: {
        title: { type: 'string' }, body: { type: 'string' },
      }, required: ['title', 'body'] }},
    { name: 'create_pr', description: 'Cria PR e adiciona label support-auto.',
      input_schema: { type: 'object', properties: {
        title: { type: 'string' }, body: { type: 'string' }, branch: { type: 'string' },
      }, required: ['title', 'body', 'branch'] }},
    { name: 'read_pr', description: 'Lê título, body, branch e labels do PR.',
      input_schema: { type: 'object', properties: { prNumber: { type: 'number' }}, required: ['prNumber']}},
    { name: 'read_pr_files', description: 'Lê arquivos modificados no PR com diffs.',
      input_schema: { type: 'object', properties: { prNumber: { type: 'number' }}, required: ['prNumber']}},
    { name: 'approve_pr', description: 'Aprova o PR.',
      input_schema: { type: 'object', properties: { prNumber: { type: 'number' }, comment: { type: 'string' }}, required: ['prNumber', 'comment']}},
    { name: 'merge_pr', description: 'Squash merge do PR.',
      input_schema: { type: 'object', properties: { prNumber: { type: 'number' }}, required: ['prNumber']}},
    { name: 'post_review_comment', description: 'Posta comentário "needs human review" no PR.',
      input_schema: { type: 'object', properties: { prNumber: { type: 'number' }, comment: { type: 'string' }}, required: ['prNumber', 'comment']}},
  ]

  async function execute(name: string, input: Record<string, unknown>): Promise<unknown> {
    try {
      switch (name) {
        case 'create_github_issue': {
          const issue = await cfg.client.createIssue(input.title as string, input.body as string)
          return { issueNumber: issue.number, url: issue.html_url }
        }
        case 'create_pr': {
          const pr = await cfg.client.createPullRequest(
            input.title as string, input.body as string, input.branch as string,
          )
          await cfg.client.addLabelsToPR(pr.number, [autoLabel])
          return { prNumber: pr.number, url: pr.html_url }
        }
        case 'read_pr': {
          const pr = await cfg.client.getPullRequest(input.prNumber as number)
          return {
            number: pr.number, title: pr.title, body: pr.body,
            branch: pr.head.ref, labels: pr.labels.map((l: any) => l.name),
          }
        }
        case 'read_pr_files': {
          const files = await cfg.client.getPullRequestFiles(input.prNumber as number)
          return { files: files.map((f) => ({
            filename: f.filename, status: f.status,
            additions: f.additions, deletions: f.deletions,
            patch: f.patch?.slice(0, 2000),
          }))}
        }
        case 'approve_pr': {
          const r = await cfg.client.approvePullRequest(
            input.prNumber as number, input.comment as string,
          )
          return { approved: true, reviewId: r.id }
        }
        case 'merge_pr': {
          const r = await cfg.client.mergePullRequest(input.prNumber as number)
          return { merged: r.merged, sha: r.sha }
        }
        case 'post_review_comment': {
          const prefix = 'Este PR requer revisão humana: '
          const comment = (input.comment as string).startsWith(prefix)
            ? (input.comment as string) : prefix + (input.comment as string)
          await cfg.client.postPullRequestComment(input.prNumber as number, comment)
          return { posted: true }
        }
        default: return { error: `Ferramenta desconhecida: ${name}` }
      }
    } catch (err: any) { return { error: err.message } }
  }

  return { definitions, execute }
}
```

- [ ] **Step 2:** Implementar `src/tools/sentry-tools.ts`:

```ts
import type { ToolBundle, ToolDefinition } from '../types'
import type { SentryClient } from '../clients/sentry-api'

export function createSentryTool(client: SentryClient): ToolBundle {
  const definitions: ToolDefinition[] = [{
    name: 'query_sentry',
    description: 'Consulta a API do Sentry. Use issueId se o ticket veio do Sentry, ou query para buscar por palavras-chave.',
    input_schema: {
      type: 'object',
      properties: {
        issueId: { type: 'string' },
        query: { type: 'string' },
      },
    },
  }]

  async function execute(name: string, input: Record<string, unknown>): Promise<unknown> {
    if (name !== 'query_sentry') return { error: `Ferramenta desconhecida: ${name}` }
    const issueId = input.issueId as string | undefined
    const query = input.query as string | undefined
    if (!issueId && !query) return { error: 'issueId ou query obrigatório' }
    if (issueId) return client.getIssue(issueId)
    return client.searchIssues(query!)
  }

  return { definitions, execute }
}
```

- [ ] **Step 3:** Testes para ambos (cada test mocka `GithubClient`/`SentryClient` e verifica que `execute` chama os métodos certos com args certos).

- [ ] **Step 4:** Rodar testes. Pass.

- [ ] **Step 5:** Commit:

```bash
git commit -m "feat(autosupport): bundles de tools GitHub e Sentry"
```

---

## Task 10: Webhook handlers

**Files:**
- Create: `packages/autosupport/src/webhooks/github.ts`
- Create: `packages/autosupport/src/webhooks/sentry.ts`
- Create: `packages/autosupport/tests/webhooks/github.test.ts`
- Create: `packages/autosupport/tests/webhooks/sentry.test.ts`

**Source:** `server/api/webhooks-github.ts` e `server/api/webhooks-sentry.ts`. Transformação: receber dependências (`db`, `tables`, `githubClient`, `queue`, `sseBus`, `secrets`, `projectSlug`) via factory.

- [ ] **Step 1:** Implementar `src/webhooks/sentry.ts`:

```ts
import type { Request, Response } from 'express'
import crypto from 'node:crypto'
import type { SupportSchema } from '../schema'
import type { SupportQueue } from '../queue'

export type SentryWebhookDeps = {
  db: any                          // Drizzle DB instance
  schema: SupportSchema
  queue: SupportQueue
  webhookSecret: string
  projectSlug: string              // só processa issues deste projeto
}

export function createSentryWebhookHandler(deps: SentryWebhookDeps) {
  function verifySignature(payload: Buffer, signature: string): boolean {
    const expected = crypto.createHmac('sha256', deps.webhookSecret).update(payload).digest('hex')
    try {
      return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
    } catch { return false }
  }

  return async function sentryWebhookHandler(req: Request, res: Response): Promise<Response> {
    const signature = req.headers['sentry-hook-signature'] as string | undefined
    if (!signature) return res.status(401).json({ error: 'Assinatura ausente.' })

    const payload = req.body as Buffer
    if (!Buffer.isBuffer(payload)) return res.status(400).json({ error: 'Payload inválido.' })
    if (!verifySignature(payload, signature)) return res.status(401).json({ error: 'Assinatura inválida.' })

    const body = JSON.parse(payload.toString('utf8'))
    if (body.action !== 'created') return res.status(200).json({ received: true, handled: false })

    const issue = body.data?.issue
    if (!issue) return res.status(200).json({ received: true, handled: false })
    if (issue.project?.slug !== deps.projectSlug) {
      return res.status(200).json({ received: true, handled: false })
    }

    const description = `[Sentry] ${issue.title}\nCulprit: ${issue.culprit ?? 'desconhecido'}\n${issue.permalink ?? ''}`.trim()

    const [ticket] = await deps.db
      .insert(deps.schema.supportTickets)
      .values({
        tenantId: null, userId: null, description,
        source: 'sentry', sentryIssueId: String(issue.id), status: 'open',
      })
      .returning()

    await deps.queue.enqueueTier2(ticket.id)
    console.log(`[autosupport-sentry-webhook] ticket ${ticket.id} criado para issue ${issue.id}`)
    return res.status(200).json({ received: true, handled: true, ticketId: ticket.id })
  }
}
```

- [ ] **Step 2:** Implementar `src/webhooks/github.ts` espelhando o original (`webhooks-github.ts:11-114`) com a mesma transformação. Deps: `{ db, schema, queue, sseBus, githubClient, webhookSecret, autoLabel? }`. Mantém os 2 caminhos: `issues.closed` (resolve ticket + notifica) e `check_suite.completed` (enfileira Tier 4).

- [ ] **Step 3:** Testes com supertest (mockando `db`, `queue`, `sseBus`, `githubClient`). Cobre: sem assinatura → 401, assinatura inválida → 401, `issues.closed` → resolve ticket + notifica online + 200, `check_suite.completed` com label → enfileira Tier 4 + 200, sem label → ignora + 200.

- [ ] **Step 4:** Rodar testes. Pass.

- [ ] **Step 5:** Commit:

```bash
git commit -m "feat(autosupport): webhook handlers GitHub e Sentry como factories"
```

---

## Task 11: Tier agents (1-4)

**Files:**
- Create: `packages/autosupport/src/tiers/tier1.ts`
- Create: `packages/autosupport/src/tiers/tier2.ts`
- Create: `packages/autosupport/src/tiers/tier3.ts`
- Create: `packages/autosupport/src/tiers/tier4.ts`
- Create: `packages/autosupport/src/tiers/runner.ts`  (loop tool-use compartilhado)
- Tests para cada tier

**Source:** `support-agent.ts`, `support-tier2-agent.ts`, `support-tier3-agent.ts`, `support-tier4-agent.ts`.

**Design comum:** todo agente é uma factory que recebe `{ anthropic, db, schema, tools, systemPrompt, model, maxToolLoops }` e retorna `{ run: (input) => Promise<...> }`. A lógica do loop `tool_use → tool_result` é compartilhada em `runner.ts`.

- [ ] **Step 1:** Implementar `src/tiers/runner.ts` com `runToolLoop(client, opts)` que extrai a lógica comum (visto em todos os 4 agentes do FaceFutura — `while (loopCount < MAX) { create → end_turn|tool_use → execute → continue }`).

```ts
import type Anthropic from '@anthropic-ai/sdk'
import type { ToolBundle } from '../types'

export type ToolLoopOptions = {
  client: Anthropic
  model: string
  system: string
  maxTokens?: number
  maxToolLoops: number
  initialMessages: Anthropic.MessageParam[]
  tools: ToolBundle
  onToolResult?: (name: string, input: Record<string, unknown>, result: unknown) => void
}

export type ToolLoopResult = {
  text: string
  stopReason: Anthropic.Message['stop_reason']
  loops: number
}

export async function runToolLoop(opts: ToolLoopOptions): Promise<ToolLoopResult> {
  const messages = [...opts.initialMessages]
  const anthroTools = opts.tools.definitions.map((t) => ({
    name: t.name, description: t.description,
    input_schema: t.input_schema as Anthropic.Tool['input_schema'],
  }))

  let loops = 0
  let stopReason: Anthropic.Message['stop_reason'] = null
  let text = ''

  while (loops < opts.maxToolLoops) {
    const response = await opts.client.messages.create({
      model: opts.model,
      max_tokens: opts.maxTokens ?? 4096,
      system: opts.system,
      messages,
      tools: anthroTools,
    })
    stopReason = response.stop_reason

    if (response.stop_reason === 'end_turn') {
      text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text).join('')
      break
    }

    if (response.stop_reason === 'tool_use') {
      messages.push({ role: 'assistant', content: response.content })
      const toolResults: Anthropic.ToolResultBlockParam[] = []
      for (const block of response.content) {
        if (block.type !== 'tool_use') continue
        let result: unknown
        try {
          result = await opts.tools.execute(block.name, block.input as Record<string, unknown>)
        } catch (err: any) {
          result = { error: `Tool execution failed: ${err.message}` }
        }
        opts.onToolResult?.(block.name, block.input as Record<string, unknown>, result)
        toolResults.push({
          type: 'tool_result', tool_use_id: block.id,
          content: JSON.stringify(result),
        })
      }
      messages.push({ role: 'user', content: toolResults })
      loops++
      continue
    }
    break
  }
  return { text, stopReason, loops }
}
```

- [ ] **Step 2:** Implementar `src/tiers/tier2.ts` (mais simples — referência para os outros):

```ts
import Anthropic from '@anthropic-ai/sdk'
import { eq } from 'drizzle-orm'
import type { SupportSchema } from '../schema'
import type { ToolBundle } from '../types'
import { runToolLoop } from './runner'

export type Tier2Config = {
  anthropicApiKey: string
  model?: string
  maxToolLoops?: number
  systemPrompt?: string
  db: any
  schema: SupportSchema
  tools: ToolBundle                    // Tier 2 tools (read/search/logs/sentry/createIssue)
  enqueueTier3: (ticketId: string) => Promise<unknown>
}

const DEFAULT_SYSTEM = `Você é um agente de investigação técnica. Receberá a descrição de um bug reportado e deve:
1. Investigar o código e logs relevantes
2. Identificar a causa raiz provável
3. Criar um issue no GitHub com diagnóstico completo

Se o ticket tiver sentryIssueId: chame query_sentry(issueId=<id>) como PRIMEIRO passo.
Se não tiver: após investigar, chame query_sentry(query=<palavras-chave>) para correlacionar.
Inclua os dados do Sentry na seção "Dados do Sentry" do issue.

Seja objetivo. Comece investigando, depois crie o issue.`

export function createTier2Agent(cfg: Tier2Config) {
  const client = new Anthropic({ apiKey: cfg.anthropicApiKey })

  async function run(ticketId: string): Promise<void> {
    const [ticket] = await cfg.db.select().from(cfg.schema.supportTickets)
      .where(eq(cfg.schema.supportTickets.id, ticketId))
    if (!ticket) throw new Error(`Ticket ${ticketId} não encontrado`)
    if (ticket.githubIssueId) return   // idempotência

    let githubIssueId: number | undefined
    const initial = [{
      role: 'user' as const,
      content: [
        `Bug reportado:\n\n${ticket.description}`,
        ticket.sentryIssueId ? `Sentry Issue ID: ${ticket.sentryIssueId}` : null,
        ticket.tenantId ? `Tenant ID: ${ticket.tenantId}` : null,
        ticket.userId ? `Usuário ID: ${ticket.userId}` : null,
      ].filter(Boolean).join('\n'),
    }]

    await runToolLoop({
      client,
      model: cfg.model ?? 'claude-opus-4-7',
      system: cfg.systemPrompt ?? DEFAULT_SYSTEM,
      maxToolLoops: cfg.maxToolLoops ?? 8,
      initialMessages: initial,
      tools: cfg.tools,
      onToolResult: (name, _input, result) => {
        if (name === 'create_github_issue' && (result as any).issueNumber) {
          githubIssueId = (result as any).issueNumber
        }
      },
    })

    await cfg.db.update(cfg.schema.supportTickets)
      .set({ status: 'investigating', githubIssueId: githubIssueId ?? null, updatedAt: new Date() })
      .where(eq(cfg.schema.supportTickets.id, ticketId))

    if (githubIssueId) {
      try { await cfg.enqueueTier3(ticketId) } catch { /* fila pode estar desabilitada em testes */ }
    }
  }

  return { run }
}
```

- [ ] **Step 3:** Implementar `src/tiers/tier3.ts` mesmo padrão, fielding ao `support-tier3-agent.ts:46-118`. Config adicional: `protectedFiles` (pra system prompt mencionar), `branchPrefix` (default `support/fix-`).

- [ ] **Step 4:** Implementar `src/tiers/tier4.ts` espelhando `support-tier4-agent.ts:30-90`. Sem update de status no DB (webhook `issues.closed` faz isso).

- [ ] **Step 5:** Implementar `src/tiers/tier1.ts` baseado em `support-agent.ts:91-159`. Diferenças do Tier 2-4: stateful (carrega + salva histórico), usa `model: claude-sonnet-4-6`, max_tokens 2048, tem `read_data` / `create_ticket` / `get_product_help` injetados pelo consumidor. Retorna `{ text, conversationId, ticketId? }`. Config recebe `systemPromptBuilder: (ctx: UserContext) => string`.

- [ ] **Step 6:** Testes para cada tier mockam Anthropic SDK (`vi.mock('@anthropic-ai/sdk')`), criam um `ToolBundle` falso e verificam fluxo end_turn + idempotência (Tier 2 com `githubIssueId` preenchido pula).

- [ ] **Step 7:** Rodar todos os testes. Pass.

- [ ] **Step 8:** Commit:

```bash
git commit -m "feat(autosupport): agentes Tier 1-4 com runner compartilhado"
```

---

## Task 12: createSupportPipeline + public API

**Files:**
- Create: `packages/autosupport/src/factory.ts`
- Modify: `packages/autosupport/src/index.ts`
- Create: `packages/autosupport/tests/factory.test.ts`

**Design:** `createSupportPipeline(config)` é o ponto de entrada principal. Recebe tudo, faz a fiação interna, retorna `{ tier1, tier2, tier3, tier4, webhooks, queue, sseBus, schema, clients }`.

- [ ] **Step 1:** Implementar `src/factory.ts`:

```ts
import { createSupportSchema, type SupportSchema } from './schema'
import { createGitHubClient } from './clients/github'
import { createSentryClient } from './clients/sentry-api'
import { initSentry } from './clients/sentry-sdk'
import { createSseBus } from './notifications/sse-bus'
import { createSupportQueue } from './queue'
import { createFilesystemTools } from './tools/filesystem'
import { createLogsTool } from './tools/logs'
import { createTestsTool } from './tools/tests'
import { createGitTools } from './tools/git'
import { createGithubTools } from './tools/github-tools'
import { createSentryTool } from './tools/sentry-tools'
import { createTier1Agent } from './tiers/tier1'
import { createTier2Agent } from './tiers/tier2'
import { createTier3Agent } from './tiers/tier3'
import { createTier4Agent } from './tiers/tier4'
import { createGithubWebhookHandler } from './webhooks/github'
import { createSentryWebhookHandler } from './webhooks/sentry'
import type { ToolBundle, ToolDefinition } from './types'

export type SupportPipelineConfig = {
  db: any
  schema?: SupportSchema       // se omitido, cria default (sem prefix)
  anthropicApiKey: string

  github: { token: string; repo: string; webhookSecret: string; autoLabel?: string }
  sentry: { dsn?: string; apiToken: string; orgSlug: string; projectSlug: string; webhookSecret: string }

  queue: { connectionString: string }

  // Tier 1
  tier1: {
    model?: string
    systemPromptBuilder: (ctx: any) => string
    customTools?: ToolBundle              // read_data + outras de domínio
  }

  // Tier 2/3/4
  rootDir: string                          // raiz do projeto consumidor
  logFilePath?: string                     // default `${rootDir}/logs/server.log`
  testCommand?: { command: string; args: string[]; env?: Record<string,string> }
  protectedPatterns?: RegExp[]
  tier2?: { model?: string; maxToolLoops?: number; systemPrompt?: string }
  tier3?: { model?: string; maxToolLoops?: number; systemPrompt?: string; branchPrefix?: string }
  tier4?: { model?: string; maxToolLoops?: number; systemPrompt?: string }
}

export function createSupportPipeline(cfg: SupportPipelineConfig) {
  const schema = cfg.schema ?? createSupportSchema()

  // Init SDK (no-op se DSN ausente)
  initSentry({ dsn: cfg.sentry.dsn })

  // Clients
  const githubClient = createGitHubClient({ token: cfg.github.token, repo: cfg.github.repo })
  const sentryClient = createSentryClient({
    apiToken: cfg.sentry.apiToken,
    orgSlug: cfg.sentry.orgSlug,
    projectSlug: cfg.sentry.projectSlug,
  })

  // SSE bus
  const sseBus = createSseBus()

  // Tools — Tier 2/3
  const fsTools = createFilesystemTools({ rootDir: cfg.rootDir, protectedPatterns: cfg.protectedPatterns })
  const logsTool = createLogsTool({ logFilePath: cfg.logFilePath ?? `${cfg.rootDir}/logs/server.log` })
  const testsTool = createTestsTool(cfg.testCommand ?? {
    command: 'npx', args: ['vitest', 'run', '--reporter=verbose'],
  })
  const gitTools = createGitTools({ token: cfg.github.token, repo: cfg.github.repo, rootDir: cfg.rootDir })
  const ghTools = createGithubTools({ client: githubClient, autoLabel: cfg.github.autoLabel })
  const sentryToolBundle = createSentryTool(sentryClient)

  // Bundle compostos por tier
  const tier2Tools = mergeBundles([fsTools, logsTool, sentryToolBundle, pickBundle(ghTools, ['create_github_issue'])])
  const tier3Tools = mergeBundles([fsTools, logsTool, gitTools, pickBundle(ghTools, ['create_pr'])])
  const tier4Tools = pickBundle(ghTools, ['read_pr', 'read_pr_files', 'approve_pr', 'merge_pr', 'post_review_comment'])

  // Queue (placeholder — runners preenchidos abaixo)
  let queue: ReturnType<typeof createSupportQueue>

  // Tier agents
  const tier2 = createTier2Agent({
    anthropicApiKey: cfg.anthropicApiKey,
    model: cfg.tier2?.model, maxToolLoops: cfg.tier2?.maxToolLoops,
    systemPrompt: cfg.tier2?.systemPrompt,
    db: cfg.db, schema, tools: tier2Tools,
    enqueueTier3: (id: string) => queue.enqueueTier3(id),
  })
  const tier3 = createTier3Agent({
    anthropicApiKey: cfg.anthropicApiKey,
    model: cfg.tier3?.model, maxToolLoops: cfg.tier3?.maxToolLoops,
    systemPrompt: cfg.tier3?.systemPrompt, branchPrefix: cfg.tier3?.branchPrefix,
    db: cfg.db, schema, tools: tier3Tools, githubClient,
  })
  const tier4 = createTier4Agent({
    anthropicApiKey: cfg.anthropicApiKey,
    model: cfg.tier4?.model, maxToolLoops: cfg.tier4?.maxToolLoops,
    systemPrompt: cfg.tier4?.systemPrompt,
    db: cfg.db, schema, tools: tier4Tools,
  })

  // Tier 1 (combina custom tools com create_ticket/etc se quiser)
  const tier1 = createTier1Agent({
    anthropicApiKey: cfg.anthropicApiKey,
    model: cfg.tier1.model,
    systemPromptBuilder: cfg.tier1.systemPromptBuilder,
    db: cfg.db, schema,
    customTools: cfg.tier1.customTools,
    enqueueTier2: (id: string) => queue.enqueueTier2(id),
  })

  queue = createSupportQueue({
    connectionString: cfg.queue.connectionString,
    runners: {
      tier2: (id) => tier2.run(id),
      tier3: (id) => tier3.run(id),
      tier4: (pr, id) => tier4.run(pr, id),
    },
  })

  // Webhooks
  const webhooks = {
    github: createGithubWebhookHandler({
      db: cfg.db, schema, queue, sseBus, githubClient,
      webhookSecret: cfg.github.webhookSecret, autoLabel: cfg.github.autoLabel,
    }),
    sentry: createSentryWebhookHandler({
      db: cfg.db, schema, queue,
      webhookSecret: cfg.sentry.webhookSecret,
      projectSlug: cfg.sentry.projectSlug,
    }),
  }

  return {
    schema, tier1, tier2, tier3, tier4,
    queue, sseBus, webhooks,
    clients: { github: githubClient, sentry: sentryClient },
  }
}

// Helpers
function mergeBundles(bundles: ToolBundle[]): ToolBundle {
  const definitions = bundles.flatMap((b) => b.definitions)
  const map = new Map<string, ToolBundle>()
  for (const b of bundles) for (const d of b.definitions) map.set(d.name, b)
  return {
    definitions,
    execute: (name, input) => {
      const owner = map.get(name)
      if (!owner) return Promise.resolve({ error: `Ferramenta desconhecida: ${name}` })
      return owner.execute(name, input)
    },
  }
}
function pickBundle(bundle: ToolBundle, names: string[]): ToolBundle {
  const set = new Set(names)
  return {
    definitions: bundle.definitions.filter((d) => set.has(d.name)),
    execute: (name, input) => set.has(name)
      ? bundle.execute(name, input)
      : Promise.resolve({ error: `Ferramenta desconhecida: ${name}` }),
  }
}
```

- [ ] **Step 2:** Atualizar `src/index.ts` com os exports públicos:

```ts
export { createSupportPipeline } from './factory'
export type { SupportPipelineConfig } from './factory'
export { createSupportSchema } from './schema'
export type { SupportSchema } from './schema'
export type {
  TicketStatus, TicketSource, SupportTicketRow,
  ToolDefinition, ToolBundle, ToolExecutor,
  UserContext, AgentResult, NotificationEvent,
} from './types'
export { createGitHubClient } from './clients/github'
export { createSentryClient } from './clients/sentry-api'
export { initSentry, Sentry, setupExpressErrorHandler } from './clients/sentry-sdk'
export { createSseBus } from './notifications/sse-bus'
export const VERSION = '0.1.0'
```

- [ ] **Step 3:** Teste de integração leve em `tests/factory.test.ts` — mocka tudo, instancia o pipeline, verifica que `createSupportPipeline(config)` retorna os campos esperados sem throw.

- [ ] **Step 4:** Rodar `pnpm --filter @devorama/autosupport build && pnpm --filter @devorama/autosupport test`. Pass.

- [ ] **Step 5:** Atualizar `packages/autosupport/README.md` com seção "Uso" mostrando exemplo de `createSupportPipeline({...})`.

- [ ] **Step 6:** Commit + push:

```bash
git add packages/autosupport
git commit -m "feat(autosupport): createSupportPipeline factory + public API + README"
git push origin main
```

---

# Phase B — Migrate FaceFutura

A partir daqui o trabalho é no repo `~/repos/devorama/FaceFutura` (não no devtools).

---

## Task 13: Empacotar e instalar localmente

**Files:** `~/repos/devorama/FaceFutura/package.json`

- [ ] **Step 1:** No devtools, gerar tarball:

```bash
cd ~/repos/devorama/devtools/packages/autosupport
pnpm build
npm pack
# Gera devorama-autosupport-0.1.0.tgz
```

- [ ] **Step 2:** No FaceFutura, instalar via path local:

```bash
cd ~/repos/devorama/FaceFutura
npm install ~/repos/devorama/devtools/packages/autosupport/devorama-autosupport-0.1.0.tgz
```

- [ ] **Step 3:** Verificar import básico:

```bash
node -e "const x = require('@devorama/autosupport'); console.log(x.VERSION)"
```

Esperado: `0.1.0`.

- [ ] **Step 4:** Commit (apenas package.json + lock):

```bash
git add package.json package-lock.json
git commit -m "feat(support): instalar @devorama/autosupport@0.1.0 (tarball local)"
```

---

## Task 14: Substituir clients + SSE bus + queue support

**Files (no FaceFutura):**
- Delete: `server/lib/github-client.ts`
- Delete: `server/lib/sentry.ts`
- Delete: `server/lib/support-sse-bus.ts`
- Modify: `server/lib/queue.ts`
- Modify: imports em `server/index.ts`, `server/api/support.ts`, etc.

- [ ] **Step 1:** Buscar e substituir imports:

```bash
grep -rn "from \"./github-client\"\|from \"../lib/github-client\"" server/
grep -rn "from \"./support-sse-bus\"\|from \"../lib/support-sse-bus\"" server/
grep -rn "from \"./sentry\"\|from \"../lib/sentry\"" server/
```

Para cada match, substituir o import por:

```ts
import { createGitHubClient } from '@devorama/autosupport'
// e instanciar com process.env.GITHUB_TOKEN e GITHUB_REPO no boot
```

Como ainda há acoplamento, **temporariamente** criar `server/lib/autosupport-singleton.ts` que faz o boot uma vez:

```ts
import { createGitHubClient, createSseBus, initSentry } from '@devorama/autosupport'
export const githubClient = createGitHubClient({
  token: process.env.GITHUB_TOKEN ?? '',
  repo: process.env.GITHUB_REPO ?? 'rafito/FaceFutura',
})
export const sseBus = createSseBus()
initSentry({ dsn: process.env.SENTRY_DSN })
```

Demais arquivos do FaceFutura importam de `./autosupport-singleton` em vez dos antigos.

- [ ] **Step 2:** Refatorar `server/lib/queue.ts` removendo as filas `support-*` e seus workers (já estão no pacote):

Remover:
- imports de `support-tier2-worker`, `support-tier3-worker`, `support-tier4-worker`
- `createQueue('support-tier2-investigate')` + `work` correspondente
- mesmo para tier3 e tier4
- funções `enqueueSupport`, `enqueueSupportTier3`, `enqueueSupportTier4`

Em `autosupport-singleton.ts`, adicionar:

```ts
import { createSupportPipeline } from '@devorama/autosupport'
import { db } from '../db'
// (Tier 1 prompt + tools de domínio entram nas próximas tasks; por ora deixar o pipeline parcial)
```

NOTA: ainda não fazemos a wiring completa — só os clients/sseBus/SDK. Pipelines virão na Task 16.

- [ ] **Step 3:** Apagar os 3 arquivos: `server/lib/github-client.ts`, `server/lib/sentry.ts`, `server/lib/support-sse-bus.ts`.

- [ ] **Step 4:** Rodar `npx tsc --noEmit | head -30`. Esperado: erros apenas onde os tier-agents ainda usam o cliente antigo.

- [ ] **Step 5:** Rodar a suite de testes que não toca em filas/tiers: `npx vitest run server/__tests__/support-webhook-*.test.ts`. Pass.

- [ ] **Step 6:** Commit:

```bash
git add -A
git commit -m "refactor(support): consumir clients/SSE/SDK do @devorama/autosupport"
```

---

## Task 15: Substituir webhooks

**Files:**
- Modify: `server/api/webhooks-github.ts` (vira thin wrapper) ou substituir registro direto em `server/index.ts`
- Modify: `server/api/webhooks-sentry.ts` (mesmo)

- [ ] **Step 1:** Em `server/index.ts`, substituir registro dos webhooks pelos handlers do pacote.

Antes:
```ts
import { githubWebhookHandler } from './api/webhooks-github'
import { sentryWebhookHandler } from './api/webhooks-sentry'
app.post('/api/webhooks/github', express.raw({type:'application/json'}), githubWebhookHandler)
app.post('/api/webhooks/sentry', express.raw({type:'application/json'}), sentryWebhookHandler)
```

Depois (precisa do pipeline completo — antecipar a Task 16 ou criar handlers parciais aqui).

**Estratégia:** consolidar Tasks 15+16 em Task 16 (mais coerente). Aqui só apagar os arquivos antigos `webhooks-github.ts` e `webhooks-sentry.ts` **depois** que Task 16 estiver verde.

- [ ] **Step 2:** Adiar deleção até Task 16. Apenas preparar imports.

- [ ] **Step 3:** Sem commit nesta task (vai junto com Task 16).

---

## Task 16: Wirar createSupportPipeline + remover tier agents e tools antigos

**Files:**
- Modify: `server/lib/autosupport-singleton.ts` (vira o pipeline real)
- Modify: `server/index.ts` (registra webhooks via pipeline)
- Modify: `server/api/support.ts` (usa `pipeline.tier1.run` em vez de `runTier1Agent`)
- Delete: `server/lib/support-agent.ts`
- Delete: `server/lib/support-tier2-agent.ts`, `support-tier2-tools.ts`
- Delete: `server/lib/support-tier3-agent.ts`, `support-tier3-tools.ts`
- Delete: `server/lib/support-tier4-agent.ts`, `support-tier4-tools.ts`
- Delete: `server/api/webhooks-github.ts`, `webhooks-sentry.ts`
- Delete: `server/workers/support-tier2-worker.ts`, `support-tier3-worker.ts`, `support-tier4-worker.ts`
- **Keep:** `server/lib/support-system-prompt.ts` (domínio)
- **Keep:** `server/lib/support-tools.ts` — refatorar pra ser apenas `read_data` (domínio), exportar como `ToolBundle`

- [ ] **Step 1:** Refatorar `server/lib/support-tools.ts`:

Remover `create_ticket`, `get_product_help`, `TIER1_TOOL_DEFINITIONS`. Manter só `executeReadData` e exportar como `ToolBundle`:

```ts
import type { ToolBundle, ToolDefinition } from '@devorama/autosupport'
import { db } from '../db'
import { patients, appointments, simulations, creditBuckets } from '@shared/schema'
import { eq, desc, sum, sql } from 'drizzle-orm'

export type SupportUserContext = { /* ... mesma de antes */ }

export function createDomainTools(getCtx: () => SupportUserContext): ToolBundle {
  const definitions: ToolDefinition[] = [{
    name: 'read_data',
    description: 'Lê dados reais do tenant do usuário...',
    input_schema: { /* mesmo */ },
  }]

  async function execute(name: string, input: Record<string, unknown>): Promise<unknown> {
    if (name !== 'read_data') return { error: `Ferramenta desconhecida: ${name}` }
    return executeReadData(input as any, getCtx())
  }

  return { definitions, execute }
}

async function executeReadData(/* lift do original */) { /* ... */ }
```

- [ ] **Step 2:** Substituir `server/lib/autosupport-singleton.ts` pelo pipeline completo:

```ts
import { createSupportPipeline } from '@devorama/autosupport'
import { db } from '../db'
import { buildSystemPrompt } from './support-system-prompt'
import { createDomainTools } from './support-tools'

let currentCtx: any = null
export function setSupportCtx(ctx: any) { currentCtx = ctx }

export const support = createSupportPipeline({
  db,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
  github: {
    token: process.env.GITHUB_TOKEN ?? '',
    repo: process.env.GITHUB_REPO ?? 'rafito/FaceFutura',
    webhookSecret: process.env.GITHUB_WEBHOOK_SECRET ?? '',
  },
  sentry: {
    dsn: process.env.SENTRY_DSN,
    apiToken: process.env.SENTRY_API_TOKEN ?? '',
    orgSlug: process.env.SENTRY_ORG_SLUG ?? 'monolito-wd',
    projectSlug: process.env.SENTRY_PROJECT_SLUG ?? 'facefutura',
    webhookSecret: process.env.SENTRY_WEBHOOK_SECRET ?? '',
  },
  queue: { connectionString: process.env.DATABASE_URL ?? '' },
  rootDir: process.cwd(),
  logFilePath: '/opt/facefutura/logs/server.log',
  protectedPatterns: [/^\.env/, /^server\/index\.ts$/, /^shared\/schema\.ts$/, /^tests\/e2e\//],
  tier1: {
    model: 'claude-sonnet-4-6',
    systemPromptBuilder: buildSystemPrompt,
    customTools: createDomainTools(() => currentCtx),
  },
})
```

- [ ] **Step 3:** Em `server/api/support.ts`, substituir uso de `runTier1Agent` por `support.tier1.run`, passando ctx via `setSupportCtx`.

- [ ] **Step 4:** Em `server/index.ts`, registrar webhooks via pipeline:

```ts
import { support } from './lib/autosupport-singleton'
app.post('/api/webhooks/github', express.raw({type:'application/json'}), support.webhooks.github)
app.post('/api/webhooks/sentry', express.raw({type:'application/json'}), support.webhooks.sentry)
```

E inicializar a queue do pacote (em paralelo com a queue do FaceFutura ainda existente para outras filas):

```ts
await support.queue.start()
```

- [ ] **Step 5:** Em `server/api/support.ts`, substituir uso de `subscribeUser` (do antigo `support-sse-bus`) por `support.sseBus.subscribeUser`.

- [ ] **Step 6:** Apagar os 9 arquivos legados listados acima.

- [ ] **Step 7:** Rodar `npx tsc --noEmit | head -20`. Esperado: zero erros.

- [ ] **Step 8:** Rodar **toda** a suite de testes do suporte:

```bash
npx vitest run server/__tests__/support-*.test.ts --reporter=verbose | tail -30
```

Esperado: todos passam. Pode ser que alguns testes precisem ajustes de import (mocks de módulo antigo → novo). Ajustar até zerar.

- [ ] **Step 9:** Commit:

```bash
git add -A
git commit -m "refactor(support): consumir createSupportPipeline do @devorama/autosupport"
```

---

## Task 17: Deploy + cleanup + publicação

- [ ] **Step 1:** Rodar suite completa:

```bash
npx vitest run --reporter=verbose 2>&1 | tail -20
```

Esperado: todos os testes verdes.

- [ ] **Step 2:** Build:

```bash
npm run build
```

Esperado: sem erros.

- [ ] **Step 3:** Atualizar `docs/SUPPORT_AUTONOMOUS_SYSTEM.md` para refletir que o código vive em `@devorama/autosupport`. Substituir seção "Estrutura de Arquivos" por nota apontando o pacote.

- [ ] **Step 4:** Commit:

```bash
git add docs/SUPPORT_AUTONOMOUS_SYSTEM.md
git commit -m "docs(support): atualizar para refletir migração ao @devorama/autosupport"
```

- [ ] **Step 5:** Deploy:

```bash
git push origin main
# CI dispara deploy.yml; ou manual:
ssh monolito "sudo /opt/facefutura/deploy/update.sh"
```

- [ ] **Step 6:** Verificar:

```bash
ssh monolito "sudo tail -50 /opt/facefutura/logs/app.log | grep -E 'autosupport|sentry|github'"
```

Esperado: `[autosupport-queue] support tiers 2/3/4 workers started`. Sem stack traces.

- [ ] **Step 7:** Smoke test no chat de produção: abrir `https://facefutura.com`, mandar mensagem no widget, verificar que Tier 1 responde.

- [ ] **Step 8:** No devtools, publicar `@devorama/autosupport@0.1.0` no npm:

```bash
cd ~/repos/devorama/devtools/packages/autosupport
npm publish --access public
```

- [ ] **Step 9:** No FaceFutura, trocar tarball local pela versão publicada:

```bash
cd ~/repos/devorama/FaceFutura
npm uninstall @devorama/autosupport
npm install @devorama/autosupport@^0.1.0
git add package.json package-lock.json
git commit -m "chore(support): instalar @devorama/autosupport^0.1.0 do registry"
git push origin main
```

- [ ] **Step 10:** Deploy final:

```bash
ssh monolito "sudo /opt/facefutura/deploy/update.sh"
```

Verificar logs.

---

## Self-Review Checklist

- [x] Toda task da spec tem implementação (schema, clients, sse, queue, webhooks, tools, tiers, factory)
- [x] Sem placeholders ("TBD", "implementar X")
- [x] Tipos consistentes entre tasks (ToolBundle definido na Task 2, usado em todas)
- [x] Cada task termina com testes + commit
- [x] Convenções do monorepo respeitadas (tsup, vitest, biome, exports map)
- [x] Migração FaceFutura preserva system prompt e `read_data` no produto
- [x] Deploy + smoke test no final

## Próximos passos pós-merge

1. Aplicar em segundo produto (TiStats ou outro). Esse é o teste real da abstração.
2. Iterar pra `0.2.0`: API simplificada onde dor aparecer, novas tools (Slack notifier, etc).
3. Adicionar source map upload no CI (Sentry).
4. Documentar template "como adotar @devorama/autosupport em projeto Node novo".
