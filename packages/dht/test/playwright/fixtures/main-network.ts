/**
 * Comprehensive multi-worker WebRTC network test — main-thread orchestrator.
 *
 * Modeled after trackerless-network's webrtc-full-node-network.test.ts:
 *   1.  Create an "entry point" hub on the main thread
 *   2.  Create NUM_WORKERS worker nodes (each in its own Worker)
 *   3.  Establish WebRTC connections: hub ↔ each worker (star topology)
 *   4.  Wait for all connections (like `until(node.getNeighbors() >= N)`)
 *   5.  Hub broadcasts a JSON message to all workers
 *   6.  Verify every worker received the broadcast (count === NUM_WORKERS)
 *   7.  Each worker sends a unique response back to the hub
 *   8.  Verify hub received all responses
 *   9.  Test large payload round-trip through the bridge
 *  10.  Clean up all connections and workers
 *
 * Results are written to #results as JSON for the Playwright spec.
 */
import { DirectWebrtcConnection } from '../../../src/browser/DirectWebrtcConnection'
import { installWebrtcBridge } from '../../../src/browser/installWebrtcBridge'
import { isWorkerEnvironment as mainThreadIsWorkerEnv } from '../../../src/browser/isWorkerEnvironment'

const NUM_WORKERS = 8
const CONNECT_TIMEOUT = 15_000
const DATA_TIMEOUT = 10_000
const LARGE_PAYLOAD_SIZE = 64 * 1024 // 64 KiB

// ── DOM helpers ─────────────────────────────────────────────────────

const logEl = document.getElementById('log')!
const statusEl = document.getElementById('status')!
const resultsEl = document.getElementById('results')!

function log(msg: string) {
    const ts = new Date().toISOString().slice(11, 23)
    const line = `[${ts}] ${msg}`
    console.log(line)
    logEl.textContent += line + '\n'
}

function randomPeerDescriptor() {
    const nodeId = new Uint8Array(32)
    crypto.getRandomValues(nodeId)
    return { nodeId, type: 0 }
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    return Promise.race([
        promise,
        new Promise<T>((_, reject) =>
            setTimeout(() => reject(new Error(`Timeout (${ms}ms): ${label}`)), ms)
        ),
    ])
}

function arraysEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false
    }
    return true
}

// ── Per-worker state ────────────────────────────────────────────────

interface WorkerNode {
    index: number
    worker: Worker
    hubConn: DirectWebrtcConnection
}

// ── Main ────────────────────────────────────────────────────────────

interface Results {
    status: 'pass' | 'fail'
    numWorkers: number
    mainThreadEnvDetection: boolean
    workerEnvDetection: boolean
    connectionsEstablished: number
    broadcastsReceived: number
    echoesCorrect: number
    workerResponses: number
    largePayloadEchoCorrect: boolean
    errors: string[]
}

