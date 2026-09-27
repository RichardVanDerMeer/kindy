import { fileURLToPath, URL } from 'node:url'

import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

/**
 * Content Security Policy for the shipped app: only Kindy's own scripts run,
 * and images may come from the app, from photos stored as data, and from
 * Google's contact-photo host. Development keeps Vite's defaults.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.googleusercontent.com",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')

function contentSecurityPolicyPlugin(): Plugin {
  return {
    name: 'kindy-content-security-policy',
    apply: 'build',
    transformIndexHtml: () => [
      {
        tag: 'meta',
        attrs: { 'http-equiv': 'Content-Security-Policy', content: contentSecurityPolicy },
        injectTo: 'head-prepend',
      },
    ],
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), vueDevTools(), contentSecurityPolicyPlugin()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
