#!/usr/bin/env node
// Fails CI if the initial shell JS grows past budget (21.1). Lazy chunks are not counted.
import { readFileSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

// Gzipped size is what a phone actually downloads over 4G.
const BUDGET_KB = 150;
const html = readFileSync('dist/index.html', 'utf8');
const entries = [...html.matchAll(/<script[^>]+src="[^"]*\/assets\/([^"]+\.js)"/g)].map((m) => m[1]);
const preloads = [...html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="[^"]*\/assets\/([^"]+\.js)"/g)].map((m) => m[1]);
const files = new Set([...entries, ...preloads]);
const all = new Set(readdirSync('dist/assets'));
let total = 0;
for (const f of files) if (all.has(f)) total += gzipSync(readFileSync(`dist/assets/${f}`)).length;
const kb = Math.round(total / 1024);
console.log(`initial JS: ${kb} KB gzip (budget ${BUDGET_KB} KB)`);
if (kb > BUDGET_KB) process.exit(1);
