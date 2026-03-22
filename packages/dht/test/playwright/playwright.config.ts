import { defineConfig } from '@playwright/test'

export default defineConfig({
    testDir: '.',
    testMatch: '*.spec.ts',
    timeout: 30_000,
    retries: 0,
    use: {
        browserName: 'chromium',
        headless: true,
    },
    webServer: {
        command: 'node serve.mjs',
        cwd: __dirname,
        port: 9876,
        reuseExistingServer: false,
    },
})
