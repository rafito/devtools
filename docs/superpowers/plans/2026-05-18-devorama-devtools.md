# @devorama/devtools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffoldar o monorepo @devorama/devtools com três pacotes separados por runtime: `@devorama/utils` (formatadores, validadores e helpers puros), `@devorama/react` (hooks React) e `@devorama/secrets` (CLI Node.js para push/pull de `.env` via `chamber` + AWS Parameter Store).

**Architecture:** Monorepo pnpm workspaces + Turborepo com pipeline `build → test → lint`. Cada pacote usa `tsup` para gerar CJS + ESM + `.d.ts`. A separação `utils/react` vs `secrets` isola deps Node.js (AWS SDK, execa) do bundle browser.

**Tech Stack:** pnpm 9, turbo 2, tsup 8, TypeScript 5 (strict), vitest 2, biome 1.9, @testing-library/react 14, commander 12, dotenv 16, execa 9

---

## Mapa de arquivos

```
packages/utils/
  src/formatters/date.ts         → formatDate
  src/formatters/currency.ts     → formatCurrency
  src/formatters/document.ts     → formatCPF, formatCNPJ, formatPhone, formatCEP
  src/validators/cpf.ts          → isValidCPF
  src/validators/cnpj.ts         → isValidCNPJ
  src/validators/contact.ts      → isValidEmail, isValidPhone, isValidCEP
  src/helpers/array.ts           → groupBy, chunk
  src/helpers/object.ts          → pick, omit, deepMerge
  src/formatters/index.ts        → barrel
  src/validators/index.ts        → barrel
  src/helpers/index.ts           → barrel
  src/index.ts                   → barrel raiz

packages/react/
  src/hooks/useDebounce.ts
  src/hooks/usePrevious.ts
  src/hooks/useLocalStorage.ts
  src/hooks/useBreakpoint.ts
  src/hooks/useClickOutside.ts
  src/index.ts                   → barrel

packages/secrets/
  src/push.ts                    → função push (lê .env → chamber write)
  src/pull.ts                    → função pull (chamber env → escreve .env)
  src/cli.ts                     → entry point Commander + preflight checks
  src/index.ts                   → re-exporta push e pull para uso programático
```

---

## Task 1: Root monorepo scaffolding

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `turbo.json`
- Create: `tsconfig.base.json`
- Create: `biome.json`
- Create: `.gitignore`

- [ ] **Step 1: Instalar pnpm globalmente (se necessário)**

```bash
npm install -g pnpm@9
pnpm --version
```
Expected: `9.x.x`

- [ ] **Step 2: Criar `package.json` raiz**

```json
{
  "name": "devtools",
  "private": true,
  "scripts": {
    "build": "turbo build",
    "test": "turbo test",
    "lint": "biome check .",
    "format": "biome format --write ."
  },
  "devDependencies": {
    "@biomejs/biome": "^1.9.0",
    "turbo": "^2.3.0",
    "typescript": "^5.7.0"
  }
}
```

- [ ] **Step 3: Criar `pnpm-workspace.yaml`**

```yaml
packages:
  - 'packages/*'
```

- [ ] **Step 4: Criar `turbo.json`**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "outputs": ["dist/**"],
      "dependsOn": ["^build"]
    },
    "test": {
      "dependsOn": ["build"]
    },
    "lint": {}
  }
}
```

- [ ] **Step 5: Criar `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "lib": ["ES2020", "DOM"]
  }
}
```

- [ ] **Step 6: Criar `biome.json`**

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.0/schema.json",
  "organizeImports": { "enabled": true },
  "linter": {
    "enabled": true,
    "rules": { "recommended": true }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "single",
      "trailingCommas": "es5",
      "semicolons": "asNeeded"
    }
  }
}
```

- [ ] **Step 7: Criar `.gitignore`**

```
node_modules/
dist/
.turbo/
*.log
.env
.env.*
!.env.example
```

- [ ] **Step 8: Instalar dependências raiz**

```bash
pnpm install
```
Expected: `node_modules/` criado na raiz, sem erros.

- [ ] **Step 9: Commit**

```bash
git add package.json pnpm-workspace.yaml turbo.json tsconfig.base.json biome.json .gitignore
git commit -m "chore: scaffold monorepo root (pnpm + turbo + biome)"
```

---

## Task 2: @devorama/utils — scaffolding

**Files:**
- Create: `packages/utils/package.json`
- Create: `packages/utils/tsconfig.json`
- Create: `packages/utils/tsup.config.ts`
- Create: `packages/utils/vitest.config.ts`
- Create: `packages/utils/src/index.ts`

- [ ] **Step 1: Criar `packages/utils/package.json`**

```json
{
  "name": "@devorama/utils",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": {
      "import": "./dist/index.mjs",
      "require": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "main": "./dist/index.js",
  "module": "./dist/index.mjs",
  "types": "./dist/index.d.ts",
  "files": ["dist"],
  "scripts": {
    "build": "tsup",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "tsup": "^8.3.0",
    "typescript": "^5.7.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Criar `packages/utils/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Criar `packages/utils/tsup.config.ts`**

```typescript
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  sourcemap: true,
})
```

- [ ] **Step 4: Criar `packages/utils/vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
})
```

- [ ] **Step 5: Criar `packages/utils/src/index.ts` (skeleton)**

```typescript
export * from './formatters'
export * from './validators'
export * from './helpers'
```

- [ ] **Step 6: Instalar deps do pacote**

```bash
pnpm --filter @devorama/utils install
```

- [ ] **Step 7: Commit**

```bash
git add packages/utils/
git commit -m "chore: scaffold @devorama/utils package"
```

---

## Task 3: Formatadores — data e moeda

**Files:**
- Create: `packages/utils/src/formatters/date.ts`
- Create: `packages/utils/src/formatters/currency.ts`
- Create: `packages/utils/src/formatters/__tests__/date.test.ts`
- Create: `packages/utils/src/formatters/__tests__/currency.test.ts`
- Create: `packages/utils/src/formatters/index.ts`

- [ ] **Step 1: Escrever o teste de `formatDate` (failing)**

Crie `packages/utils/src/formatters/__tests__/date.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { formatDate } from '../date'

describe('formatDate', () => {
  it('formata com o padrão dd/MM/yyyy', () => {
    expect(formatDate(new Date(2024, 0, 5))).toBe('05/01/2024')
  })

  it('formata com formato customizado', () => {
    expect(formatDate(new Date(2024, 11, 25), 'yyyy-MM-dd')).toBe('2024-12-25')
  })

  it('aceita string como input', () => {
    expect(formatDate('2024-06-15T03:00:00.000Z')).toMatch(/15\/06\/2024/)
  })

  it('aceita timestamp como input', () => {
    const ts = new Date(2024, 2, 1).getTime()
    expect(formatDate(ts)).toBe('01/03/2024')
  })

  it('formata com hora', () => {
    expect(formatDate(new Date(2024, 0, 5, 14, 30, 0), 'dd/MM/yyyy HH:mm')).toBe('05/01/2024 14:30')
  })
})
```