async function run(): Promise<Results> {
    const results: Results = {
        status: 'fail',
        numWorkers: NUM_WORKERS,
        mainThreadEnvDetection: false,
        workerEnvDetection: false,
        connectionsEstablished: 0,
        broadcastsReceived: 0,
        echoesCorrect: 0,
        workerResponses: 0,
        largePayloadEchoCorrect: false,
        errors: [],
    }

    const nodes: WorkerNode[] = []

    try {
        // ═══════════════════════════════════════════════════════════
        // Phase 0: Environment detection
        // ═══════════════════════════════════════════════════════════

        results.mainThreadEnvDetection = !mainThreadIsWorkerEnv
        log(`Main thread isWorkerEnvironment = ${mainThreadIsWorkerEnv} (expected false) → ${results.mainThreadEnvDetection ? '✓' : '✗'}`)

        // ═══════════════════════════════════════════════════════════
        // Phase 1: Create workers, install bridges, wire signaling
        // ═══════════════════════════════════════════════════════════

        log(`Creating ${NUM_WORKERS} worker nodes…`)

        // Collect env-check promises (resolved before create-peer)
        const envChecks: Promise<boolean>[] = []
        // Connection promises for both sides
        const hubConnectedPromises: Promise<void>[] = []
        const workerConnectedPromises: Promise<void>[] = []

        for (let i = 0; i < NUM_WORKERS; i++) {
            const worker = new Worker('/worker-node.js', { type: 'module' })
            installWebrtcBridge(worker)

            const hubConn = new DirectWebrtcConnection({
                remotePeerDescriptor: randomPeerDescriptor(),
                iceServers: [],
            })
            const node: WorkerNode = { index: i, worker, hubConn }
            nodes.push(node)

            // ── Env check ───────────────────────────────────────
            envChecks.push(
                new Promise<boolean>((resolve) => {
                    const handler = (e: MessageEvent) => {
                        if (e.data?.type === 'env-check') {
                            resolve(e.data.isWorker === true)
                            worker.removeEventListener('message', handler)
                        }
                    }
                    worker.addEventListener('message', handler)
                })
            )

            // ── Hub-side connected ──────────────────────────────
            hubConnectedPromises.push(
                new Promise<void>((resolve) => hubConn.on('connected', resolve))
            )

            // ── Worker-side connected ───────────────────────────
            workerConnectedPromises.push(
                new Promise<void>((resolve) => {
                    const handler = (e: MessageEvent) => {
                        if (e.data?.type === 'connected') {
                            resolve()
                            worker.removeEventListener('message', handler)
                        }
                    }
                    worker.addEventListener('message', handler)
                })
            )

            // ── Signaling relay: Hub → Worker ───────────────────
            hubConn.on('localDescription', (sdp, sdpType) => {
                worker.postMessage({ type: 'remote-description', sdp, sdpType })
            })
            hubConn.on('localCandidate', (candidate, mid) => {
                worker.postMessage({ type: 'remote-candidate', candidate, mid })
            })

            // ── Signaling relay: Worker → Hub ───────────────────
            worker.addEventListener('message', async (e: MessageEvent) => {
                if (e.data?.type === 'local-description') {
                    await hubConn.setRemoteDescription(e.data.sdp, e.data.sdpType)
                } else if (e.data?.type === 'local-candidate') {
                    hubConn.addRemoteCandidate(e.data.candidate, e.data.mid)
                }
            })

            // Tell worker to create its connection, then start hub side
            worker.postMessage({ type: 'create-peer' })
            hubConn.start(true /* offerer */)
        }

        // ═══════════════════════════════════════════════════════════
        // Phase 2: Verify environment detection in all workers
        // ═══════════════════════════════════════════════════════════

        const envResults = await withTimeout(
            Promise.all(envChecks),
            CONNECT_TIMEOUT,
            'worker env detection'
        )
        const allEnvOk = envResults.every((v) => v === true)
        results.workerEnvDetection = allEnvOk
        log(`Worker env detection: ${envResults.filter(Boolean).length}/${NUM_WORKERS} correct → ${allEnvOk ? '✓' : '✗'}`)
        if (!allEnvOk) {
            results.errors.push('Not all workers detected isWorkerEnvironment=true')
        }

        // ═══════════════════════════════════════════════════════════
        // Phase 3: Wait for all connections
        //          (mirrors: until(node.getNeighbors() >= 3) )
        // ═══════════════════════════════════════════════════════════

        log('Waiting for all connections…')
        await withTimeout(
            Promise.all([...hubConnectedPromises, ...workerConnectedPromises]),
            CONNECT_TIMEOUT,
            'all connections'
        )
        results.connectionsEstablished = NUM_WORKERS
        log(`All ${NUM_WORKERS} connections established ✓`)

        // ═══════════════════════════════════════════════════════════
        // Phase 4: Hub broadcasts to all workers
        //          (mirrors: entryPoint.broadcast(msg) )
        //          Workers auto-echo, so hub also gets the data back.
        // ═══════════════════════════════════════════════════════════

        const broadcastPayload = new TextEncoder().encode(
            JSON.stringify({ hello: 'WORLD' })
        )

        // Set up data-receipt listeners BEFORE sending
        const broadcastReceipts = nodes.map(({ worker, index }) =>
            withTimeout(
                new Promise<Uint8Array>((resolve) => {
                    const handler = (e: MessageEvent) => {
                        if (e.data?.type === 'data-received') {
                            resolve(new Uint8Array(e.data.bytes))
                            worker.removeEventListener('message', handler)
                        }
                    }
                    worker.addEventListener('message', handler)
                }),
                DATA_TIMEOUT,
                `worker ${index} broadcast receipt`
            )
        )

        // Hub-side echo receipts (worker auto-echoes back through DataChannel)
        const echoReceipts = nodes.map(({ hubConn, index }) =>
            withTimeout(
                new Promise<Uint8Array>((resolve) => {
                    hubConn.on('data', (bytes) => resolve(bytes))
                }),
                DATA_TIMEOUT,
                `worker ${index} echo receipt`
            )
        )

        // Send broadcast
        log(`Hub broadcasting "${new TextDecoder().decode(broadcastPayload)}" to ${NUM_WORKERS} workers…`)
        for (const { hubConn } of nodes) {
            hubConn.send(broadcastPayload)
        }

        // ═══════════════════════════════════════════════════════════
        // Phase 5: Verify broadcast receipts
        //          (mirrors: await until(receivedMessageCount === NUM_OF_NODES) )
        // ═══════════════════════════════════════════════════════════

        const workerReceivedData = await Promise.all(broadcastReceipts)
        let broadcastOk = 0
        for (let i = 0; i < NUM_WORKERS; i++) {
            if (arraysEqual(workerReceivedData[i], broadcastPayload)) {
                broadcastOk++
            } else {
                results.errors.push(`Worker ${i}: broadcast data mismatch`)
            }
        }
        results.broadcastsReceived = broadcastOk
        log(`Broadcast received by ${broadcastOk}/${NUM_WORKERS} workers → ${broadcastOk === NUM_WORKERS ? '✓' : '✗'}`)

        // ═══════════════════════════════════════════════════════════
        // Phase 6: Verify echoed data arrives back at hub
        // ═══════════════════════════════════════════════════════════

        const echoes = await Promise.all(echoReceipts)
        let echoOk = 0
        for (let i = 0; i < NUM_WORKERS; i++) {
            if (arraysEqual(echoes[i], broadcastPayload)) {
                echoOk++
            } else {
                results.errors.push(`Worker ${i}: echo data mismatch`)
            }
        }
        results.echoesCorrect = echoOk
        log(`Echo correct from ${echoOk}/${NUM_WORKERS} workers → ${echoOk === NUM_WORKERS ? '✓' : '✗'}`)

        // ═══════════════════════════════════════════════════════════
        // Phase 7: Each worker sends unique data to hub
        //          (tests worker-initiated data through the bridge)
        // ═══════════════════════════════════════════════════════════

        // Set up listeners for unique worker responses
        const responseReceipts = nodes.map(({ hubConn, index }) =>
            withTimeout(
                new Promise<Uint8Array>((resolve) => {
                    // Remove old 'data' listeners and add new one
                    hubConn.removeAllListeners('data')
                    hubConn.on('data', (bytes) => resolve(bytes))
                }),
                DATA_TIMEOUT,
                `worker ${index} unique response`
            )
        )

        // Tell each worker to send its unique payload
        for (let i = 0; i < NUM_WORKERS; i++) {
            const payload = new Uint8Array([0xAA, i, i, i, 0xBB])
            nodes[i].worker.postMessage({
                type: 'send-data',
                bytes: Array.from(payload),
            })
        }

        const responses = await Promise.all(responseReceipts)
        let responseOk = 0
        for (let i = 0; i < NUM_WORKERS; i++) {
            const expected = new Uint8Array([0xAA, i, i, i, 0xBB])
            if (arraysEqual(responses[i], expected)) {
                responseOk++
            } else {
                results.errors.push(
                    `Worker ${i}: response mismatch (got [${Array.from(responses[i])}])`
                )
            }
        }
        results.workerResponses = responseOk
        log(`Unique responses received ${responseOk}/${NUM_WORKERS} → ${responseOk === NUM_WORKERS ? '✓' : '✗'}`)

        // ═══════════════════════════════════════════════════════════
        // Phase 8: Large payload round-trip through bridge
        //          (verifies DataChannel handles realistic sizes)
        // ═══════════════════════════════════════════════════════════

        const largePayload = new Uint8Array(LARGE_PAYLOAD_SIZE)
        crypto.getRandomValues(largePayload)

        // Use worker 0 for the large-payload test
        const worker0 = nodes[0]

        // Set up receipt on worker-reported side
        const workerLargeReceipt = withTimeout(
            new Promise<Uint8Array>((resolve) => {
                const handler = (e: MessageEvent) => {
                    if (e.data?.type === 'data-received' && e.data.bytes.length === LARGE_PAYLOAD_SIZE) {
                        resolve(new Uint8Array(e.data.bytes))
                        worker0.worker.removeEventListener('message', handler)
                    }
                }
                worker0.worker.addEventListener('message', handler)
            }),
            DATA_TIMEOUT,
            'large payload worker receipt'
        )

        // Set up echo receipt on hub side
        worker0.hubConn.removeAllListeners('data')
        const hubLargeEcho = withTimeout(
            new Promise<Uint8Array>((resolve) => {
                worker0.hubConn.on('data', (bytes) => resolve(bytes))
            }),
            DATA_TIMEOUT,
            'large payload hub echo'
        )

        log(`Sending ${LARGE_PAYLOAD_SIZE / 1024} KiB payload to worker 0…`)
        worker0.hubConn.send(largePayload)

        const [workerLargeData, hubLargeData] = await Promise.all([
            workerLargeReceipt,
            hubLargeEcho,
        ])

        const workerSideOk = arraysEqual(workerLargeData, largePayload)
        const hubSideOk = arraysEqual(hubLargeData, largePayload)
        results.largePayloadEchoCorrect = workerSideOk && hubSideOk
        if (!workerSideOk) results.errors.push('Large payload: worker received corrupted data')
        if (!hubSideOk) results.errors.push('Large payload: hub received corrupted echo')
        log(`Large payload round-trip: worker=${workerSideOk ? '✓' : '✗'} hub-echo=${hubSideOk ? '✓' : '✗'}`)

        // ═══════════════════════════════════════════════════════════
        // Phase 9: Clean up
        // ═══════════════════════════════════════════════════════════

        for (const { hubConn, worker } of nodes) {
            hubConn.destroy()
            worker.postMessage({ type: 'destroy' })
        }
        log('All connections destroyed')

        // Final status
        if (results.errors.length === 0) {
            results.status = 'pass'
        }
    } catch (err: any) {
        results.errors.push(String(err?.stack ?? err))
    }

    return results
}

// ── Run and report ──────────────────────────────────────────────────

run().then((results) => {
    resultsEl.textContent = JSON.stringify(results)
    statusEl.textContent = results.status
    log(`\n══ RESULT: ${results.status.toUpperCase()} ══`)
    if (results.errors.length > 0) {
        log(`Errors:\n  ${results.errors.join('\n  ')}`)
    }
})
