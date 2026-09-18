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
    // Reset vi.fn() call history between tests; inherited by both projects
    // (extends: true) so per-test call-count assertions stay isolated.
    clearMocks: true,
    // Coverage is shared across projects; run `pnpm test` to cover both.
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/db/migrations/**', 'src/components/**'],
    },
    projects: [
      {
        // Pure unit tests: no DB, no container. Run alone via `--project unit`.
        extends: true,
        test: {
          name: 'unit',
          environment: 'node',
          include: ['test/unit/**/*.test.ts'],
          // Loads .env.test so modules that validate env at import don't throw.
          setupFiles: ['./test/unit/setup.ts'],
          // Own group so it can differ from integration's single-worker settings.
          sequence: { groupOrder: 0 },
        },
      },
      {
        extends: true,
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
          // clearMocks (inherited from root) still resets call history between tests.
          isolate: false,
          // Runs after the unit group, so its single-worker container run is isolated.
          sequence: { groupOrder: 1 },
        },
      },
    ],
  },
})
