import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Base path comes from env so forks or renames only touch config.
// GitHub Pages serves the site at /<repo>/.
const base = process.env.VITE_BASE_PATH ?? '/Meridian-Terminal/';

/** CSP connect-src entries for the proxy: HTTPS calls plus the WebSocket for the AIS feed. */
function proxyOrigin(): string {
  const url = process.env.VITE_PROXY_URL;
  if (!url) return '';
  try {
    const u = new URL(url);
    const ws = `${u.protocol === 'https:' ? 'wss:' : 'ws:'}//${u.host}`;
    return `${u.origin} ${ws}`;
  } catch {
    throw new Error('VITE_PROXY_URL is not a valid URL');
  }
}

export default defineConfig({
  base,
  plugins: [
    react(),
    {
      // Fill the CSP connect-src with the proxy origin at build time (6.6).
      name: 'csp-proxy-origin',
      // The dev server injects <style> tags, so dev alone allows inline styles. Production stays strict.
      transformIndexHtml: (html, ctx) => {
        const out = html.replace('__PROXY_ORIGIN__', proxyOrigin());
        return ctx.server ? out.replace("style-src 'self'", "style-src 'self' 'unsafe-inline'") : out;
      },
    },
  ],
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 250,
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}', 'worker/src/**/*.test.ts', 'shared/**/*.test.ts', 'tests/**/*.test.ts'],
  },
});
