import { test, expect } from '@playwright/test'

test.describe('WebRTC Worker Bridge', () => {

    test('transfers DataChannel to worker and exchanges data bidirectionally', async ({ page }) => {
        // Collect console logs for debugging on failure
        const logs: string[] = []
        page.on('console', (msg) => logs.push(msg.text()))
        page.on('pageerror', (err) => logs.push(`PAGE ERROR: ${err}`))

        await page.goto('http://localhost:9876/')

        // Wait for the test to report a result (pass or fail).
        // The status element starts as "running" and changes to "pass" or "fail".
        const statusEl = page.locator('#status')

        await expect(statusEl).not.toHaveText('running', { timeout: 20_000 })

        const status = await statusEl.textContent()
        const detail = await statusEl.getAttribute('data-detail')

        if (status !== 'pass') {
            console.log('--- Browser console logs ---')
            logs.forEach((l) => console.log(l))
            console.log('--- End logs ---')
        }

        expect(status, `Test failed: ${detail}`).toBe('pass')
    })
})
