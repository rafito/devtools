import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/cli.ts', 'src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  shims: true,
  outExtension({ format }) {
    return { js: format === 'esm' ? '.mjs' : '.js' }
  },
})
