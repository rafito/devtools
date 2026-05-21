# @devorama/autosupport

Pipeline de suporte autônomo extraído do FaceFutura: chat (Tier 1) → investigação (Tier 2) → fix (Tier 3) → review (Tier 4), com webhooks GitHub e Sentry.

## Instalação

```bash
pnpm add @devorama/autosupport
# peer deps
pnpm add @anthropic-ai/sdk @sentry/node drizzle-orm express pg-boss
```

## Uso básico

```ts
import { createSupportPipeline } from '@devorama/autosupport'
import { db } from './db'
import { meuPromptDoTier1 } from './support-prompt'
import { domainTools } from './domain-tools'

const support = createSupportPipeline({
  db,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY!,
  github: {
    token: process.env.GITHUB_TOKEN!,
    repo: 'org/my-product',
    webhookSecret: process.env.GITHUB_WEBHOOK_SECRET!,
  },
  sentry: {
    dsn: process.env.SENTRY_DSN,
    apiToken: process.env.SENTRY_API_TOKEN!,
    orgSlug: 'my-org',
    projectSlug: 'my-product',
    webhookSecret: process.env.SENTRY_WEBHOOK_SECRET!,
  },
  queue: { connectionString: process.env.DATABASE_URL! },
  rootDir: process.cwd(),
  tier1: {
    systemPromptBuilder: meuPromptDoTier1,
    customTools: domainTools,
  },
})

// API REST
app.post('/api/support/chat', async (req, res) => {
  const result = await support.tier1.run({
    message: req.body.message,
    conversationId: req.body.conversationId,
    userContext: req.body.userContext,
  })
  res.json(result)
})

// Webhooks
app.post('/api/webhooks/github', express.raw({ type: 'application/json' }), support.webhooks.github)
app.post('/api/webhooks/sentry', express.raw({ type: 'application/json' }), support.webhooks.sentry)

// Iniciar fila
await support.queue.start()
```

## Schema

O pacote provê tabelas Drizzle reutilizáveis. Aplique no seu DB:

```ts
import { createSupportSchema } from '@devorama/autosupport'

export const { supportTickets, supportConversations,
  supportTicketStatusEnum, supportTicketSourceEnum } = createSupportSchema()
```

Foreign keys para `tenants` / `users` ficam por conta do consumer (varia por projeto).

## Architecture

- **Tier 1** — chat de suporte (Claude Haiku) com tools customizadas de domínio
- **Tier 2** — investiga código + logs + Sentry, cria GitHub issue (Claude Opus)
- **Tier 3** — escreve fix, roda testes, abre PR (Claude Opus)
- **Tier 4** — revisa diff, faz approve + merge (Claude Opus)

Spec completa: ver [docs/superpowers/specs/2026-05-20-autonomous-support-design.md](../../docs/superpowers/specs/2026-05-20-autonomous-support-design.md) no monorepo `devtools`.

## License

MIT
