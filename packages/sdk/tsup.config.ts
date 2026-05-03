import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    cli: 'src/cli/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: false,
  treeshake: true,
  target: 'node18',
  outDir: 'dist',
  banner: ({ format, entry }) => {
    if (entry && String(entry).includes('cli')) {
      return { js: '#!/usr/bin/env node' }
    }
    return {}
  },
})
