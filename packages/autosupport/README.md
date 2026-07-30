# @devorama/autosupport

[![npm version](https://img.shields.io/npm/v/@devorama/autosupport.svg)](https://www.npmjs.com/package/@devorama/autosupport)
[![npm downloads](https://img.shields.io/npm/dm/@devorama/autosupport.svg)](https://www.npmjs.com/package/@devorama/autosupport)
[![license](https://img.shields.io/npm/l/@devorama/autosupport.svg)](https://github.com/rafito/devtools/blob/main/LICENSE)

Autonomous support pipeline that moves a bug through **report → investigation →
fix → review → merge**. It can be embedded in a Node.js backend or run as a
standalone HTTP service beside FastAPI, Django, Rails, Laravel, Spring, Go, or
any other backend.

The agents can investigate repositories in any language. File search is not
limited to TypeScript, and the optional test command can be `pytest`, `go test`,
Maven, Gradle, PHPUnit, RSpec, or another executable.

## Choose the installation

| Your backend | Installation |
|---|---|
| Node.js / Express | Import the npm library directly |
| FastAPI / Django / Python | Run the npm service separately; call it over HTTP |
| Rails / Laravel / Spring / Go / other | Run the npm service separately; call it over HTTP |

There is one agent implementation. Python and other stacks do not need a
duplicated autosupport package.

## Pipeline

| Tier | Role | Default model role |
|---|---|---|
| Tier 1 | Embedded support chat with application-specific tools | `fast` |
| Tier 2 | Investigates source, logs, and Sentry; opens a GitHub issue | `heavy` |
| Tier 3 | Writes a fix, optionally runs the configured tests, and opens a PR | `heavy` |
| Tier 4 | Reviews the PR and approves/merges or requests human review | `heavy` |

OpenAI and Anthropic are supported through the Vercel AI SDK. Models can be
overridden per role.

## Standalone service

Use this mode for FastAPI, Django, Rails, Laravel, Spring, Go, and other
non-Node backends.

The autosupport service is a separate Node.js process. It needs:

- Node.js 22 or newer;
- PostgreSQL;
- a local checkout or mounted copy of the repository it will investigate;
- `git` and `grep`;
- the target stack's runtime only if local tests are enabled. For example,
  running `pytest` requires Python and the project dependencies in the
  autosupport process/container.

The service creates its own `support_tickets` and `support_conversations` tables
automatically. A dedicated PostgreSQL database is recommended.

### Install and start

For a quick run:

```bash
npx -y @devorama/autosupport@0.6.0 serve
```

For a long-running installation:

```bash
mkdir autosupport-service
cd autosupport-service
npm init -y
npm install @devorama/autosupport@0.6.0
npx autosupport serve
```

Required environment:

```bash
export AUTOSUPPORT_DATABASE_URL='postgres://user:password@localhost:5432/autosupport'
export AUTOSUPPORT_GITHUB_TOKEN='github-token'
export AUTOSUPPORT_GITHUB_REPO='owner/repository'
export AUTOSUPPORT_GITHUB_WEBHOOK_SECRET='github-webhook-secret'
export AUTOSUPPORT_ROOT_DIR='/workspace/my-application'
export AUTOSUPPORT_SERVICE_TOKEN="$(openssl rand -hex 32)"

# Choose one provider:
export OPENAI_API_KEY='openai-key'
export AUTOSUPPORT_LLM_PROVIDER='openai'
# or:
# export ANTHROPIC_API_KEY='anthropic-key'
# export AUTOSUPPORT_LLM_PROVIDER='anthropic'

npx autosupport serve
```

It listens on `http://127.0.0.1:4310` by default.

### Configuration

| Variable | Required | Description |
|---|---:|---|
| `AUTOSUPPORT_DATABASE_URL` | yes | PostgreSQL connection URL |
| `AUTOSUPPORT_GITHUB_TOKEN` | yes | Token allowed to create issues, branches, and PRs |
| `AUTOSUPPORT_GITHUB_REPO` | yes | `owner/repository` |
| `AUTOSUPPORT_GITHUB_WEBHOOK_SECRET` | yes | Secret configured on the GitHub webhook |
| `AUTOSUPPORT_ROOT_DIR` | yes | Absolute path to the checked-out application repository |
| `AUTOSUPPORT_SERVICE_TOKEN` | yes | Random bearer token, at least 16 characters |
| `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` | yes | Selected LLM provider key |
| `AUTOSUPPORT_LLM_PROVIDER` | no | `openai` or `anthropic`; inferred from the available key |
| `AUTOSUPPORT_FAST_MODEL` | no | Model override for Tier 1 |
| `AUTOSUPPORT_HEAVY_MODEL` | no | Model override for Tiers 2–4 |
| `AUTOSUPPORT_HOST` | no | Bind address; default `127.0.0.1` |
| `AUTOSUPPORT_PORT` | no | HTTP port; default `4310` |
| `AUTOSUPPORT_LOG_FILE` | no | Application log file visible to the investigator |
| `AUTOSUPPORT_TEST_COMMAND_JSON` | no | Safe executable/argument configuration |
| `AUTOSUPPORT_AUTO_LABEL` | no | Automated PR label; default `support-auto` |
| `AUTOSUPPORT_DEFAULT_BRANCH` | no | Branch restored after a failed fix; default `main` |
| `AUTOSUPPORT_SENTRY_API_TOKEN` | no | Sentry API token |
| `AUTOSUPPORT_SENTRY_ORG` | no | Sentry organization slug |
| `AUTOSUPPORT_SENTRY_PROJECT` | no | Sentry project slug |
| `AUTOSUPPORT_SENTRY_WEBHOOK_SECRET` | no | Sentry webhook signing secret |

Test commands are JSON, not shell strings:

```bash
# Python / FastAPI / Django
export AUTOSUPPORT_TEST_COMMAND_JSON='{"command":"python","args":["-m","pytest"],"cwd":"/workspace/my-application","timeoutMs":300000}'

# Node.js
export AUTOSUPPORT_TEST_COMMAND_JSON='{"command":"npm","args":["test"],"cwd":"/workspace/my-application"}'

# Go
export AUTOSUPPORT_TEST_COMMAND_JSON='{"command":"go","args":["test","./..."],"cwd":"/workspace/my-application"}'
```

When omitted, Tier 3 leaves validation to CI.

### HTTP API

Health does not require authentication:

```bash
curl http://127.0.0.1:4310/health
```

Create and enqueue a ticket:

```bash
curl -X POST http://127.0.0.1:4310/v1/tickets \
  -H "Authorization: Bearer $AUTOSUPPORT_SERVICE_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"description":"Checkout returns HTTP 500","source":"chat"}'
```

Response:

```json
{
  "ticketId": "e1461ac8-4767-4dfc-88c0-a7b22fe60031",
  "status": "open"
}
```

Read its status:

```bash
curl http://127.0.0.1:4310/v1/tickets/e1461ac8-4767-4dfc-88c0-a7b22fe60031 \
  -H "Authorization: Bearer $AUTOSUPPORT_SERVICE_TOKEN"
```

Provider webhooks:

```text
POST /webhooks/github
POST /webhooks/sentry
```

Point GitHub and Sentry directly to the public HTTPS URLs for those routes.
They use the provider HMAC signature, not the service bearer token. Put the
service behind a TLS reverse proxy and preserve the raw request body.

### FastAPI

Do not run `npm install` inside the FastAPI application. Deploy the autosupport
service separately and call it with `httpx`:

```bash
pip install httpx
```

```python
import os

import httpx
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()

AUTOSUPPORT_URL = os.environ["AUTOSUPPORT_URL"]
AUTOSUPPORT_TOKEN = os.environ["AUTOSUPPORT_SERVICE_TOKEN"]


class BugReport(BaseModel):
    description: str


@app.post("/api/support/tickets", status_code=202)
async def create_support_ticket(report: BugReport):
    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.post(
            f"{AUTOSUPPORT_URL}/v1/tickets",
            headers={"Authorization": f"Bearer {AUTOSUPPORT_TOKEN}"},
            json={"description": report.description, "source": "chat"},
        )
        response.raise_for_status()
        return response.json()
```

Application environment:

```bash
export AUTOSUPPORT_URL='http://autosupport:4310'
export AUTOSUPPORT_SERVICE_TOKEN='the-same-token-used-by-the-service'
```

### Django

```bash
pip install requests
```

```python
import os

import requests
from django.http import JsonResponse
from django.views.decorators.http import require_POST


@require_POST
def create_support_ticket(request):
    response = requests.post(
        f"{os.environ['AUTOSUPPORT_URL']}/v1/tickets",
        headers={
            "Authorization": f"Bearer {os.environ['AUTOSUPPORT_SERVICE_TOKEN']}"
        },
        json={"description": request.POST["description"], "source": "chat"},
        timeout=15,
    )
    return JsonResponse(response.json(), status=response.status_code)
```

### Rails, Laravel, Spring, Go, and other backends

Use the same `POST /v1/tickets` contract shown in the cURL example. Every
backend only needs an HTTP client capable of sending JSON and a bearer token.
Keep the service URL and token in server-side environment variables; never send
the service token to a browser or mobile client.

### Container/process deployment

The service and application can run:

- as two processes on the same VM;
- as sidecars sharing the checked-out repository volume;
- as separate containers with the repository mounted into the autosupport
  container;
- as separate services with an autosupport worker workspace containing a clone
  of the target repository.

Use a dedicated, clean checkout for `AUTOSUPPORT_ROOT_DIR`. Tier 3 creates
branches, writes files, and restores the working tree when an attempted fix
fails; it must not share a developer's checkout with uncommitted work.

Minimal base Dockerfile:

```dockerfile
FROM node:22-bookworm-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends git grep ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN npm install --global @devorama/autosupport@0.6.0
ENTRYPOINT ["autosupport", "serve"]
```

Extend that image with Python, Java, PHP, Ruby, or Go only when the configured
local test command needs it.

## Embedded Node.js / Express

Node.js applications can keep the pipeline in-process:

```bash
npm install @devorama/autosupport
```

Version `0.6.x` requires Node.js 22 or newer.

Drizzle, pg-boss, and the LLM SDK integrations are installed by the package.
Express remains your application's choice; it is not required by the standalone
service.

```ts
import express from 'express'
import { createSupportPipeline } from '@devorama/autosupport'
import { db } from './db'
import { buildTier1Prompt } from './support-prompt'
import { domainTools } from './domain-tools'

const app = express()

const support = createSupportPipeline({
  db,
  llm: {
    provider: 'openai', // or 'anthropic'
    apiKey: process.env.OPENAI_API_KEY!,
    // models: { fast: '...', heavy: '...' },
  },
  github: {
    token: process.env.GITHUB_TOKEN!,
    repo: 'org/my-product',
    webhookSecret: process.env.GITHUB_WEBHOOK_SECRET!,
  },
  sentry: {
    apiToken: process.env.SENTRY_API_TOKEN ?? '',
    orgSlug: process.env.SENTRY_ORG ?? '',
    projectSlug: process.env.SENTRY_PROJECT ?? '',
    webhookSecret: process.env.SENTRY_WEBHOOK_SECRET ?? '',
  },
  queue: { connectionString: process.env.DATABASE_URL! },
  rootDir: process.cwd(),
  tier1: {
    systemPromptBuilder: buildTier1Prompt,
    customTools: domainTools,
  },
  // Opt-in local validation:
  // testCommand: { command: 'npm', args: ['test'] },
})

app.post('/api/support/chat', async (req, res) => {
  const result = await support.tier1.run({
    message: req.body.message,
    conversationId: req.body.conversationId,
    userContext: req.body.userContext,
  })
  res.json(result)
})

app.post(
  '/api/webhooks/github',
  express.raw({ type: 'application/json' }),
  support.webhooks.github
)
app.post(
  '/api/webhooks/sentry',
  express.raw({ type: 'application/json' }),
  support.webhooks.sentry
)

await support.queue.start()
```

### Sentry initialization order

The standalone service uses Sentry's HTTP API and webhook and does not need the
Sentry Node SDK. Embedded Node applications that want automatic
instrumentation install the optional adapter:

```bash
npm install @sentry/node
```

Initialize it before importing Express:

```ts
import { initSentry } from '@devorama/autosupport/sentry-node'

initSentry({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
})

const { default: express } = await import('express')
```

### Custom persistence

The tiers now depend on repository contracts instead of Drizzle directly.
Existing `{ db, schema? }` configuration remains supported. Non-Drizzle Node
applications can inject:

```ts
createSupportPipeline({
  repositories: {
    tickets: myTicketRepository,
    conversations: myConversationRepository,
  },
  // remaining configuration...
})
```

See the exported `TicketRepository`, `ConversationRepository`, and
`SupportRepositories` types.

### Database schema for embedded mode

```ts
import { createSupportSchema } from '@devorama/autosupport'

export const {
  supportTickets,
  supportConversations,
  supportTicketStatusEnum,
  supportTicketSourceEnum,
} = createSupportSchema()
```

Foreign keys to application tenants/users remain consumer-owned.

## Security notes

- Give the GitHub token only the repository permissions the pipeline needs.
- Use a dedicated PostgreSQL database/user where possible.
- Keep `AUTOSUPPORT_SERVICE_TOKEN` server-side and rotate it like any API key.
- Expose the service through HTTPS; the default bind address is loopback.
- Mount only the repository the agents are allowed to read and modify.
- Protect production credentials and infrastructure files with repository
  permissions and CI review.
- Local test commands execute in the autosupport runtime. Use a sandbox/test
  database, never production data.

## Development

```bash
pnpm install
pnpm --filter @devorama/autosupport build
pnpm --filter @devorama/autosupport test
pnpm --filter @devorama/autosupport lint
```

Design documents:

- [original autonomous support design](../../docs/superpowers/specs/2026-05-20-autonomous-support-design.md)
- [cross-stack service design](../../docs/superpowers/specs/2026-07-30-autosupport-cross-stack-service.md)

## License

[MIT](./LICENSE) © Rafael D'Arrigo