- [ ] **Step 2: Rodar o teste para confirmar que falha**

```bash
pnpm --filter @devorama/utils test
```
Expected: FAIL com "Cannot find module '../date'"

- [ ] **Step 3: Implementar `packages/utils/src/formatters/date.ts`**

```typescript
export function formatDate(date: Date | string | number, format = 'dd/MM/yyyy'): string {
  const d = date instanceof Date ? date : new Date(date)
  const pad = (n: number) => String(n).padStart(2, '0')
  return format
    .replace('yyyy', String(d.getFullYear()))
    .replace('MM', pad(d.getMonth() + 1))
    .replace('dd', pad(d.getDate()))
    .replace('HH', pad(d.getHours()))
    .replace('mm', pad(d.getMinutes()))
    .replace('ss', pad(d.getSeconds()))
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

```bash
pnpm --filter @devorama/utils test
```
Expected: PASS para todos os testes de `date.test.ts`

- [ ] **Step 5: Escrever o teste de `formatCurrency` (failing)**

Crie `packages/utils/src/formatters/__tests__/currency.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { formatCurrency } from '../currency'

describe('formatCurrency', () => {
  it('formata em BRL por padrão', () => {
    expect(formatCurrency(1234.56)).toBe('R$ 1.234,56')
  })

  it('formata em USD', () => {
    expect(formatCurrency(1234.56, 'USD')).toContain('1,234.56')
  })

  it('formata zero', () => {
    expect(formatCurrency(0)).toBe('R$ 0,00')
  })

  it('formata valor negativo', () => {
    expect(formatCurrency(-500)).toContain('500')
  })
})
```

- [ ] **Step 6: Implementar `packages/utils/src/formatters/currency.ts`**

```typescript
export function formatCurrency(value: number, currency = 'BRL'): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}
```

- [ ] **Step 7: Criar `packages/utils/src/formatters/index.ts`**

```typescript
export * from './date'
export * from './currency'
```

- [ ] **Step 8: Rodar todos os testes**

```bash
pnpm --filter @devorama/utils test
```
Expected: PASS para `date.test.ts` e `currency.test.ts`

- [ ] **Step 9: Commit**

```bash
git add packages/utils/src/formatters/
git commit -m "feat(utils): add formatDate and formatCurrency"
```

---

## Task 4: Formatadores — CPF, CNPJ, telefone e CEP

**Files:**
- Create: `packages/utils/src/formatters/document.ts`
- Create: `packages/utils/src/formatters/__tests__/document.test.ts`

- [ ] **Step 1: Escrever os testes (failing)**

Crie `packages/utils/src/formatters/__tests__/document.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { formatCEP, formatCNPJ, formatCPF, formatPhone } from '../document'

describe('formatCPF', () => {
  it('formata CPF completo', () => {
    expect(formatCPF('12345678901')).toBe('123.456.789-01')
  })
  it('formata CPF já formatado (idempotente)', () => {
    expect(formatCPF('123.456.789-01')).toBe('123.456.789-01')
  })
  it('trunca na 11ª dígito', () => {
    expect(formatCPF('123456789012')).toBe('123.456.789-01')
  })
})

describe('formatCNPJ', () => {
  it('formata CNPJ completo', () => {
    expect(formatCNPJ('11222333000181')).toBe('11.222.333/0001-81')
  })
  it('formata CNPJ já formatado', () => {
    expect(formatCNPJ('11.222.333/0001-81')).toBe('11.222.333/0001-81')
  })
})

describe('formatPhone', () => {
  it('formata celular com 11 dígitos', () => {
    expect(formatPhone('51987654321')).toBe('(51) 98765-4321')
  })
  it('formata fixo com 10 dígitos', () => {
    expect(formatPhone('5132345678')).toBe('(51) 3234-5678')
  })
})

describe('formatCEP', () => {
  it('formata CEP com 8 dígitos', () => {
    expect(formatCEP('90010000')).toBe('90010-000')
  })
  it('formata CEP já formatado', () => {
    expect(formatCEP('90010-000')).toBe('90010-000')
  })
})
```

- [ ] **Step 2: Rodar para confirmar que falha**

```bash
pnpm --filter @devorama/utils test
```
Expected: FAIL com "Cannot find module '../document'"

- [ ] **Step 3: Implementar `packages/utils/src/formatters/document.ts`**

```typescript
export function formatCPF(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 11)
  return d
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
}

export function formatCNPJ(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 14)
  return d
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2')
}

export function formatPhone(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 10) {
    return d
      .replace(/(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{4})(\d{1,4})$/, '$1-$2')
  }
  return d
    .replace(/(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{5})(\d{1,4})$/, '$1-$2')
}

export function formatCEP(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 8)
  return d.replace(/(\d{5})(\d{1,3})$/, '$1-$2')
}
```

- [ ] **Step 4: Adicionar exports ao `packages/utils/src/formatters/index.ts`**

```typescript
export * from './date'
export * from './currency'
export * from './document'
```

- [ ] **Step 5: Rodar os testes**

```bash
pnpm --filter @devorama/utils test
```
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/utils/src/formatters/
git commit -m "feat(utils): add formatCPF, formatCNPJ, formatPhone, formatCEP"
```

---

## Task 5: Validadores — CPF e CNPJ

**Files:**
- Create: `packages/utils/src/validators/cpf.ts`
- Create: `packages/utils/src/validators/cnpj.ts`
- Create: `packages/utils/src/validators/__tests__/cpf.test.ts`
- Create: `packages/utils/src/validators/__tests__/cnpj.test.ts`
- Create: `packages/utils/src/validators/index.ts`

- [ ] **Step 1: Escrever testes de CPF (failing)**

Crie `packages/utils/src/validators/__tests__/cpf.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { isValidCPF } from '../cpf'

describe('isValidCPF', () => {
  it('valida CPF correto sem máscara', () => {
    expect(isValidCPF('11144477735')).toBe(true)
  })
  it('valida CPF correto com máscara', () => {
    expect(isValidCPF('111.444.777-35')).toBe(true)
  })
  it('rejeita CPF com dígito verificador errado', () => {
    expect(isValidCPF('11144477736')).toBe(false)
  })
  it('rejeita CPF com todos os dígitos iguais', () => {
    expect(isValidCPF('11111111111')).toBe(false)
  })
  it('rejeita string vazia', () => {
    expect(isValidCPF('')).toBe(false)
  })
  it('rejeita CPF com tamanho incorreto', () => {
    expect(isValidCPF('1234567890')).toBe(false)
  })
})
```

