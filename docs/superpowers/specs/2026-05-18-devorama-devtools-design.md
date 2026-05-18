# Design: @devorama/devtools

**Data:** 2026-05-18  
**Status:** aprovado

## Contexto

O ecossistema `devorama` tem múltiplos projetos que precisam compartilhar utilitários comuns — formatadores, validadores, helpers funcionais, hooks React e automação de secrets via AWS Parameter Store. Este repositório centraliza essas ferramentas como um monorepo com pacotes separados por runtime.

## Estrutura do repositório

```
devorama/devtools/
├── package.json               # workspaces config (pnpm)
├── pnpm-workspace.yaml
├── turbo.json                 # pipeline de build/test/lint
├── tsconfig.base.json         # tsconfig base com strict: true
├── biome.json                 # lint + format
├── packages/
│   ├── utils/                 # @devorama/utils
│   │   ├── src/
│   │   │   ├── formatters/    # datas, moeda, números (padrão BR)
│   │   │   ├── validators/    # CPF, CNPJ, email, CEP, telefone
│   │   │   └── helpers/       # array/object: groupBy, pick, omit, etc.
│   │   ├── package.json
│   │   ├── tsup.config.ts
│   │   └── vitest.config.ts
│   ├── react/                 # @devorama/react
│   │   ├── src/
│   │   │   └── hooks/         # useDebounce, useLocalStorage, usePrevious, etc.
│   │   ├── package.json
│   │   ├── tsup.config.ts
│   │   └── vitest.config.ts
│   └── secrets/               # @devorama/secrets
│       ├── src/
│       │   ├── cli.ts         # entry point CLI (bin: devtools)
│       │   ├── push.ts        # .env → AWS Parameter Store via chamber
│       │   └── pull.ts        # AWS Parameter Store → .env
│       ├── package.json
│       ├── tsup.config.ts
│       └── vitest.config.ts
└── docs/
    └── superpowers/specs/
```

## Pacotes

### `@devorama/utils`

Utilitários puros, zero dependências externas. Roda em browser, Node.js e edge runtimes.

**Formatadores** (`src/formatters/`):
- `formatDate(date, format?)` — padrão `dd/MM/yyyy`
- `formatCurrency(value, currency?)` — padrão BRL (`R$ 1.234,56`)
- `formatCPF(value)` — `000.000.000-00`
- `formatCNPJ(value)` — `00.000.000/0000-00`
- `formatPhone(value)` — `(00) 00000-0000`
- `formatCEP(value)` — `00000-000`

**Validadores** (`src/validators/`):
- `isValidCPF(value)` — valida dígitos verificadores
- `isValidCNPJ(value)` — valida dígitos verificadores
- `isValidEmail(value)`
- `isValidPhone(value)` — aceita formatos BR com/sem DDD
- `isValidCEP(value)`

**Helpers** (`src/helpers/`):
- `groupBy<T>(array, keyFn)` — agrupa array por chave derivada
- `pick<T>(obj, keys)` — retorna subset de um objeto
- `omit<T>(obj, keys)` — retorna objeto sem as chaves listadas
- `deepMerge(target, source)` — merge recursivo de objetos
- `chunk<T>(array, size)` — divide array em pedaços

**Build:** `tsup` gerando CJS + ESM + `.d.ts`. Entry point: `src/index.ts` re-exportando tudo.

---

### `@devorama/react`

Hooks React reutilizáveis. Peer dep: `react >= 18`. Zero lógica de negócio — apenas primitivas de UI.

**Hooks** (`src/hooks/`):
- `useDebounce<T>(value, delay)` — adia a atualização de um valor
- `useLocalStorage<T>(key, initialValue)` — estado persistido no localStorage
- `usePrevious<T>(value)` — retorna o valor do render anterior
- `useBreakpoint()` — retorna o breakpoint ativo com base em `window.innerWidth`
- `useClickOutside(ref, handler)` — dispara callback ao clicar fora de um elemento

**Build:** mesmo padrão do `@devorama/utils`. Não inclui `react` no bundle (externalized).

---

### `@devorama/secrets`

CLI Node.js para sincronizar variáveis de ambiente com o AWS Parameter Store via `chamber`.

**Interface CLI:**

```bash
# Sobe variáveis do .env para o Parameter Store
devtools secrets push --env .env --service <service> --env-name <env>

# Baixa variáveis do Parameter Store e gera .env
devtools secrets pull --service <service> --env-name <env> --output .env

# Flags comuns
--dry-run     # mostra o que seria feito sem executar
--verbose     # exibe cada chave processada
```

**Implementação:**

- `push.ts`: lê o arquivo `.env` com `dotenv`, itera as entradas e executa `chamber write <service> <key> <value>` via `execa`
- `pull.ts`: executa `chamber env <service>` e serializa o stdout em formato `KEY=VALUE` para o arquivo de saída
- `cli.ts`: entry point com `commander` para parsing de argumentos, validação de pré-requisitos (binário `chamber` disponível no PATH, credenciais AWS presentes), e roteamento para `push`/`pull`

**Pré-requisitos detectados na inicialização:**
1. Binário `chamber` acessível no PATH — caso contrário, exibe mensagem de instalação
2. AWS credentials configuradas (`AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY`, ou perfil `~/.aws/credentials`) — caso contrário, orienta o usuário

**Dependências:** `commander`, `dotenv`, `execa`

**Build:** `tsup` com `--shims` para compatibilidade Node.js. O `package.json` expõe o bin `devtools`.

---

## Tooling

| Ferramenta | Uso |
|---|---|
| `pnpm` | gerenciador de pacotes + workspaces |
| `turbo` | orquestração de build/test/lint com cache |
| `tsup` | bundler por pacote (CJS + ESM + tipos) |
| `vitest` | testes unitários |
| `biome` | lint + format (substitui ESLint + Prettier) |
| `TypeScript` | `strict: true` em todos os pacotes |

**Pipeline Turbo (`turbo.json`):**

```json
{
  "pipeline": {
    "build": { "outputs": ["dist/**"], "dependsOn": ["^build"] },
    "test": { "dependsOn": ["build"] },
    "lint": {}
  }
}
```

O `^build` garante que `@devorama/react` só faz build após `@devorama/utils` (caso haja imports cruzados futuramente).

---

## Fluxo de consumo nos projetos devorama

```json
// package.json de um projeto consumidor (ex: audyto)
{
  "dependencies": {
    "@devorama/utils": "workspace:*",
    "@devorama/react": "workspace:*"
  }
}
```

Instalado via `pnpm install` na raiz do monorepo consumidor ou via `npm link` em projetos standalone.

---

## Testes

Cada pacote tem seu próprio `vitest.config.ts`. Cobertura mínima esperada:

- `@devorama/utils`: 100% dos formatadores e validadores (lógica crítica, pura)
- `@devorama/react`: testes com `@testing-library/react` para cada hook
- `@devorama/secrets`: testes com mocks do `execa` e do sistema de arquivos

---

## O que está fora do escopo (por ora)

- Publicação no GitHub Packages ou npm público
- CI/CD (GitHub Actions para testes automáticos)
- Componentes UI (shadcn, Radix) — apenas hooks, não componentes
- Integração com provedores de secrets além do AWS Parameter Store
