// Single source of truth for names, paths and origins (BUILD_PROMPT 1 and M0).
// Rename the app by changing APP_NAME only.

export const APP_NAME = 'Meridian Terminal';
export const APP_SHORT_NAME = 'Meridian';
export const REPO = 'M14Mason/Meridian-Terminal';

/** Base path the site is served from on GitHub Pages. Mirrors vite.config.ts. */
export const BASE_PATH = import.meta.env.BASE_URL;

/** Public site origin. The proxy only accepts CORS requests from here (and localhost in dev). */
export const PAGES_ORIGIN = 'https://m14mason.github.io';

/**
 * Proxy (Cloudflare Worker) URL. Set at build time with VITE_PROXY_URL once the owner
 * deploys the Worker. Not a secret: every request still needs a device token.
 */
export const PROXY_URL: string = import.meta.env.VITE_PROXY_URL ?? '';

export const DISCLAIMER = 'Personal research tool. Not financial advice. Data may be delayed, incomplete or wrong.';
export const MODEL_LABEL = 'Model estimate. Not financial advice.';