- [ ] **Step 2: Rodar para confirmar que falha**

```bash
pnpm --filter @devorama/utils test
```
Expected: FAIL

- [ ] **Step 3: Implementar `packages/utils/src/validators/cpf.ts`**

O algoritmo calcula os dois dígitos verificadores pelos pesos decrescentes a partir de 10 e 11.

```typescript
export function isValidCPF(value: string): boolean {
  const digits = value.replace(/\D/g, '')
  if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) return false

  const calcDigit = (cpf: string, factor: number): number => {
    let sum = 0
    for (let i = 0; i < factor - 1; i++) {
      sum += parseInt(cpf[i]) * (factor - i)
    }
    const remainder = (sum * 10) % 11
    return remainder >= 10 ? 0 : remainder
  }

  return (
    calcDigit(digits, 10) === parseInt(digits[9]) &&
    calcDigit(digits, 11) === parseInt(digits[10])
  )
}
```

- [ ] **Step 4: Escrever testes de CNPJ (failing)**

Crie `packages/utils/src/validators/__tests__/cnpj.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { isValidCNPJ } from '../cnpj'

describe('isValidCNPJ', () => {
  it('valida CNPJ correto sem máscara', () => {
    expect(isValidCNPJ('11222333000181')).toBe(true)
  })
  it('valida CNPJ correto com máscara', () => {
    expect(isValidCNPJ('11.222.333/0001-81')).toBe(true)
  })
  it('rejeita CNPJ com dígito verificador errado', () => {
    expect(isValidCNPJ('11222333000182')).toBe(false)
  })
  it('rejeita CNPJ com todos os dígitos iguais', () => {
    expect(isValidCNPJ('00000000000000')).toBe(false)
  })
  it('rejeita tamanho incorreto', () => {
    expect(isValidCNPJ('1122233300018')).toBe(false)
  })
})
```

- [ ] **Step 5: Implementar `packages/utils/src/validators/cnpj.ts`**

```typescript
export function isValidCNPJ(value: string): boolean {
  const digits = value.replace(/\D/g, '')
  if (digits.length !== 14 || /^(\d)\1{13}$/.test(digits)) return false

  const calcDigit = (cnpj: string, weights: number[]): number => {
    let sum = 0
    for (let i = 0; i < weights.length; i++) {
      sum += parseInt(cnpj[i]) * weights[i]
    }
    const remainder = sum % 11
    return remainder < 2 ? 0 : 11 - remainder
  }

  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]

  return (
    calcDigit(digits, w1) === parseInt(digits[12]) &&
    calcDigit(digits, w2) === parseInt(digits[13])
  )
}
```

- [ ] **Step 6: Criar `packages/utils/src/validators/index.ts`**

```typescript
export * from './cpf'
export * from './cnpj'
```

- [ ] **Step 7: Rodar os testes**

```bash
pnpm --filter @devorama/utils test
```
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add packages/utils/src/validators/
git commit -m "feat(utils): add isValidCPF and isValidCNPJ validators"
```

---

## Task 6: Validadores — email, telefone e CEP

**Files:**
- Create: `packages/utils/src/validators/contact.ts`
- Create: `packages/utils/src/validators/__tests__/contact.test.ts`

- [ ] **Step 1: Escrever os testes (failing)**

Crie `packages/utils/src/validators/__tests__/contact.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { isValidCEP, isValidEmail, isValidPhone } from '../contact'

describe('isValidEmail', () => {
  it('valida email simples', () => {
    expect(isValidEmail('user@example.com')).toBe(true)
  })
  it('valida email com subdomínio', () => {
    expect(isValidEmail('user@mail.example.com.br')).toBe(true)
  })
  it('rejeita sem @', () => {
    expect(isValidEmail('userexample.com')).toBe(false)
  })
  it('rejeita sem domínio', () => {
    expect(isValidEmail('user@')).toBe(false)
  })
  it('rejeita string vazia', () => {
    expect(isValidEmail('')).toBe(false)
  })
})

describe('isValidPhone', () => {
  it('valida celular com 11 dígitos', () => {
    expect(isValidPhone('51987654321')).toBe(true)
  })
  it('valida fixo com 10 dígitos', () => {
    expect(isValidPhone('5132345678')).toBe(true)
  })
  it('valida com máscara', () => {
    expect(isValidPhone('(51) 98765-4321')).toBe(true)
  })
  it('rejeita com menos de 10 dígitos', () => {
    expect(isValidPhone('519876543')).toBe(false)
  })
  it('rejeita com mais de 11 dígitos', () => {
    expect(isValidPhone('519876543210')).toBe(false)
  })
})

describe('isValidCEP', () => {
  it('valida CEP com 8 dígitos', () => {
    expect(isValidCEP('90010000')).toBe(true)
  })
  it('valida CEP com máscara', () => {
    expect(isValidCEP('90010-000')).toBe(true)
  })
  it('rejeita com 7 dígitos', () => {
    expect(isValidCEP('9001000')).toBe(false)
  })
})
```

- [ ] **Step 2: Implementar `packages/utils/src/validators/contact.ts`**

```typescript
export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

export function isValidPhone(value: string): boolean {
  const digits = value.replace(/\D/g, '')
  return digits.length === 10 || digits.length === 11
}

export function isValidCEP(value: string): boolean {
  return value.replace(/\D/g, '').length === 8
}
```

- [ ] **Step 3: Adicionar export ao `packages/utils/src/validators/index.ts`**

```typescript
export * from './cpf'
export * from './cnpj'
export * from './contact'
```

- [ ] **Step 4: Rodar os testes**

```bash
pnpm --filter @devorama/utils test
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/utils/src/validators/
git commit -m "feat(utils): add isValidEmail, isValidPhone, isValidCEP"
```

---

## Task 7: Helpers — array (groupBy, chunk)

**Files:**
- Create: `packages/utils/src/helpers/array.ts`
- Create: `packages/utils/src/helpers/__tests__/array.test.ts`
- Create: `packages/utils/src/helpers/index.ts`

- [ ] **Step 1: Escrever os testes (failing)**

Crie `packages/utils/src/helpers/__tests__/array.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { chunk, groupBy } from '../array'

