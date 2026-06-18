# devtools

[![license](https://img.shields.io/github/license/rafito/devtools.svg)](./LICENSE)
[![pnpm](https://img.shields.io/badge/maintained%20with-pnpm-f69220.svg)](https://pnpm.io/)
[![Turbo](https://img.shields.io/badge/built%20with-Turbo-blue.svg)](https://turbo.build/)

A monorepo of small, focused, **published** packages from the Devorama toolbox — utilities, React hooks, and a few CLIs. Each package stands on its own on npm.

## Packages

| Package | Version | Description |
|---------|---------|-------------|
| [`@devorama/utils`](./packages/utils) | [![npm](https://img.shields.io/npm/v/@devorama/utils.svg)](https://www.npmjs.com/package/@devorama/utils) | Zero-dependency formatters, validators & helpers (CPF, CNPJ, CEP, currency, dates) |
| [`@devorama/react`](./packages/react) | [![npm](https://img.shields.io/npm/v/@devorama/react.svg)](https://www.npmjs.com/package/@devorama/react) | SSR-safe, fully typed React hooks |
| [`@devorama/secrets`](./packages/secrets) | [![npm](https://img.shields.io/npm/v/@devorama/secrets.svg)](https://www.npmjs.com/package/@devorama/secrets) | CLI to push/pull `.env` files to AWS Parameter Store via `chamber` |
| [`@devorama/clip2devbox`](./packages/clip2devbox) | [![npm](https://img.shields.io/npm/v/@devorama/clip2devbox.svg)](https://www.npmjs.com/package/@devorama/clip2devbox) | Windows CLI: send a clipboard file/screenshot to a remote devbox over Tailscale |
| [`@devorama/autosupport`](./packages/autosupport) | [![npm](https://img.shields.io/npm/v/@devorama/autosupport.svg)](https://www.npmjs.com/package/@devorama/autosupport) | Autonomous support pipeline (chat → investigate → fix → review) powered by Claude |

Each package has its own README with full usage docs — click the package name above.

## Install

```bash
npm install @devorama/utils          # general-purpose utilities
npm install @devorama/react          # React hooks
npm install -D @devorama/secrets     # secrets CLI (usually a devDependency)
npm install -g @devorama/clip2devbox # Windows clipboard CLI (global)
npm install @devorama/autosupport    # autonomous support pipeline
```

## Development

### Requirements

- Node.js 18+
- pnpm 9+

### Setup

```bash
git clone https://github.com/rafito/devtools.git
cd devtools
pnpm install
```

### Commands

```bash
pnpm build    # build every package (via Turbo)
pnpm test     # run every package's tests
pnpm lint     # lint with Biome
pnpm format   # format with Biome
```

### Layout

```
devtools/
├── packages/
│   ├── utils/         # @devorama/utils
│   ├── react/         # @devorama/react
│   ├── secrets/       # @devorama/secrets
│   ├── clip2devbox/   # @devorama/clip2devbox
│   └── autosupport/   # @devorama/autosupport
├── turbo.json
├── pnpm-workspace.yaml
└── biome.json
```

## Publishing

```bash
# 1. build everything
pnpm build

# 2. authenticate with npm (first time only)
npm login

# 3. bump the version in the target package's package.json, then publish
pnpm --filter './packages/*' publish --no-git-checks
```

Each package is versioned independently; publishing is gated by `publishConfig.access: "public"`.

## License

[MIT](./LICENSE) © Rafael D'Arrigo
