import path from 'node:path'
import { ServerResponse } from 'node:http'
import { fileURLToPath } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import tsconfigPaths from 'vite-tsconfig-paths'
import { defineConfig, loadEnv, type ProxyOptions } from 'vite'
import react from '@vitejs/plugin-react'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const frontendRoot = __dirname

function hasPackagePath(id: string, packageName: string) {
  return id.includes(`/${packageName}/`) || id.includes(`\\${packageName}\\`)
}

function manualChunkFor(id: string) {
  if (!id.includes('node_modules')) {
    return undefined
  }

  if (
    hasPackagePath(id, 'react') ||
    hasPackagePath(id, 'react-dom') ||
    hasPackagePath(id, 'react-router') ||
    hasPackagePath(id, 'react-router-dom') ||
    hasPackagePath(id, 'scheduler')
  ) {
    return 'react-vendor'
  }

  if (
    hasPackagePath(id, '@tanstack') ||
    hasPackagePath(id, 'zustand') ||
    hasPackagePath(id, 'i18next') ||
    hasPackagePath(id, 'react-i18next') ||
    hasPackagePath(id, 'sonner') ||
    hasPackagePath(id, 'date-fns')
  ) {
    return 'app-vendor'
  }

  if (
    hasPackagePath(id, 'echarts-for-react')
  ) {
    return 'charts-react-vendor'
  }

  if (hasPackagePath(id, 'zrender')) {
    return 'charts-renderer-vendor'
  }

  if (hasPackagePath(id, 'echarts')) {
    return 'charts-core-vendor'
  }

  if (
    hasPackagePath(id, 'viem') ||
    hasPackagePath(id, 'abitype') ||
    hasPackagePath(id, '@noble') ||
    hasPackagePath(id, '@scure') ||
    hasPackagePath(id, 'ox') ||
    hasPackagePath(id, 'isows') ||
    hasPackagePath(id, 'ws')
  ) {
    return 'web3-vendor'
  }

  if (
    hasPackagePath(id, 'formik') ||
    hasPackagePath(id, 'yup')
  ) {
    return 'forms-vendor'
  }

  if (
    hasPackagePath(id, 'react-markdown') ||
    hasPackagePath(id, 'remark-gfm') ||
    hasPackagePath(id, 'remark-parse') ||
    hasPackagePath(id, 'remark-rehype') ||
    hasPackagePath(id, 'mdast') ||
    hasPackagePath(id, 'micromark') ||
    hasPackagePath(id, 'hast') ||
    hasPackagePath(id, 'unist') ||
    hasPackagePath(id, 'unified') ||
    hasPackagePath(id, 'vfile')
  ) {
    return 'markdown-vendor'
  }

  if (
    hasPackagePath(id, 'jspdf') ||
    hasPackagePath(id, 'jspdf-autotable') ||
    hasPackagePath(id, 'core-js') ||
    hasPackagePath(id, 'pako') ||
    hasPackagePath(id, 'fflate') ||
    hasPackagePath(id, 'html2canvas') ||
    hasPackagePath(id, 'canvg') ||
    hasPackagePath(id, 'fast-png') ||
    hasPackagePath(id, 'iobuffer') ||
    hasPackagePath(id, 'rgbcolor') ||
    hasPackagePath(id, 'stackblur-canvas') ||
    hasPackagePath(id, 'svg-pathdata') ||
    hasPackagePath(id, 'dompurify')
  ) {
    return 'export-vendor'
  }

  if (hasPackagePath(id, 'papaparse')) {
    return 'csv-vendor'
  }

  if (
    hasPackagePath(id, 'clsx') ||
    hasPackagePath(id, 'tailwind-merge')
  ) {
    return 'design-vendor'
  }

  if (
    hasPackagePath(id, 'framer-motion') ||
    hasPackagePath(id, 'lucide-react') ||
    hasPackagePath(id, '@headlessui')
  ) {
    return 'ui-vendor'
  }
}

const configureApiProxy: NonNullable<ProxyOptions['configure']> = (proxy) => {
  const defaultErrorListeners = proxy.listeners('error')

  proxy.removeAllListeners('error')
  proxy.on('error', (...args) => {
    const [error, req, res] = args
    const errorCode = 'code' in error ? error.code : undefined

    const isLogoutRequest = req?.url?.startsWith('/api/auth/logout')
    const isTransportFailure =
      errorCode === 'ECONNRESET' ||
      errorCode === 'ECONNREFUSED' ||
      error?.message?.toLowerCase().includes('socket hang up') ||
      error?.message?.toLowerCase().includes('fetch failed')

    if (isLogoutRequest && isTransportFailure) {
      if (res instanceof ServerResponse && !res.headersSent && !res.writableEnded) {
        res.writeHead(204, { 'Content-Type': 'application/json' })
        res.end()
      }
      return
    }

    defaultErrorListeners.forEach((listener) => listener(...args))
  })
}

export default defineConfig(({ mode }) => {
  const env = {
    ...loadEnv(mode, frontendRoot, ''),
    ...loadEnv(mode, repoRoot, ''),
    ...process.env,
  }

  return {
    envDir: repoRoot,
    plugins: [react(), tailwindcss(), tsconfigPaths()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 5173,
      proxy: {
        '/health': {
          target: env.VITE_PROXY_TARGET ?? 'http://localhost:8000',
          changeOrigin: true,
        },
        '/api': {
          target: env.VITE_PROXY_TARGET ?? 'http://localhost:8000',
          changeOrigin: true,
          configure: configureApiProxy,
        },
        '/ws': {
          target: env.VITE_WS_PROXY_TARGET ?? 'ws://localhost:8000',
          changeOrigin: true,
          ws: true,
        },
      },
    },
    preview: {
      host: '0.0.0.0',
      port: 4173,
    },
    build: {
      chunkSizeWarningLimit: 900,
      rollupOptions: {
        output: {
          manualChunks: manualChunkFor,
        },
      },
    },
    test: {
      environment: 'jsdom',
      setupFiles: './src/tests/setup.ts',
      include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
      exclude: ['e2e/**', 'playwright.config.ts'],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'html'],
        reportsDirectory: './coverage',
      },
    },
  }
})