describe('groupBy', () => {
  it('agrupa por chave derivada', () => {
    const input = [
      { name: 'Alice', role: 'admin' },
      { name: 'Bob', role: 'user' },
      { name: 'Carol', role: 'admin' },
    ]
    expect(groupBy(input, (i) => i.role)).toEqual({
      admin: [
        { name: 'Alice', role: 'admin' },
        { name: 'Carol', role: 'admin' },
      ],
      user: [{ name: 'Bob', role: 'user' }],
    })
  })

  it('retorna objeto vazio para array vazio', () => {
    expect(groupBy([], (i: string) => i)).toEqual({})
  })
})

describe('chunk', () => {
  it('divide array em pedaços de tamanho fixo', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })

  it('retorna array com um grupo se size >= length', () => {
    expect(chunk([1, 2, 3], 5)).toEqual([[1, 2, 3]])
  })

  it('retorna array vazio para input vazio', () => {
    expect(chunk([], 2)).toEqual([])
  })
})
```

- [ ] **Step 2: Implementar `packages/utils/src/helpers/array.ts`**

```typescript
export function groupBy<T>(array: T[], keyFn: (item: T) => string): Record<string, T[]> {
  return array.reduce(
    (acc, item) => {
      const key = keyFn(item)
      return { ...acc, [key]: [...(acc[key] ?? []), item] }
    },
    {} as Record<string, T[]>,
  )
}

export function chunk<T>(array: T[], size: number): T[][] {
  const result: T[][] = []
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size))
  }
  return result
}
```

- [ ] **Step 3: Criar `packages/utils/src/helpers/index.ts`**

```typescript
export * from './array'
```

- [ ] **Step 4: Rodar os testes**

```bash
pnpm --filter @devorama/utils test
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/utils/src/helpers/
git commit -m "feat(utils): add groupBy and chunk helpers"
```

---

## Task 8: Helpers — object (pick, omit, deepMerge)

**Files:**
- Create: `packages/utils/src/helpers/object.ts`
- Create: `packages/utils/src/helpers/__tests__/object.test.ts`

- [ ] **Step 1: Escrever os testes (failing)**

Crie `packages/utils/src/helpers/__tests__/object.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { deepMerge, omit, pick } from '../object'

describe('pick', () => {
  it('retorna apenas as chaves selecionadas', () => {
    expect(pick({ a: 1, b: 2, c: 3 }, ['a', 'c'])).toEqual({ a: 1, c: 3 })
  })
  it('não inclui chaves ausentes', () => {
    const result = pick({ a: 1 }, ['a', 'b' as keyof { a: number }])
    expect(result).toEqual({ a: 1 })
  })
})

describe('omit', () => {
  it('remove as chaves listadas', () => {
    expect(omit({ a: 1, b: 2, c: 3 }, ['b'])).toEqual({ a: 1, c: 3 })
  })
  it('retorna clone se nenhuma chave for removida', () => {
    const obj = { a: 1 }
    const result = omit(obj, [])
    expect(result).toEqual({ a: 1 })
    expect(result).not.toBe(obj)
  })
})

describe('deepMerge', () => {
  it('faz merge de objetos simples', () => {
    expect(deepMerge({ a: 1, b: 2 }, { b: 3 })).toEqual({ a: 1, b: 3 })
  })
  it('faz merge recursivo de objetos aninhados', () => {
    expect(deepMerge({ a: { x: 1, y: 2 } }, { a: { y: 99 } })).toEqual({
      a: { x: 1, y: 99 },
    })
  })
  it('sobrescreve com array (não faz merge de arrays)', () => {
    expect(deepMerge({ a: [1, 2] }, { a: [3] })).toEqual({ a: [3] })
  })
})
```

- [ ] **Step 2: Implementar `packages/utils/src/helpers/object.ts`**

```typescript
export function pick<T extends object, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> {
  return keys.reduce(
    (acc, key) => (key in obj ? { ...acc, [key]: obj[key] } : acc),
    {} as Pick<T, K>,
  )
}

export function omit<T extends object, K extends keyof T>(obj: T, keys: K[]): Omit<T, K> {
  const result = { ...obj }
  for (const key of keys) {
    delete result[key]
  }
  return result as Omit<T, K>
}

