# Plan: Autosupport Cross-Stack Service

## Dependency Graph

```text
repository ports
  ├── agent migration
  ├── webhook processors
  └── standalone database adapter
          └── standalone service
                  ├── CLI
                  ├── integration docs
                  └── release/publish
```

## Implementation Order

1. Introduce ORM-neutral repository ports and a Drizzle adapter while preserving
   legacy `db`/`schema` configuration.
2. Migrate conversations, tiers, and webhooks to resolved repositories.
3. Extract framework-neutral webhook processors and retain
   Express-compatible wrapper factories.
4. Add standalone PostgreSQL bootstrap and validated environment configuration.
5. Add the authenticated `node:http` service and npm CLI.
6. Make runtime dependencies install automatically and build both library and
   CLI entrypoints.
7. Document embedded Node and cross-stack service installation.
8. Run full verification, pack/smoke-test the artifact, publish `0.6.0`, and
   verify the public registry.

## Risks and Mitigations

- **Backward compatibility:** use config unions/resolvers and keep all current
  exports; run the existing suite unchanged throughout migration.
- **Webhook signature regression:** core processors receive raw bytes and the
  old handlers become thin wrappers; preserve current webhook tests.
- **Service security:** bearer auth, constant-time comparison, 1 MiB body limit,
  no shell command parsing, bind to loopback by default.
- **Database bootstrap drift:** keep bootstrap SQL alongside Drizzle schema and
  test its expected objects/configuration.
- **CLI packaging:** add an explicit tsup entry, package `bin`, inspect tarball,
  and install the exact tarball in a clean temporary project.
- **npm publication:** verify authentication and registry version before
  publishing; never republish an existing version.

## Verification Checkpoints

1. Repository migration: existing and new repository tests pass.
2. Webhook migration: all existing webhook tests plus processor tests pass.
3. Service: config and HTTP integration tests pass.
4. Packaging: build, declarations, executable CLI, and tarball smoke test pass.
5. Release: monorepo build/test/lint pass and npm registry returns `0.6.0`.
