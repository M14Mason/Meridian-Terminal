// End-to-end smoke tests (M12). Runs the production build with `vite preview`. No proxy needed: an unpaired
// browser must only ever see the pairing screen (6.4).
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  use: { baseURL: 'http://localhost:4173/Meridian-Terminal/' },
  webServer: { command: 'npx vite preview --port 4173 --strictPort', url: 'http://localhost:4173/Meridian-Terminal/', reuseExistingServer: true, timeout: 60_000 },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['iPhone 13'], browserName: 'chromium' } },
  ],
});
