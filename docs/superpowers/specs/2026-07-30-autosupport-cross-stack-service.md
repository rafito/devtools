# Spec: Autosupport Cross-Stack Service

**Date:** 2026-07-30
**Target release:** `@devorama/autosupport@0.6.0`
**Status:** Released to npm

## Objective

Make the existing autosupport pipeline usable by applications written in any
backend language without duplicating the four-tier agent implementation.

Node.js applications may continue embedding `@devorama/autosupport` directly.
FastAPI, Django, Rails, Laravel, Spring, and other backends integrate with a
standalone Node.js HTTP service started from the same npm package:

```bash
npx @devorama/autosupport serve
```

The service owns autosupport's PostgreSQL tables and queue, receives tickets and
webhooks over HTTP, and runs the existing investigation/fix/review tiers against
a mounted or checked-out application repository. The application repository may
use any programming language; its test command is configurable.

Existing `0.5.x` Node.js pipeline consumers remain source-compatible. The
Sentry Node initialization helper moves to the explicit `/sentry-node` subpath
so standalone installs do not inherit vulnerabilities from an unused
instrumentation tree.
The minimum runtime changes from Node.js 18 to Node.js 22 so the release can
use AI SDK 7 and avoid known vulnerabilities in the older HTTP dependency tree.

## Acceptance Scenarios

1. An existing Express application can upgrade from `0.5.x`, construct
   `createSupportPipeline({ db, ... })`, and run its existing tests unchanged.
2. A FastAPI application can submit a support ticket with an authenticated HTTP
   request and receive a ticket ID.
3. The service persists the ticket, enqueues Tier 2, and exposes ticket status.
4. GitHub and Sentry can post their signed webhook payloads directly to the
   service.
5. The service can run a configured command such as `pytest` in the target
   repository.
6. A health endpoint reports whether the process is ready.
7. The standalone npm package installs without Express or Sentry Node. Drizzle
   and pg-boss install automatically. Embedded applications install the
   optional Sentry Node peer only when using `/sentry-node`.
8. Documentation includes direct Node usage, service usage, FastAPI, Django, and
   a language-neutral HTTP/cURL integration applicable to other backends.
9. Version `0.6.0` is built, tested, packed, and published publicly to npm.

## Tech Stack

- TypeScript 5.7, Node.js 22+
- Existing Vercel AI SDK provider port
- PostgreSQL via `postgres` and Drizzle ORM
- pg-boss for background jobs
- Node's built-in `node:http` server for the standalone service
- Vitest and Supertest-compatible structural webhook handlers
- tsup for ESM, CommonJS, declarations, and CLI builds

## HTTP Contract

All `/v1/*` endpoints require:

```http
Authorization: Bearer <AUTOSUPPORT_SERVICE_TOKEN>
Content-Type: application/json
```

Webhook endpoints use their provider HMAC signatures and do not use the bearer
token.

### `GET /health`

Returns `200` with `{ "status": "ok", "version": "0.6.0" }`.

### `POST /v1/tickets`

Request:

```json
{
  "description": "Checkout returns HTTP 500",
  "source": "chat",
  "tenantId": "optional UUID",
  "userId": "optional UUID",
  "conversationId": "optional UUID",
  "sentryIssueId": "optional string"
}
```

Returns `202` with `{ "ticketId": "...", "status": "open" }`. The service
creates and enqueues the ticket.

### `GET /v1/tickets/:ticketId`

Returns `200` with the normalized ticket row or `404` when absent.

### `POST /webhooks/github`

Accepts the raw GitHub payload and `x-hub-signature-256` /
`x-github-event` headers. Semantics remain equal to the existing Express
handler.

### `POST /webhooks/sentry`

Accepts the raw Sentry payload and `sentry-hook-signature` header. Semantics
remain equal to the existing Express handler.

Unknown routes return JSON `404`; malformed JSON returns `400`; unauthorized
API calls return `401`; request bodies larger than 1 MiB return `413`.

## Configuration

Required environment variables:

- `AUTOSUPPORT_DATABASE_URL`
- `AUTOSUPPORT_GITHUB_TOKEN`
- `AUTOSUPPORT_GITHUB_REPO` (`owner/repository`)
- `AUTOSUPPORT_GITHUB_WEBHOOK_SECRET`
- `AUTOSUPPORT_ROOT_DIR`
- `AUTOSUPPORT_SERVICE_TOKEN`
- One of `OPENAI_API_KEY` or `ANTHROPIC_API_KEY`

Optional:

- `AUTOSUPPORT_LLM_PROVIDER` (`openai` or `anthropic`; inferred from keys)
- `AUTOSUPPORT_FAST_MODEL`, `AUTOSUPPORT_HEAVY_MODEL`
- `AUTOSUPPORT_HOST` (default `127.0.0.1`)
- `AUTOSUPPORT_PORT` (default `4310`)
- `AUTOSUPPORT_LOG_FILE`
- `AUTOSUPPORT_TEST_COMMAND_JSON`, e.g.
  `{"command":"python","args":["-m","pytest"],"cwd":"/workspace/app"}`
- `AUTOSUPPORT_SENTRY_API_TOKEN`
- `AUTOSUPPORT_SENTRY_ORG`
- `AUTOSUPPORT_SENTRY_PROJECT`
- `AUTOSUPPORT_SENTRY_WEBHOOK_SECRET`
- `AUTOSUPPORT_AUTO_LABEL`
- `AUTOSUPPORT_DEFAULT_BRANCH`

The service rejects invalid ports, malformed JSON configuration, missing
required values, and unsafe empty service tokens at startup.

## Project Structure

```text
packages/autosupport/src/
  cli.ts                    npm executable
  persistence/
    types.ts                framework/ORM-neutral repository contracts
    drizzle.ts              legacy/current Drizzle adapter
  service/
    config.ts               environment parsing and validation
    database.ts             PostgreSQL connection and schema bootstrap
    server.ts               node:http API and lifecycle
  webhooks/
    types.ts                framework-neutral HTTP shapes
    github.ts               core processor + Express-compatible adapter
    sentry.ts               core processor + Express-compatible adapter
packages/autosupport/tests/
  persistence/              repository adapter tests
  service/                  config and HTTP integration tests
docs/                       design and installation documentation
```

## Code Style

Use existing package conventions: factory functions, dependency injection,
explicit public types, no environment reads outside the service config module,
and Portuguese user-facing error messages where the existing API already uses
Portuguese.

```ts
export type TicketRepository = {
  findById(id: string): Promise<SupportTicketRow | null>
  create(input: CreateTicketInput): Promise<SupportTicketRow>
  update(id: string, patch: UpdateTicketInput): Promise<void>
}

export function createTicketRepository(db: SupportDb, schema: SupportSchema): TicketRepository {
  return {
    async findById(id) {
      // Adapter-specific query stays outside the agent.
    },
  }
}
```

Formatting and linting follow Biome defaults already configured by the
monorepo.

## Testing Strategy

- Preserve and run all existing unit tests.
- Add repository contract/adapter unit tests.
- Add configuration tests covering required values and invalid values.
- Add HTTP integration tests for health, authentication, ticket creation,
  ticket lookup, malformed/oversized bodies, and webhook routing.
- Test the CLI `--help` and invalid-command paths without opening production
  connections.
- Run package build, tests, lint, root test/build, and `npm pack --dry-run`.
- Smoke-test the packed tarball in a temporary directory before publication.
- Verify the registry reports `0.6.0` after publication.

## Commands

```bash
pnpm --filter @devorama/autosupport build
pnpm --filter @devorama/autosupport test
pnpm --filter @devorama/autosupport lint
pnpm build
pnpm test
pnpm lint
npm pack --dry-run --workspace packages/autosupport
npm publish --access public --workspace packages/autosupport
npm view @devorama/autosupport@0.6.0 version
```

## Boundaries

### Always

- Keep the existing direct Node factory operational.
- Authenticate non-webhook service endpoints.
- Verify webhook signatures against raw request bytes.
- Keep filesystem and git operations constrained by `rootDir`.
- Avoid logging credentials and bearer tokens.
- Shut down HTTP, queue, and database resources gracefully.
- Publish only after build, tests, lint, pack inspection, and tarball smoke test.

### Ask First

- Changing existing support table columns or enum values.
- Publishing a breaking `1.0.0` release.
- Creating a separate PyPI implementation.
- Replacing PostgreSQL or pg-boss.

### Never

- Commit API keys, npm tokens, or application secrets.
- Expose ticket mutation endpoints without authentication.
- Execute a shell string; test commands remain executable plus argument arrays.
- Duplicate the four tiers in Python.
- Publish over an existing immutable npm version.

## Success Criteria

- All acceptance scenarios pass.
- Existing public imports build.
- The package README explains both embedded Node and standalone cross-stack
  installation paths.
- A user can follow the FastAPI example without installing npm dependencies in
  the Python application itself.
- `@devorama/autosupport@0.6.0` is publicly visible on npm.

## Open Questions

None. The user approved the assumptions on 2026-07-30.