export function deepMerge<T extends object>(target: T, source: Partial<T>): T {
  const result = { ...target }
  for (const key in source) {
    const sourceVal = source[key]
    const targetVal = target[key]
    if (
      sourceVal !== null &&
      typeof sourceVal === 'object' &&
      !Array.isArray(sourceVal) &&
      targetVal !== null &&
      typeof targetVal === 'object' &&
      !Array.isArray(targetVal)
    ) {
      result[key] = deepMerge(targetVal as object, sourceVal as object) as T[typeof key]
    } else if (sourceVal !== undefined) {
      result[key] = sourceVal as T[typeof key]
    }
  }
  return result
}
```

- [ ] **Step 3: Adicionar export ao `packages/utils/src/helpers/index.ts`**

```typescript
export * from './array'
export * from './object'
```

- [ ] **Step 4: Rodar todos os testes do pacote**

```bash
pnpm --filter @devorama/utils test
```
Expected: PASS (todos os testes de formatters, validators e helpers)

- [ ] **Step 5: Commit**

```bash
git add packages/utils/src/helpers/
git commit -m "feat(utils): add pick, omit and deepMerge helpers"
```

---

## Task 9: @devorama/utils — barrel + build

**Files:**
- Modify: `packages/utils/src/index.ts`

- [ ] **Step 1: Confirmar que `src/index.ts` re-exporta tudo**

O arquivo já foi criado no Task 2. Confirme que está assim:

```typescript
export * from './formatters'
export * from './validators'
export * from './helpers'
```

- [ ] **Step 2: Rodar o build**

```bash
pnpm --filter @devorama/utils build
```
Expected: `packages/utils/dist/` criado com `index.js`, `index.mjs`, `index.d.ts`

- [ ] **Step 3: Verificar os artefatos**

```bash
ls packages/utils/dist/
```
Expected: `index.js  index.mjs  index.d.ts  index.js.map  index.mjs.map`

- [ ] **Step 4: Commit**

```bash
git add packages/utils/
git commit -m "feat(utils): complete @devorama/utils package"
```

---

## Task 10: @devorama/react — scaffolding

**Files:**
- Create: `packages/react/package.json`
- Create: `packages/react/tsconfig.json`
- Create: `packages/react/tsup.config.ts`
- Create: `packages/react/vitest.config.ts`
- Create: `packages/react/src/index.ts`

- [ ] **Step 1: Criar `packages/react/package.json`**

```json
{
  "name": "@devorama/react",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": {
      "import": "./dist/index.mjs",
      "require": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "main": "./dist/index.js",
  "module": "./dist/index.mjs",
  "types": "./dist/index.d.ts",
  "files": ["dist"],
  "scripts": {
    "build": "tsup",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "peerDependencies": {
    "react": ">=18.0.0"
  },
  "devDependencies": {
    "@testing-library/react": "^14.3.0",
    "@types/react": "^18.3.0",
    "jsdom": "^25.0.0",
    "react": "^18.3.0",
    "tsup": "^8.3.0",
    "typescript": "^5.7.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Criar `packages/react/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "jsx": "react-jsx"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Criar `packages/react/tsup.config.ts`**

```typescript
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  external: ['react'],
})
```

- [ ] **Step 4: Criar `packages/react/vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
  },
})
```

- [ ] **Step 5: Criar `packages/react/src/index.ts` (skeleton)**

```typescript
export * from './hooks/useDebounce'
export * from './hooks/usePrevious'
export * from './hooks/useLocalStorage'
export * from './hooks/useBreakpoint'
export * from './hooks/useClickOutside'
```

- [ ] **Step 6: Instalar deps**

```bash
pnpm --filter @devorama/react install
```

- [ ] **Step 7: Commit**

```bash
git add packages/react/
git commit -m "chore: scaffold @devorama/react package"
```

---

## Task 11: Hooks — useDebounce e usePrevious

**Files:**
- Create: `packages/react/src/hooks/useDebounce.ts`
- Create: `packages/react/src/hooks/usePrevious.ts`
- Create: `packages/react/src/hooks/__tests__/useDebounce.test.ts`
- Create: `packages/react/src/hooks/__tests__/usePrevious.test.ts`

- [ ] **Step 1: Escrever teste de useDebounce (failing)**

Crie `packages/react/src/hooks/__tests__/useDebounce.test.ts`:

```typescript
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDebounce } from '../useDebounce'

describe('useDebounce', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('retorna o valor inicial imediatamente', () => {
    const { result } = renderHook(() => useDebounce('initial', 300))
    expect(result.current).toBe('initial')
  })

  it('não atualiza o valor antes do delay', () => {
    const { result, rerender } = renderHook(
      ({ value }: { value: string }) => useDebounce(value, 300),
      { initialProps: { value: 'initial' } },
    )
    rerender({ value: 'updated' })
    expect(result.current).toBe('initial')
  })

  it('atualiza o valor após o delay', () => {
    const { result, rerender } = renderHook(
      ({ value }: { value: string }) => useDebounce(value, 300),
      { initialProps: { value: 'initial' } },
    )
    rerender({ value: 'updated' })
    act(() => { vi.advanceTimersByTime(300) })
    expect(result.current).toBe('updated')
  })

  it('reinicia o timer se o valor mudar novamente antes do delay', () => {
    const { result, rerender } = renderHook(
      ({ value }: { value: string }) => useDebounce(value, 300),
      { initialProps: { value: 'a' } },
    )
    rerender({ value: 'b' })
    act(() => { vi.advanceTimersByTime(200) })
    rerender({ value: 'c' })
    act(() => { vi.advanceTimersByTime(200) })
    expect(result.current).toBe('a')
    act(() => { vi.advanceTimersByTime(100) })
    expect(result.current).toBe('c')
  })
})
```

- [ ] **Step 2: Implementar `packages/react/src/hooks/useDebounce.ts`**

```typescript
import { useEffect, useState } from 'react'

export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debouncedValue
}
```

- [ ] **Step 3: Escrever teste de usePrevious (failing)**

Crie `packages/react/src/hooks/__tests__/usePrevious.test.ts`:

```typescript
import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { usePrevious } from '../usePrevious'

describe('usePrevious', () => {
  it('retorna undefined no primeiro render', () => {
    const { result } = renderHook(() => usePrevious('initial'))
    expect(result.current).toBeUndefined()
  })

  it('retorna o valor anterior após re-render', () => {
    const { result, rerender } = renderHook(
      ({ value }: { value: string }) => usePrevious(value),
      { initialProps: { value: 'first' } },
    )
    rerender({ value: 'second' })
    expect(result.current).toBe('first')
  })

  it('rastreia múltiplas atualizações', () => {
    const { result, rerender } = renderHook(
      ({ value }: { value: number }) => usePrevious(value),
      { initialProps: { value: 1 } },
    )
    rerender({ value: 2 })
    expect(result.current).toBe(1)
    rerender({ value: 3 })
    expect(result.current).toBe(2)
  })
})
```

- [ ] **Step 4: Implementar `packages/react/src/hooks/usePrevious.ts`**

```typescript
import { useEffect, useRef } from 'react'

export function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T | undefined>(undefined)
  useEffect(() => {
    ref.current = value
  })
  return ref.current
}
```

- [ ] **Step 5: Rodar os testes**

```bash
pnpm --filter @devorama/react test
```
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/react/src/hooks/useDebounce.ts packages/react/src/hooks/usePrevious.ts packages/react/src/hooks/__tests__/
git commit -m "feat(react): add useDebounce and usePrevious hooks"
```

---

## Task 12: Hook — useLocalStorage

**Files:**
- Create: `packages/react/src/hooks/useLocalStorage.ts`
- Create: `packages/react/src/hooks/__tests__/useLocalStorage.test.ts`

- [ ] **Step 1: Escrever o teste (failing)**

Crie `packages/react/src/hooks/__tests__/useLocalStorage.test.ts`:

```typescript
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useLocalStorage } from '../useLocalStorage'

describe('useLocalStorage', () => {
  afterEach(() => localStorage.clear())

  it('retorna o valor inicial quando não há nada no storage', () => {
    const { result } = renderHook(() => useLocalStorage('key', 'default'))
    expect(result.current[0]).toBe('default')
  })

  it('persiste o valor no localStorage', () => {
    const { result } = renderHook(() => useLocalStorage('key', 'default'))
    act(() => { result.current[1]('novo valor') })
    expect(result.current[0]).toBe('novo valor')
    expect(localStorage.getItem('key')).toBe('"novo valor"')
  })

  it('recupera o valor existente do localStorage', () => {
    localStorage.setItem('key', JSON.stringify('salvo'))
    const { result } = renderHook(() => useLocalStorage('key', 'default'))
    expect(result.current[0]).toBe('salvo')
  })

  it('aceita função updater', () => {
    const { result } = renderHook(() => useLocalStorage('count', 0))
    act(() => { result.current[1]((prev) => prev + 1) })
    expect(result.current[0]).toBe(1)
  })

  it('funciona com objetos', () => {
    const { result } = renderHook(() =>
      useLocalStorage<{ name: string }>('user', { name: '' }),
    )
    act(() => { result.current[1]({ name: 'Alice' }) })
    expect(result.current[0]).toEqual({ name: 'Alice' })
  })
})
```

- [ ] **Step 2: Implementar `packages/react/src/hooks/useLocalStorage.ts`**

```typescript
import { useState } from 'react'

export function useLocalStorage<T>(
  key: string,
  initialValue: T,
): [T, (value: T | ((val: T) => T)) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key)
      return item ? (JSON.parse(item) as T) : initialValue
    } catch {
      return initialValue
    }
  })

  const setValue = (value: T | ((val: T) => T)) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value
      setStoredValue(valueToStore)
      window.localStorage.setItem(key, JSON.stringify(valueToStore))
    } catch {
      // Silently fail on storage quota errors or private browsing restrictions
    }
  }

  return [storedValue, setValue]
}
```

- [ ] **Step 3: Rodar os testes**

```bash
pnpm --filter @devorama/react test
```
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/react/src/hooks/useLocalStorage.ts packages/react/src/hooks/__tests__/useLocalStorage.test.ts
git commit -m "feat(react): add useLocalStorage hook"
```

