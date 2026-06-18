# @devorama/autosupport

[![npm version](https://img.shields.io/npm/v/@devorama/autosupport.svg)](https://www.npmjs.com/package/@devorama/autosupport)
[![npm downloads](https://img.shields.io/npm/dm/@devorama/autosupport.svg)](https://www.npmjs.com/package/@devorama/autosupport)
[![license](https://img.shields.io/npm/l/@devorama/autosupport.svg)](https://github.com/rafito/devtools/blob/main/LICENSE)

An **autonomous support pipeline** for Node.js apps, powered by Claude. It escalates a ticket through four tiers — **chat → investigate → fix → review** — and wires straight into GitHub and Sentry webhooks. You bring Express, Drizzle, and pg-boss; this package brings the agents.

## How it works

| Tier | Role | Model |
|------|------|-------|
| **Tier 1** | Support chat with your custom domain tools | Claude Haiku |
| **Tier 2** | Investigates code + logs + Sentry, opens a GitHub issue | Claude Opus |
| **Tier 3** | Writes the fix, runs tests, opens a PR | Claude Opus |
| **Tier 4** | Reviews the diff, approves & merges | Claude Opus |

Full design spec: [autonomous-support-design.md](https://github.com/rafito/devtools/blob/main/docs/superpowers/specs/2026-05-20-autonomous-support-design.md).

## Install

```bash
npm install @devorama/autosupport
# peer dependencies (bring your own versions):
npm install @anthropic-ai/sdk @sentry/node drizzle-orm express pg-boss
```

## ⚠️ Sentry init order

For Sentry's Express auto-instrumentation to work, `initSentry` **must run before any import that uses Express**. Put it at the very top of your entry point:

```ts
// server/index.ts — the very first lines
import { initSentry } from '@devorama/autosupport'
initSentry({ dsn: process.env.SENTRY_DSN, environment: process.env.NODE_ENV })

// only AFTER initSentry, import everything else:
import express from 'express'
import { support } from './lib/autosupport'
```

`createSupportPipeline` no longer calls `initSentry` internally (correct ordering with Express couldn't be guaranteed), and `dsn` was removed from the `sentry` config block — pass it directly to `initSentry`.

## Usage

```ts
import { createSupportPipeline } from '@devorama/autosupport'
import { db } from './db'
import { buildTier1Prompt } from './support-prompt'
import { domainTools } from './domain-tools'

const support = createSupportPipeline({
  db,
  llm: {
    provider: 'openai', // ou 'anthropic'
    apiKey: process.env.OPENAI_API_KEY!,
    // models opcional: { fast: '...', heavy: '...' }
  },
  github: {
    token: process.env.GITHUB_TOKEN!,
    repo: 'org/my-product',
    webhookSecret: process.env.GITHUB_WEBHOOK_SECRET!,
  },
  sentry: {
    apiToken: process.env.SENTRY_API_TOKEN!,
    orgSlug: 'my-org',
    projectSlug: 'my-product',
    webhookSecret: process.env.SENTRY_WEBHOOK_SECRET!,
  },
  queue: { connectionString: process.env.DATABASE_URL! },
  rootDir: process.cwd(),
  tier1: {
    systemPromptBuilder: buildTier1Prompt,
    customTools: domainTools,
  },
  // testCommand is OPT-IN. By default Tier 3 does NOT run tests locally — CI
  // validates the PR instead (safer: avoids running tests against a prod DB).
  // Enable it only in dev/sandbox environments:
  // testCommand: { command: 'pnpm', args: ['test'] },
})

// REST endpoint for Tier 1 chat
app.post('/api/support/chat', async (req, res) => {
  const result = await support.tier1.run({
    message: req.body.message,
    conversationId: req.body.conversationId,
    userContext: req.body.userContext,
  })
  res.json(result)
})

// Webhooks (Tiers 2–4 are driven by these)
app.post('/api/webhooks/github', express.raw({ type: 'application/json' }), support.webhooks.github)
app.post('/api/webhooks/sentry', express.raw({ type: 'application/json' }), support.webhooks.sentry)

// Start the background queue
await support.queue.start()
```

> **Note:** Per-role model selection is configured via `llm.models` (`fast` for Tier 1, `heavy` for Tiers 2–4); there is no per-tier `model` option.

## Database schema

The package ships reusable Drizzle tables. Apply them to your database:

```ts
import { createSupportSchema } from '@devorama/autosupport'

export const {
  supportTickets,
  supportConversations,
  supportTicketStatusEnum,
  supportTicketSourceEnum,
} = createSupportSchema()
```

Foreign keys to your own `tenants` / `users` tables are left to the consumer (they vary per project).

## License

[MIT](./LICENSE) © Rafael D'Arrigo
