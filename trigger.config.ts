import { sentryEsbuildPlugin } from '@sentry/esbuild-plugin'
import * as Sentry from '@sentry/nextjs'
import { esbuildPlugin } from '@trigger.dev/build/extensions'
import { defineConfig } from '@trigger.dev/sdk/v3'
import dotenv from 'dotenv'
import { z } from 'zod'

dotenv.config()

const vercelEnv = process.env.VERCEL_ENV
const isProd = vercelEnv === 'production'
const project = z.string().min(1).parse(process.env.TRIGGER_PROJECT_ID)
const org = isProd ? z.string().min(1).parse(process.env.SENTRY_ORG) : ''
const sentryProject = isProd ? z.string().min(1).parse(process.env.SENTRY_PROJECT) : ''
const sentryAuthToken = isProd ? z.string().min(1).parse(process.env.SENTRY_AUTH_TOKEN) : ''
const dsn = isProd ? z.string().min(1).parse(process.env.NEXT_PUBLIC_SENTRY_DSN) : ''

export default defineConfig({
  project,
  runtime: 'node',
  logLevel: 'log',
  // The max compute seconds a task is allowed to run. If the task run exceeds this duration, it will be stopped.
  // You can override this on an individual task.
  // See https://trigger.dev/docs/runs/max-duration
  maxDuration: 3600,
  retries: {
    enabledInDev: true,
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 10000,
      factor: 2,
      randomize: true,
    },
  },
  dirs: ['./src/trigger'],
  build: {
    extensions: [
      // `server-only` throws unless bundled under Next's `react-server` condition.
      // trigger.dev bundles with esbuild and runs in plain Node, so we stub the
      // marker to an empty module. The modules it guards are real server code that
      // we do want running inside the trigger worker.
      esbuildPlugin({
        name: 'stub-server-only',
        setup(build) {
          build.onResolve({ filter: /^server-only$/ }, (args) => ({
            path: args.path,
            namespace: 'server-only-stub',
          }))
          build.onLoad({ filter: /.*/, namespace: 'server-only-stub' }, () => ({
            contents: '',
            loader: 'js',
          }))
        },
      }),
      esbuildPlugin(
        sentryEsbuildPlugin({
          org,
          project: sentryProject,
          // Find this auth token in settings -> developer settings -> auth tokens
          authToken: sentryAuthToken,
        }),
        { placement: 'last', target: 'deploy' },
      ),
    ],
  },
  init: () => {
    Sentry.init({
      defaultIntegrations: false,
      // The Data Source Name (DSN) is a unique identifier for your Sentry project.
      dsn,
      // Update this to match the environment you want to track errors for
      environment: vercelEnv,
    })
  },
  onFailure: ({ payload, error, ctx }) => {
    console.error({ payload, error, ctx })
    Sentry.captureException(error, {
      extra: {
        payload,
        ctx,
      },
    })
  },
})
