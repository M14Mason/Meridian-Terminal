#!/usr/bin/env node
// Fallback secret scanner (hard rule 2.1). gitleaks runs in CI and in the pre-commit hook
// when installed; this script always runs so a missing gitleaks never means no scan.
// Usage: node scripts/scan-secrets.mjs [--staged]
import { execSync } from 'node:child_process';
import { readFileSync, existsSync, statSync } from 'node:fs';

export const PATTERNS = [
  ['Anthropic key', /sk-ant-[A-Za-z0-9_-]{20,}/],
  ['OpenAI-style key', /\bsk-[A-Za-z0-9]{32,}\b/],
  ['GitHub token', /\b(gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,})\b/],
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
  ['Alpaca key id', /\b(PK|AK)[A-Z0-9]{18}\b/],
  ['Private key block', /-----BEGIN (RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/],
  ['Slack token', /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['Cloudflare API token assignment', /CLOUDFLARE_API_TOKEN\s*[=:]\s*["']?[A-Za-z0-9_-]{30,}/],
  ['Generic secret assignment', /\b(api[_-]?key|secret|token|password)\b\s*[=:]\s*["'][A-Za-z0-9+/_-]{24,}["']/i],
];

// Files allowed to contain pattern-shaped strings (the scanner itself and its tests).
const ALLOW = new Set(['scripts/scan-secrets.mjs', 'tests/secrets.test.ts', '.gitleaks.toml']);
const SKIP_EXT = /\.(png|jpg|jpeg|gif|webp|ico|woff2?|ttf|otf|pdf|zip|gz)$/i;

export function scanText(text) {
  const hits = [];
  for (const [name, re] of PATTERNS) if (re.test(text)) hits.push(name);
  return hits;
}

function listFiles(staged) {
  const cmd = staged ? 'git diff --cached --name-only --diff-filter=ACM' : 'git ls-files --cached --others --exclude-standard';
  try {
    return execSync(cmd, { encoding: 'utf8' }).split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (isMain) {
  const staged = process.argv.includes('--staged');
  const files = listFiles(staged).filter((f) => !ALLOW.has(f) && !SKIP_EXT.test(f) && existsSync(f) && statSync(f).size < 2_000_000);
  let bad = 0;
  for (const f of files) {
    const hits = scanText(readFileSync(f, 'utf8'));
    // Print only the file and pattern name, never the matched value (2.3).
    for (const h of hits) {
      console.error(`SECRET? ${f}: ${h}`);
      bad++;
    }
  }
  if (bad) {
    console.error(`\n${bad} possible secret(s) found. Commit blocked.`);
    process.exit(1);
  }
  console.log(`secret scan ok (${files.length} files)`);
}
