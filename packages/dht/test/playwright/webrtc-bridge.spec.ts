import { test, expect, Page } from '@playwright/test'

/**
 * Loads the fixture page with the given query, waits for it to report a
 * result and returns the detail string it set (facts on pass, errors on fail).
 */
async function runFixture(page: Page, query: string): Promise<string> {
    // Collect console logs for debugging on failure
    const logs: string[] = []
    page.on('console', (msg) => logs.push(msg.text()))
    page.on('pageerror', (err) => logs.push(`PAGE ERROR: ${err}`))

    await page.goto(`http://localhost:9876/${query}`)

    // The status element starts as "running" and changes to "pass" or "fail".
    const statusEl = page.locator('#status')
    await expect(statusEl).not.toHaveText('running', { timeout: 25_000 })

    const status = await statusEl.textContent()
    const detail = await statusEl.getAttribute('data-detail')

    if (status !== 'pass') {
        console.info('--- Browser console logs ---')
        logs.forEach((l) => console.info(l))
        console.info('--- End logs ---')
    }

    expect(status, `Test failed: ${detail}`).toBe('pass')
    return detail ?? ''
}

test.describe('WebRTC Worker Bridge', () => {

    test('transfers DataChannel to worker and exchanges data bidirectionally', async ({ page }) => {
        await runFixture(page, '')
    })

    test('opens the media channel after connect when the worker is the answerer', async ({ page }) => {
        // the main-thread offerer creates streamrMediaChannel once it knows the
        // peer's capabilities; the worker receives it through the bridge's
        // ondatachannel forwarding and dispatches it on the label
        const detail = await runFixture(page, '?media=1&offerer=main')
        expect(detail).toContain('before=none')
        expect(detail).toContain('A=open B=open')
    })

    test('opens the media channel through the bridge when the worker is the offerer', async ({ page }) => {
        // the worker asks the bridge to create a second channel on the
        // already-connected peer connection, which is transferred to the
        // worker; the main-thread answerer accepts it by label
        const detail = await runFixture(page, '?media=1&offerer=worker')
        expect(detail).toContain('before=none')
        expect(detail).toContain('A=open B=open')
    })
})
