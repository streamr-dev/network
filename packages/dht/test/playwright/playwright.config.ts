import { defineConfig } from '@playwright/test'

// Run an already-installed WebKit build instead of the one this Playwright
// version expects (saves a download on a dev machine with other versions):
//   WEBKIT_EXECUTABLE_PATH=~/Library/Caches/ms-playwright/webkit-NNNN/pw_run.sh
const webkitExecutable = process.env.WEBKIT_EXECUTABLE_PATH

export default defineConfig({
    testDir: '.',
    testMatch: '*.spec.ts',
    timeout: 40_000,
    retries: 0,
    use: {
        headless: true,
    },
    // the worker bridge and the post-connection media channel transfer are
    // exercised in both engines the app runs in
    projects: [
        {
            name: 'chromium',
            use: {
                browserName: 'chromium',
                // headless Chromium hides host candidates behind mDNS names that a
                // single-page loopback connection cannot resolve
                launchOptions: { args: ['--disable-features=WebRtcHideLocalIpsWithMdns'] }
            }
        },
        {
            name: 'webkit',
            use: {
                browserName: 'webkit',
                launchOptions: webkitExecutable !== undefined ? { executablePath: webkitExecutable } : {}
            }
        },
    ],
    webServer: {
        command: 'node serve.mjs',
        cwd: __dirname,
        port: 9876,
        reuseExistingServer: false,
    },
})
