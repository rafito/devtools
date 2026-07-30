# Tasks: Autosupport Cross-Stack Service

- [x] Task 1: Add persistence ports and Drizzle adapters
  - Acceptance: Agents can consume repositories; legacy `db`/`schema` inputs
    resolve to the Drizzle adapter.
  - Verify: persistence tests and existing schema tests pass.
  - Files: `src/persistence/*`, `tests/persistence/*`, `src/types.ts`

- [x] Task 2: Migrate tiers and conversations to repositories
  - Acceptance: No tier imports `drizzle-orm`; direct factory callers remain
    compatible.
  - Verify: all tier and conversation tests pass.
  - Files: `src/tiers/*`, tier tests

- [x] Task 3: Extract framework-neutral webhook processors
  - Acceptance: Core webhook logic accepts raw-body request shapes; current
    Express-compatible handlers still pass existing tests.
  - Verify: all webhook tests pass.
  - Files: `src/webhooks/*`, webhook tests

- [x] Task 4: Add service configuration and database bootstrap
  - Acceptance: Environment is validated and the service can create its own
    autosupport tables and Drizzle repositories.
  - Verify: config/database unit tests pass.
  - Files: `src/service/config.ts`, `src/service/database.ts`,
    `tests/service/config.test.ts`, `tests/service/database.test.ts`

- [x] Task 5: Implement authenticated standalone HTTP service
  - Acceptance: Health, ticket creation/status, errors, auth, and webhook routes
    satisfy the spec.
  - Verify: service HTTP integration tests pass.
  - Files: `src/service/server.ts`, `src/service/index.ts`,
    `tests/service/server.test.ts`, supporting fixtures

- [x] Task 6: Add npm CLI and package build configuration
  - Acceptance: `npx @devorama/autosupport serve` starts the service and
    `--help` works; consumers do not manually install former peers.
  - Verify: CLI tests, package build, and declaration build pass.
  - Files: `src/cli.ts`, `package.json`, `tsup.config.ts`, CLI tests

- [x] Task 7: Document all supported backend integration paths
  - Acceptance: README covers embedded Node, FastAPI, Django, Docker/process
    deployment, and generic HTTP integration with complete commands.
  - Verify: commands, environment names, and endpoints match implementation.
  - Files: package README, root README, changelog

- [x] Task 8: Release and publish `0.6.0`
  - Acceptance: full monorepo verification and tarball smoke test pass; npm
    registry exposes the public version.
  - Verify: `npm view @devorama/autosupport@0.6.0 version` returns `0.6.0`.
  - Files: release metadata and generated package artifact only
