# Changelog

All notable changes to `@devorama/autosupport` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Pre-1.0: minor versions may carry breaking changes.

## [0.5.0] - 2026-06-18

### Removed

- **BREAKING:** `runToolLoop` and its `ToolLoopOptions` / `ToolLoopResult` types
  (deleted `tiers/runner.ts`). Use the `LlmProvider` port —
  `createLlmProvider(...).runWithTools(...)`.
- **BREAKING:** the `anthropicApiKey` config shim. `llm: LlmConfig` is now
  required; use `llm: { provider: 'anthropic', apiKey }`.
- The `@anthropic-ai/sdk` peer/dev dependency — no longer imported anywhere.

### Changed

- Single configuration path: `createSupportPipeline` throws
  `cfg.llm é obrigatório` when `llm` is missing.

## [0.4.0] - 2026-06-18

### Added

- Multi-provider LLM port (`LlmProvider`) over the Vercel AI SDK, selectable via
  `llm: { provider: 'anthropic' | 'openai', apiKey, models? }`. **Adds OpenAI
  support.**
- New exports: `createLlmProvider` and the `LlmProvider`, `LlmConfig`,
  `LlmMessage`, `LlmRunOptions`, `LlmRunResult`, `LlmModelRole` types.
- Provider-agnostic agent loop (`generateText`-based) with a per-role model map
  (`fast` for Tier 1, `heavy` for Tiers 2–4).

### Changed

- Tiers 1–4 no longer instantiate `@anthropic-ai/sdk`; they receive an injected
  `LlmProvider`.
- `anthropicApiKey` kept as a deprecated retrocompat shim equivalent to
  `llm: { provider: 'anthropic', apiKey }`. _(Removed in 0.5.0.)_
- Removed the silently-ignored per-tier `model?` config fields; per-role
  overrides live in `llm.models`.
- Description and keywords updated for multi-provider.

## [0.3.2] - 2026-06-18

### Fixed

- Cleared lint errors (`noExplicitAny` and related).

## [0.3.1] - 2026-06-18

### Changed

- README / npm presentation polish.

## [0.3.0] - 2026-06-18

### Added

- Attach the support-chat conversation transcript to the Tier 2/3 context and
  the generated PR body.

## [0.2.0] - 2026-05-21

### Added

- Tier 3 fail-safe path: on failure, post an issue comment, run git cleanup, and
  revert ticket status.

### Changed

- `initSentry` moved out of the factory — the consumer calls it at the entry
  point (correct ordering with Express).

## [0.1.3] - 2026-05-21

### Fixed

- Sentry `searchIssues` uses `project:slug` query syntax.

## [0.1.2] - 2026-05-21

### Fixed

- Factory tolerates incomplete Sentry config (stub client + webhook `503`).

## [0.1.1] - 2026-05-21

### Fixed

- CJS output uses the `.cjs` extension.

## [0.1.0] - 2026-05-21

### Added

- Initial release: chat / investigation / fix / review tiers driven by GitHub +
  Sentry webhooks. Bring your own Express, Drizzle, and pg-boss.