---

## Task 13: Hooks — useBreakpoint e useClickOutside

**Files:**
- Create: `packages/react/src/hooks/useBreakpoint.ts`
- Create: `packages/react/src/hooks/useClickOutside.ts`
- Create: `packages/react/src/hooks/__tests__/useBreakpoint.test.ts`
- Create: `packages/react/src/hooks/__tests__/useClickOutside.test.ts`

- [ ] **Step 1: Escrever teste de useBreakpoint (failing)**

Crie `packages/react/src/hooks/__tests__/useBreakpoint.test.ts`:

```typescript
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useBreakpoint } from '../useBreakpoint'

describe('useBreakpoint', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1024 })
  })

  it('retorna "lg" para 1024px', () => {
    const { result } = renderHook(() => useBreakpoint())
    expect(result.current).toBe('lg')
  })

  it('retorna "xs" para 320px', () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 320 })
    const { result } = renderHook(() => useBreakpoint())
    expect(result.current).toBe('xs')
  })

  it('atualiza ao redimensionar a janela', () => {
    const { result } = renderHook(() => useBreakpoint())
    act(() => {
      Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 768 })
      window.dispatchEvent(new Event('resize'))
    })
    expect(result.current).toBe('md')
  })
})
```

- [ ] **Step 2: Implementar `packages/react/src/hooks/useBreakpoint.ts`**

```typescript
import { useEffect, useState } from 'react'

const BREAKPOINTS = { sm: 640, md: 768, lg: 1024, xl: 1280, '2xl': 1536 } as const
type Breakpoint = keyof typeof BREAKPOINTS | 'xs'

function getBreakpoint(width: number): Breakpoint {
  if (width >= BREAKPOINTS['2xl']) return '2xl'
  if (width >= BREAKPOINTS.xl) return 'xl'
  if (width >= BREAKPOINTS.lg) return 'lg'
  if (width >= BREAKPOINTS.md) return 'md'
  if (width >= BREAKPOINTS.sm) return 'sm'
  return 'xs'
}

export function useBreakpoint(): Breakpoint {
  const [breakpoint, setBreakpoint] = useState<Breakpoint>(() =>
    typeof window !== 'undefined' ? getBreakpoint(window.innerWidth) : 'xs',
  )

  useEffect(() => {
    const handler = () => setBreakpoint(getBreakpoint(window.innerWidth))
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  return breakpoint
}
```

- [ ] **Step 3: Escrever teste de useClickOutside (failing)**

Crie `packages/react/src/hooks/__tests__/useClickOutside.test.ts`:

```typescript
import { fireEvent, render, screen } from '@testing-library/react'
import React, { useRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { useClickOutside } from '../useClickOutside'

function TestComponent({ onClickOutside }: { onClickOutside: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useClickOutside(ref, onClickOutside)
  return (
    <div>
      <div ref={ref} data-testid="inside">inside</div>
      <div data-testid="outside">outside</div>
    </div>
  )
}

describe('useClickOutside', () => {
  it('não dispara o handler ao clicar dentro', () => {
    const handler = vi.fn()
    render(<TestComponent onClickOutside={handler} />)
    fireEvent.mouseDown(screen.getByTestId('inside'))
    expect(handler).not.toHaveBeenCalled()
  })

  it('dispara o handler ao clicar fora', () => {
    const handler = vi.fn()
    render(<TestComponent onClickOutside={handler} />)
    fireEvent.mouseDown(screen.getByTestId('outside'))
    expect(handler).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 4: Implementar `packages/react/src/hooks/useClickOutside.ts`**

```typescript
import { type RefObject, useEffect } from 'react'

export function useClickOutside<T extends HTMLElement>(
  ref: RefObject<T>,
  handler: (event: MouseEvent | TouchEvent) => void,
): void {
  useEffect(() => {
    const listener = (event: MouseEvent | TouchEvent) => {
      if (!ref.current || ref.current.contains(event.target as Node)) return
      handler(event)
    }
    document.addEventListener('mousedown', listener)
    document.addEventListener('touchstart', listener)
    return () => {
      document.removeEventListener('mousedown', listener)
      document.removeEventListener('touchstart', listener)
    }
  }, [ref, handler])
}
```

- [ ] **Step 5: Rodar todos os testes do pacote**

```bash
pnpm --filter @devorama/react test
```
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/react/src/hooks/useBreakpoint.ts packages/react/src/hooks/useClickOutside.ts packages/react/src/hooks/__tests__/
git commit -m "feat(react): add useBreakpoint and useClickOutside hooks"
```

---

## Task 14: @devorama/react — barrel + build

- [ ] **Step 1: Confirmar que `src/index.ts` exporta todos os hooks**

O arquivo já foi criado no Task 10. Confirme:

```typescript
export * from './hooks/useDebounce'
export * from './hooks/usePrevious'
export * from './hooks/useLocalStorage'
export * from './hooks/useBreakpoint'
export * from './hooks/useClickOutside'
```

- [ ] **Step 2: Rodar o build**

```bash
pnpm --filter @devorama/react build
```
Expected: `packages/react/dist/` criado sem erros

- [ ] **Step 3: Commit**

```bash
git add packages/react/
git commit -m "feat(react): complete @devorama/react package"
```

---

## Task 15: @devorama/secrets — scaffolding

