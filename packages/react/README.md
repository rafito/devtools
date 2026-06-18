# @devorama/react

[![npm version](https://img.shields.io/npm/v/@devorama/react.svg)](https://www.npmjs.com/package/@devorama/react)
[![npm downloads](https://img.shields.io/npm/dm/@devorama/react.svg)](https://www.npmjs.com/package/@devorama/react)
[![license](https://img.shields.io/npm/l/@devorama/react.svg)](https://github.com/rafito/devtools/blob/main/LICENSE)

A small set of **SSR-safe, fully typed React hooks** with zero runtime dependencies. Ships ESM + CJS + type declarations and is tree-shakeable (`sideEffects: false`).

## Install

```bash
npm install @devorama/react
# pnpm add @devorama/react · yarn add @devorama/react
```

> Requires **React 18+** (declared as a peer dependency).

## Hooks

```ts
import {
  useDebounce,
  usePrevious,
  useLocalStorage,
  useBreakpoint,
  useClickOutside,
} from '@devorama/react'
```

### `useDebounce<T>(value: T, delay: number): T`

Returns a debounced copy of `value` that only updates after `delay` ms of inactivity.

```ts
const debouncedSearch = useDebounce(searchTerm, 300)
// `debouncedSearch` updates 300ms after the last change to `searchTerm`
```

### `usePrevious<T>(value: T): T | undefined`

Returns the value from the previous render (`undefined` on first render).

```ts
const prevCount = usePrevious(count)
```

### `useLocalStorage<T>(key, initialValue): [T, setValue]`

A `useState`-compatible hook backed by `localStorage`. SSR-safe — falls back to `initialValue` when `window` is unavailable, and accepts an updater function.

```ts
const [theme, setTheme] = useLocalStorage('theme', 'light')
setTheme(prev => (prev === 'light' ? 'dark' : 'light'))
```

### `useBreakpoint(): Breakpoint`

Returns the current Tailwind-style breakpoint and updates on resize.

```ts
const bp = useBreakpoint()
// 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl'
// thresholds: sm 640 · md 768 · lg 1024 · xl 1280 · 2xl 1536
```

### `useClickOutside<T extends HTMLElement>(ref, handler): void`

Calls `handler` on any mouse/touch event outside the referenced element.

```ts
const ref = useRef<HTMLDivElement>(null)
useClickOutside(ref, () => setOpen(false))
```

## License

[MIT](./LICENSE) © Rafael D'Arrigo
