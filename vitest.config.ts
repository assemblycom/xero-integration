import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    // Resolve `@/*`, `@webhook/*`, etc. from tsconfig.json paths.
    tsconfigPaths: true,
    alias: {
      // `server-only` throws at import outside a React Server Component. The
      // src services import it everywhere, so point it at an empty stub in tests.
      'server-only': fileURLToPath(new URL('./test/stubs/server-only.ts', import.meta.url)),
    },
  },
  test: {
    name: 'integration',
    environment: 'node',
    include: ['test/integration/**/*.test.ts'],
    globalSetup: ['./test/integration/globalSetup.ts'],
    setupFiles: ['./test/integration/setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 120_000,
    // One worker so the container URL set in globalSetup is inherited and all
    // integration tests share a single DB container.
    pool: 'forks',
    // fileParallelism:false already forces maxWorkers to 1 in Vitest 4; set it
    // explicitly so the "single shared fork" guarantee is structural, not implied.
    maxWorkers: 1,
    // Disable parallel file execution so separate test files can't collide on
    // the shared test DB.
    fileParallelism: false,
    // Share module state (incl. the `@/db` connection singleton) across files.
    isolate: false,
    // isolate:false keeps vi.fn() call history across files; reset it between
    // tests so per-test call-count assertions aren't polluted by earlier tests.
    clearMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/db/migrations/**', 'src/components/**'],
    },
  },
})
