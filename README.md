# @devorama/devtools

Monorepo de ferramentas compartilhadas do ecossistema Devorama.

## Pacotes

| Pacote | Versão | Descrição |
|--------|--------|-----------|
| [`@devorama/utils`](./packages/utils) | 0.1.0 | Formatadores, validadores e helpers puros (zero dependências) |
| [`@devorama/react`](./packages/react) | 0.1.0 | Hooks React reutilizáveis |
| [`@devorama/secrets`](./packages/secrets) | 0.1.0 | CLI para push/pull de `.env` no AWS Parameter Store via `chamber` |

---

## Instalação

```bash
# Utilitários gerais
npm install @devorama/utils

# Hooks React
npm install @devorama/react

# CLI de secrets (geralmente como devDependency)
npm install -D @devorama/secrets
```

---

## @devorama/utils

Biblioteca de utilitários puros sem dependências externas. Funciona em Node.js e browser.

### Formatadores

```ts
import { formatCurrency, formatDate, formatCPF, formatCNPJ, formatPhone, formatCEP } from '@devorama/utils'

formatCurrency(1990.5, 'BRL')   // 'R$ 1.990,50'
formatCurrency(1990.5, 'USD')   // '$1,990.50'

formatDate(new Date('2024-03-15'), 'dd/MM/yyyy')  // '15/03/2024'
formatDate(new Date('2024-03-15'), 'yyyy-MM-dd')  // '2024-03-15'

formatCPF('12345678909')        // '123.456.789-09'
formatCNPJ('11222333000181')    // '11.222.333/0001-81'
formatPhone('11987654321')      // '(11) 98765-4321'
formatCEP('01310100')           // '01310-100'
```

### Validadores

```ts
import { isValidCPF, isValidCNPJ, isValidEmail, isValidPhone, isValidCEP } from '@devorama/utils'

isValidCPF('529.982.247-25')    // true
isValidCNPJ('11.222.333/0001-81') // true
isValidEmail('user@example.com') // true
isValidPhone('(11) 98765-4321') // true
isValidCEP('01310-100')         // true
```

### Helpers de array

```ts
import { groupBy, chunk } from '@devorama/utils'

groupBy([{ role: 'admin', name: 'Ana' }, { role: 'user', name: 'Bob' }], x => x.role)
// { admin: [{ role: 'admin', name: 'Ana' }], user: [{ role: 'user', name: 'Bob' }] }

chunk([1, 2, 3, 4, 5], 2)
// [[1, 2], [3, 4], [5]]
```

### Helpers de objeto

```ts
import { pick, omit, deepMerge } from '@devorama/utils'

pick({ a: 1, b: 2, c: 3 }, ['a', 'c'])   // { a: 1, c: 3 }
omit({ a: 1, b: 2, c: 3 }, ['b'])        // { a: 1, c: 3 }

deepMerge({ theme: { color: 'blue', size: 12 } }, { theme: { color: 'red' } })
// { theme: { color: 'red', size: 12 } }
```

---

## @devorama/react

Hooks React para uso em projetos com React 18+.

### Requisitos

```json
"peerDependencies": {
  "react": ">=18.0.0"
}
```

### Hooks disponíveis

```ts
import {
  useDebounce,
  usePrevious,
  useLocalStorage,
  useBreakpoint,
  useClickOutside,
} from '@devorama/react'
```

#### useDebounce

```ts
const debouncedSearch = useDebounce(searchTerm, 300)
// debouncedSearch só atualiza 300ms após a última mudança
```

#### usePrevious

```ts
const prevCount = usePrevious(count)
// retorna o valor de count do render anterior
```

#### useLocalStorage

```ts
const [theme, setTheme] = useLocalStorage('theme', 'light')
// persiste no localStorage; seguro para SSR
```

#### useBreakpoint

```ts
const breakpoint = useBreakpoint()
// 'sm' | 'md' | 'lg' | 'xl' | '2xl'
// baseado nos breakpoints padrão do Tailwind
```

#### useClickOutside

```ts
const ref = useRef<HTMLDivElement>(null)
useClickOutside(ref, () => setOpen(false))
// dispara callback ao clicar fora do elemento
```

---

## @devorama/secrets

CLI para sincronizar variáveis de ambiente com o AWS Parameter Store usando [`chamber`](https://github.com/segmentio/chamber).

### Pré-requisitos

- [`chamber`](https://github.com/segmentio/chamber#installation) instalado e no PATH
- Credenciais AWS configuradas (`AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY`, ou `~/.aws/credentials`)

### Uso

```bash
# Fazer push do .env para o Parameter Store
npx devtools push --service app/production --env .env

# Fazer pull do Parameter Store para um arquivo .env
npx devtools pull --service app/production --env .env.local

# Testar sem executar (dry-run)
npx devtools push --service app/staging --env .env --dry-run
npx devtools pull --service app/staging --env .env --dry-run
```

### Opções

| Flag | Padrão | Descrição |
|------|--------|-----------|
| `--service` | — | **Obrigatório.** Caminho do serviço no Parameter Store (ex: `app/production`) |
| `--env` | `.env` | Arquivo `.env` de origem (push) ou destino (pull) |
| `--dry-run` | `false` | Exibe o que seria feito sem executar |

### Formato do .env

O CLI suporta valores com `=`, comentários e linhas em branco:

```env
# Comentário ignorado
DATABASE_URL=postgresql://user:pass@host/db
JWT_SECRET=abc=def==
API_KEY="valor com aspas"
```

---

## Desenvolvimento

### Pré-requisitos

- Node.js 20+
- pnpm 9+
- [Turbo](https://turbo.build/) (instalado como devDependency)

### Setup

```bash
git clone https://github.com/devorama/devtools
cd devtools
pnpm install
```

### Comandos

```bash
pnpm build    # Build todos os pacotes (via Turbo)
pnpm test     # Testes de todos os pacotes
pnpm lint     # Lint com Biome
pnpm format   # Formatar com Biome
```

### Estrutura

```
devtools/
├── packages/
│   ├── utils/      # @devorama/utils
│   ├── react/      # @devorama/react
│   └── secrets/    # @devorama/secrets
├── turbo.json
├── pnpm-workspace.yaml
└── biome.json
```

---

## Publicação

```bash
# 1. Build
pnpm build

# 2. Autenticar no npm (primeira vez)
npm login

# 3. Publicar todos os pacotes
pnpm --filter './packages/*' publish --no-git-checks
```

Para lançar uma nova versão, atualize o `version` no `package.json` do pacote correspondente antes de publicar.

---

## Licença

MIT
