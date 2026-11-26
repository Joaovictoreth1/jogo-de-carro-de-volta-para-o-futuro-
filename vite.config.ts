import { readFileSync } from 'node:fs';

import { defineConfig, type Plugin } from 'vitest/config';

const securityHeaders = JSON.parse(readFileSync(new URL('./security-headers.json', import.meta.url), 'utf8')) as Record<
  string,
  string
>;

const cspForMeta = (securityHeaders['Content-Security-Policy'] ?? '')
  .split(';')
  .map((directive) => directive.trim())
  .filter((directive) => directive && !directive.startsWith('frame-ancestors'))
  .join('; ');

/** Static hosts without header support still get the CSP via a meta tag in production builds. */
function cspMetaTag(): Plugin {
  return {
    name: 'csp-meta-tag',
    apply: 'build',
    transformIndexHtml: () => [
      {
        tag: 'meta',
        attrs: { 'http-equiv': 'Content-Security-Policy', content: cspForMeta },
        injectTo: 'head-prepend',
      },
    ],
  };
}

export default defineConfig({
  base: './',
  plugins: [cspMetaTag()],
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    sourcemap: true,
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks: (id) => (id.includes('node_modules/three') ? 'three' : undefined),
      },
    },
  },
  preview: {
    headers: securityHeaders,
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      include: ['src/core/**', 'src/config/**', 'src/audio/**'],
      reporter: ['text', 'json-summary', 'html'],
      thresholds: { lines: 95, functions: 95, branches: 95, statements: 95 },
    },
  },
});
