# @devorama/utils

[![npm version](https://img.shields.io/npm/v/@devorama/utils.svg)](https://www.npmjs.com/package/@devorama/utils)
[![npm downloads](https://img.shields.io/npm/dm/@devorama/utils.svg)](https://www.npmjs.com/package/@devorama/utils)
[![license](https://img.shields.io/npm/l/@devorama/utils.svg)](https://github.com/rafito/devtools/blob/main/LICENSE)

Zero-dependency TypeScript utilities: Brazilian formatters & validators (CPF, CNPJ, CEP, phone), currency/date formatting, and typed array/object helpers. Runs in **Node.js and the browser**, ships ESM + CJS + type declarations, and is fully tree-shakeable (`sideEffects: false`).

## Install

```bash
npm install @devorama/utils
# pnpm add @devorama/utils · yarn add @devorama/utils
```

## Formatters

```ts
import { formatCurrency, formatDate, formatCPF, formatCNPJ, formatPhone, formatCEP } from '@devorama/utils'

formatCurrency(1990.5)          // 'R$ 1.990,50'  (BRL by default)
formatCurrency(1990.5, 'USD')   // '$1,990.50'

formatDate(new Date('2024-03-15'), 'dd/MM/yyyy')  // '15/03/2024'
formatDate('2024-03-15', 'yyyy-MM-dd')            // '2024-03-15'

formatCPF('12345678909')        // '123.456.789-09'
formatCNPJ('11222333000181')    // '11.222.333/0001-81'
formatPhone('11987654321')      // '(11) 98765-4321'
formatCEP('01310100')           // '01310-100'
```

## Validators

```ts
import { isValidCPF, isValidCNPJ, isValidEmail, isValidPhone, isValidCEP } from '@devorama/utils'

isValidCPF('529.982.247-25')       // true  (check-digit aware)
isValidCNPJ('11.222.333/0001-81')  // true  (check-digit aware)
isValidEmail('user@example.com')   // true
isValidPhone('(11) 98765-4321')    // true
isValidCEP('01310-100')            // true
```

## Array helpers

```ts
import { groupBy, chunk } from '@devorama/utils'

groupBy([{ role: 'admin', name: 'Ana' }, { role: 'user', name: 'Bob' }], x => x.role)
// { admin: [{ role: 'admin', name: 'Ana' }], user: [{ role: 'user', name: 'Bob' }] }

chunk([1, 2, 3, 4, 5], 2)
// [[1, 2], [3, 4], [5]]
```

## Object helpers

```ts
import { pick, omit, deepMerge } from '@devorama/utils'

pick({ a: 1, b: 2, c: 3 }, ['a', 'c'])   // { a: 1, c: 3 }
omit({ a: 1, b: 2, c: 3 }, ['b'])        // { a: 1, c: 3 }

deepMerge({ theme: { color: 'blue', size: 12 } }, { theme: { color: 'red' } })
// { theme: { color: 'red', size: 12 } }
```

`pick` and `omit` are fully type-safe — the return type narrows to the selected keys.

## API

| Function | Signature |
|----------|-----------|
| `formatCurrency` | `(value: number, currency?: string) => string` |
| `formatDate` | `(date: Date \| string \| number, format?: string) => string` |
| `formatCPF` / `formatCNPJ` / `formatPhone` / `formatCEP` | `(value: string) => string` |
| `isValidCPF` / `isValidCNPJ` / `isValidEmail` / `isValidPhone` / `isValidCEP` | `(value: string) => boolean` |
| `groupBy` | `<T>(array: T[], keyFn: (item: T) => string) => Record<string, T[]>` |
| `chunk` | `<T>(array: T[], size: number) => T[][]` |
| `pick` | `<T, K extends keyof T>(obj: T, keys: K[]) => Pick<T, K>` |
| `omit` | `<T, K extends keyof T>(obj: T, keys: K[]) => Omit<T, K>` |
| `deepMerge` | `<T>(target: T, source: Partial<T>) => T` |

## License

[MIT](./LICENSE) © Rafael D'Arrigo
