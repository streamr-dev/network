/**
 * Comprehensive Playwright test for the WebRTC Worker Bridge.
 *
 * Modeled after trackerless-network/test/end-to-end/webrtc-full-node-network.test.ts:
 *  - Creates 8 worker "nodes", each running WorkerWebrtcConnection through the bridge
 *  - Connects them all to a hub node on the main thread (star topology)
 *  - Broadcasts a JSON message and verifies every worker received it
 *  - Workers echo data back to verify bidirectional data path
 *  - Each worker sends unique data to the hub
 *  - Tests a 64 KiB payload round-trip through the transferred DataChannel
 */
import { test, expect } from '@playwright/test'

const NUM_WORKERS = 8

test.describe('WebRTC Worker Network (comprehensive)', () => {

    test('8-node star topology: connect, broadcast, echo, large payload', async ({ page }) => {
        const logs: string[] = []
        page.on('console', (msg) => logs.push(msg.text()))
        page.on('pageerror', (err) => logs.push(`PAGE ERROR: ${err}`))

        await page.goto('http://localhost:9876/index-network.html')

        // Wait for the full test flow to complete
        await expect(page.locator('#status')).not.toHaveText('running', {
            timeout: 30_000,
        })

        // Parse structured results
        const resultsText = await page.locator('#results').textContent()
        const results = JSON.parse(resultsText ?? '{}')

        // Dump logs on failure for debugging
        if (results.status !== 'pass') {
            console.log('─── Browser console logs ───')
            logs.forEach((l) => console.log(l))
            console.log('─── End logs ───')
        }

        // ── Individual assertions ───────────────────────────────

        expect(
            results.mainThreadEnvDetection,
            'main thread should detect isWorkerEnvironment = false'
        ).toBe(true)

        expect(
            results.workerEnvDetection,
            'all workers should detect isWorkerEnvironment = true'
        ).toBe(true)

        expect(
            results.connectionsEstablished,
            `all ${NUM_WORKERS} workers should establish WebRTC connections`
        ).toBe(NUM_WORKERS)

        expect(
            results.broadcastsReceived,
            `all ${NUM_WORKERS} workers should receive the broadcast`
        ).toBe(NUM_WORKERS)

        expect(
            results.echoesCorrect,
            `all ${NUM_WORKERS} workers should echo broadcast data correctly`
        ).toBe(NUM_WORKERS)

        expect(
            results.workerResponses,
            `hub should receive unique responses from all ${NUM_WORKERS} workers`
        ).toBe(NUM_WORKERS)

        expect(
            results.largePayloadEchoCorrect,
            '64 KiB payload should round-trip through bridge without corruption'
        ).toBe(true)

        expect(
            results.status,
            `Overall: ${(results.errors ?? []).join('; ')}`
        ).toBe('pass')
    })
})