**Files:**
- Create: `packages/secrets/package.json`
- Create: `packages/secrets/tsconfig.json`
- Create: `packages/secrets/tsup.config.ts`
- Create: `packages/secrets/vitest.config.ts`
- Create: `packages/secrets/src/index.ts`

- [ ] **Step 1: Criar `packages/secrets/package.json`**

```json
{
  "name": "@devorama/secrets",
  "version": "0.1.0",
  "type": "module",
  "bin": {
    "devtools": "./dist/cli.js"
  },
  "exports": {
    ".": {
      "import": "./dist/index.mjs",
      "require": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "main": "./dist/index.js",
  "module": "./dist/index.mjs",
  "types": "./dist/index.d.ts",
  "files": ["dist"],
  "scripts": {
    "build": "tsup",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "commander": "^12.1.0",
    "dotenv": "^16.4.0",
    "execa": "^9.5.0"
  },
  "devDependencies": {
    "tsup": "^8.3.0",
    "typescript": "^5.7.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Criar `packages/secrets/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Criar `packages/secrets/tsup.config.ts`**

```typescript
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/cli.ts', 'src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  shims: true,
})
```

- [ ] **Step 4: Criar `packages/secrets/vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
})
```

- [ ] **Step 5: Instalar deps**

```bash
pnpm --filter @devorama/secrets install
```

- [ ] **Step 6: Commit**

```bash
git add packages/secrets/
git commit -m "chore: scaffold @devorama/secrets package"
```

---

## Task 16: Secrets — comando push

**Files:**
- Create: `packages/secrets/src/push.ts`
- Create: `packages/secrets/src/__tests__/push.test.ts`

- [ ] **Step 1: Escrever o teste (failing)**

Crie `packages/secrets/src/__tests__/push.test.ts`:

```typescript
import { describe, expect, it, vi } from 'vitest'

vi.mock('node:fs', () => ({
  readFileSync: vi.fn().mockReturnValue('KEY1=value1\nKEY2=value2\n# comentário\n\nKEY3=value3\n'),
}))

vi.mock('execa', () => ({
  execa: vi.fn().mockResolvedValue({ stdout: '', stderr: '' }),
}))

import { execa } from 'execa'
import { push } from '../push'

describe('push', () => {
  it('chama chamber write para cada variável do .env', async () => {
    await push({ envFile: '.env', service: 'app', envName: 'staging' })
    expect(execa).toHaveBeenCalledWith('chamber', ['write', 'app/staging', 'KEY1', 'value1'])
    expect(execa).toHaveBeenCalledWith('chamber', ['write', 'app/staging', 'KEY2', 'value2'])
    expect(execa).toHaveBeenCalledWith('chamber', ['write', 'app/staging', 'KEY3', 'value3'])
  })

  it('ignora comentários e linhas em branco', async () => {
    vi.mocked(execa).mockClear()
    await push({ envFile: '.env', service: 'app', envName: 'staging' })
    expect(execa).toHaveBeenCalledTimes(3)
  })

  it('não chama o chamber em dry-run', async () => {
    vi.mocked(execa).mockClear()
    await push({ envFile: '.env', service: 'app', envName: 'staging', dryRun: true })
    expect(execa).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Rodar para confirmar que falha**

```bash
pnpm --filter @devorama/secrets test
```
Expected: FAIL com "Cannot find module '../push'"

- [ ] **Step 3: Implementar `packages/secrets/src/push.ts`**

```typescript
import { readFileSync } from 'node:fs'
import { execa } from 'execa'

export interface PushOptions {
  envFile: string
  service: string
  envName: string
  dryRun?: boolean
  verbose?: boolean
}

function parseEnvContent(content: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx === -1) continue
    const key = trimmed.slice(0, idx).trim()
    const raw = trimmed.slice(idx + 1).trim()
    result[key] = raw.replace(/^["']|["']$/g, '')
  }
  return result
}

export async function push(options: PushOptions): Promise<void> {
  const { envFile, service, envName, dryRun = false, verbose = false } = options
  const content = readFileSync(envFile, 'utf-8')
  const entries = Object.entries(parseEnvContent(content))

  if (verbose) console.log(`Found ${entries.length} variables in ${envFile}`)

  for (const [key, value] of entries) {
    if (verbose) console.log(`  ${dryRun ? '[dry-run] ' : ''}${key}`)
    if (!dryRun) {
      await execa('chamber', ['write', `${service}/${envName}`, key, value])
    }
  }

  console.log(`✓ ${dryRun ? '[dry-run] ' : ''}Pushed ${entries.length} variables to ${service}/${envName}`)
}
```

- [ ] **Step 4: Rodar os testes**

```bash
pnpm --filter @devorama/secrets test
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/secrets/src/push.ts packages/secrets/src/__tests__/push.test.ts
git commit -m "feat(secrets): add push command"
```

---

## Task 17: Secrets — comando pull

**Files:**
- Create: `packages/secrets/src/pull.ts`
- Create: `packages/secrets/src/__tests__/pull.test.ts`

- [ ] **Step 1: Escrever o teste (failing)**

Crie `packages/secrets/src/__tests__/pull.test.ts`:

```typescript
import { describe, expect, it, vi } from 'vitest'

vi.mock('node:fs', () => ({
  writeFileSync: vi.fn(),
}))

vi.mock('execa', () => ({
  execa: vi.fn().mockResolvedValue({
    stdout: 'KEY1=value1\nKEY2=value2\n',
    stderr: '',
  }),
}))

import { writeFileSync } from 'node:fs'
import { execa } from 'execa'
import { pull } from '../pull'

