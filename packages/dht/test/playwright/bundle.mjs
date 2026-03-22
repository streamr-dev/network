/**
 * Bundle the test fixtures for the browser.
 * Run this before `npx playwright test`.
 */
import * as esbuild from 'esbuild'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const DIST = resolve(__dirname, 'dist')

const shared = {
    bundle: true,
    format: 'esm',
    target: 'es2022',
    sourcemap: true,
    outdir: DIST,
    external: [],
}

// ── Simple 1-to-1 test ──────────────────────────────────────────────
await esbuild.build({
    ...shared,
    entryPoints: [resolve(__dirname, 'fixtures/main.ts')],
})

await esbuild.build({
    ...shared,
    entryPoints: [resolve(__dirname, 'fixtures/worker.ts')],
})

// ── Comprehensive network test ──────────────────────────────────────
await esbuild.build({
    ...shared,
    entryPoints: [resolve(__dirname, 'fixtures/main-network.ts')],
})

await esbuild.build({
    ...shared,
    entryPoints: [resolve(__dirname, 'fixtures/worker-node.ts')],
})

console.log('✔ Test fixtures bundled to test/playwright/dist/')