describe('pull', () => {
  it('chama chamber env com o service correto', async () => {
    await pull({ service: 'app', envName: 'staging', output: '.env.staging' })
    expect(execa).toHaveBeenCalledWith('chamber', ['env', 'app/staging'])
  })

  it('escreve o output do chamber no arquivo de destino', async () => {
    await pull({ service: 'app', envName: 'staging', output: '.env.staging' })
    expect(writeFileSync).toHaveBeenCalledWith('.env.staging', 'KEY1=value1\nKEY2=value2\n', 'utf-8')
  })

  it('não escreve o arquivo em dry-run', async () => {
    vi.mocked(writeFileSync).mockClear()
    await pull({ service: 'app', envName: 'staging', output: '.env.staging', dryRun: true })
    expect(writeFileSync).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Implementar `packages/secrets/src/pull.ts`**

```typescript
import { writeFileSync } from 'node:fs'
import { execa } from 'execa'

export interface PullOptions {
  service: string
  envName: string
  output: string
  dryRun?: boolean
  verbose?: boolean
}

export async function pull(options: PullOptions): Promise<void> {
  const { service, envName, output, dryRun = false, verbose = false } = options

  const { stdout } = await execa('chamber', ['env', `${service}/${envName}`])

  if (verbose) console.log(`Retrieved variables from ${service}/${envName}`)

  if (dryRun) {
    console.log(`[dry-run] Would write to ${output}:\n${stdout}`)
    return
  }

  writeFileSync(output, stdout, 'utf-8')
  const count = stdout.split('\n').filter(Boolean).length
  console.log(`✓ Pulled ${count} variables to ${output}`)
}
```

- [ ] **Step 3: Rodar os testes**

```bash
pnpm --filter @devorama/secrets test
```
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/secrets/src/pull.ts packages/secrets/src/__tests__/pull.test.ts
git commit -m "feat(secrets): add pull command"
```

---

## Task 18: Secrets — CLI entry point e preflight checks

**Files:**
- Create: `packages/secrets/src/cli.ts`
- Create: `packages/secrets/src/index.ts`
- Create: `packages/secrets/src/__tests__/cli.test.ts`

- [ ] **Step 1: Escrever o teste dos preflight checks (failing)**

Crie `packages/secrets/src/__tests__/cli.test.ts`:

```typescript
import { describe, expect, it, vi } from 'vitest'

vi.mock('execa', () => ({
  execaSync: vi.fn(),
  execa: vi.fn(),
}))

vi.mock('../push', () => ({ push: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../pull', () => ({ pull: vi.fn().mockResolvedValue(undefined) }))

import { execaSync } from 'execa'
import { checkPreflight } from '../cli'

describe('checkPreflight', () => {
  it('não lança erro quando chamber está disponível e credentials existem', () => {
    vi.mocked(execaSync).mockReturnValue({ stdout: 'chamber version 2.0', stderr: '', exitCode: 0 } as any)
    process.env.AWS_ACCESS_KEY_ID = 'test'
    process.env.AWS_SECRET_ACCESS_KEY = 'test'
    expect(() => checkPreflight()).not.toThrow()
  })

  it('chama process.exit(1) quando chamber não está no PATH', () => {
    vi.mocked(execaSync).mockImplementation(() => { throw new Error('not found') })
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit') })
    expect(() => checkPreflight()).toThrow('exit')
    exitSpy.mockRestore()
  })
})
```

- [ ] **Step 2: Implementar `packages/secrets/src/cli.ts`**

`program.parse()` é guardado por um ESM main check para que o módulo possa ser importado nos testes sem executar o parser de argv do vitest.

```typescript
#!/usr/bin/env node
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Command } from 'commander'
import { execaSync } from 'execa'
import { pull } from './pull'
import { push } from './push'

export function checkPreflight(): void {
  try {
    execaSync('chamber', ['version'])
  } catch {
    console.error('Error: `chamber` binary not found in PATH.')
    console.error('Install: https://github.com/segmentio/chamber#installation')
    process.exit(1)
  }

  const hasCredentials =
    (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) ||
    Boolean(process.env.AWS_PROFILE) ||
    existsSync(`${process.env.HOME}/.aws/credentials`)

  if (!hasCredentials) {
    console.error('Error: AWS credentials not configured.')
    console.error(
      'Set AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY, or configure ~/.aws/credentials',
    )
    process.exit(1)
  }
}

const program = new Command()

program.name('devtools').description('Devorama developer tools CLI').version('0.1.0')

const secretsCmd = program.command('secrets').description('Manage secrets via AWS Parameter Store')

secretsCmd
  .command('push')
  .description('Push .env variables to AWS Parameter Store')
  .requiredOption('--env <file>', '.env file to push', '.env')
  .requiredOption('--service <name>', 'Chamber service name')
  .requiredOption('--env-name <name>', 'Environment name (e.g. staging, production)')
  .option('--dry-run', 'Show what would be pushed without writing', false)
  .option('--verbose', 'Log each key being processed', false)
  .action(async (opts) => {
    checkPreflight()
    await push({
      envFile: opts.env,
      service: opts.service,
      envName: opts.envName,
      dryRun: opts.dryRun,
      verbose: opts.verbose,
    })
  })

secretsCmd
  .command('pull')
  .description('Pull variables from AWS Parameter Store to a .env file')
  .requiredOption('--service <name>', 'Chamber service name')
  .requiredOption('--env-name <name>', 'Environment name (e.g. staging, production)')
  .option('--output <file>', 'Output .env file path', '.env')
  .option('--dry-run', 'Show what would be written without creating the file', false)
  .option('--verbose', 'Log details', false)
  .action(async (opts) => {
    checkPreflight()
    await pull({
      service: opts.service,
      envName: opts.envName,
      output: opts.output,
      dryRun: opts.dryRun,
      verbose: opts.verbose,
    })
  })

// Só executa o parse quando invocado diretamente (não ao ser importado em testes)
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  program.parse()
}
```

- [ ] **Step 3: Criar `packages/secrets/src/index.ts`**

```typescript
export { push } from './push'
export { pull } from './pull'
export type { PushOptions } from './push'
export type { PullOptions } from './pull'
```

- [ ] **Step 4: Rodar os testes**

```bash
pnpm --filter @devorama/secrets test
```
Expected: PASS

- [ ] **Step 5: Rodar o build**

```bash
pnpm --filter @devorama/secrets build
```
Expected: `packages/secrets/dist/` com `cli.js`, `index.js`, `index.mjs`, `index.d.ts`

- [ ] **Step 6: Confirmar que o shebang está presente no CLI compilado**

```bash
head -1 packages/secrets/dist/cli.js
```
Expected: `#!/usr/bin/env node`

- [ ] **Step 7: Commit**

```bash
git add packages/secrets/src/
git commit -m "feat(secrets): add CLI entry point with preflight checks"
```

---

## Task 19: Full monorepo build + verificação final

- [ ] **Step 1: Rodar build completo via turbo**

```bash
pnpm build
```
Expected: todos os três pacotes buildados sem erros, output do turbo mostrando cache hits/misses

- [ ] **Step 2: Rodar todos os testes via turbo**

```bash
pnpm test
```
Expected: PASS em todos os pacotes

- [ ] **Step 3: Rodar lint**

```bash
pnpm lint
```
Expected: sem erros de lint/format

- [ ] **Step 4: Verificar os artefatos dos três pacotes**

```bash
ls packages/utils/dist/ packages/react/dist/ packages/secrets/dist/
```
Expected: cada pasta contém `index.js`, `index.mjs`, `index.d.ts`

- [ ] **Step 5: Commit final**

```bash
git add .
git commit -m "chore: complete @devorama/devtools monorepo initial implementation"
```
