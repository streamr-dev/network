/**
 * Worker node for the comprehensive network test.
 *
 * Each worker:
 *  - Reports its isWorkerEnvironment detection
 *  - Creates a WorkerWebrtcConnection (answerer) on request
 *  - Relays signaling back to main thread via postMessage
 *  - Reports connection / disconnection events
 *  - Reports every received data message
 *  - Auto-echoes received data back through the DataChannel
 *  - Sends data on explicit request
 */
import { WorkerWebrtcConnection } from '../../../src/browser/WorkerWebrtcConnection'
import { isWorkerEnvironment } from '../../../src/browser/isWorkerEnvironment'

let connection: WorkerWebrtcConnection | undefined

function randomPeerDescriptor() {
    const nodeId = new Uint8Array(32)
    crypto.getRandomValues(nodeId)
    return { nodeId, type: 0 }
}

// ── Report environment detection immediately on load ────────────────
self.postMessage({ type: 'env-check', isWorker: isWorkerEnvironment })

// ── Message handler ─────────────────────────────────────────────────
self.addEventListener('message', async (e: MessageEvent) => {
    const { type } = e.data

    if (type === 'create-peer') {
        connection = new WorkerWebrtcConnection({
            remotePeerDescriptor: randomPeerDescriptor(),
            iceServers: [],
        })

        // Signaling → main thread
        connection.on('localDescription', (sdp: string, sdpType: string) => {
            self.postMessage({ type: 'local-description', sdp, sdpType })
        })

        connection.on('localCandidate', (candidate: string, mid: string) => {
            self.postMessage({ type: 'local-candidate', candidate, mid })
        })

        // Lifecycle → main thread
        connection.on('connected', () => {
            self.postMessage({ type: 'connected' })
        })

        connection.on('disconnected', () => {
            self.postMessage({ type: 'disconnected' })
        })

        // Data path — runs entirely in worker event loop
        connection.on('data', (bytes: Uint8Array) => {
            // 1. Report receipt to main thread (for verification)
            self.postMessage({ type: 'data-received', bytes: Array.from(bytes) })

            // 2. Auto-echo back through the DataChannel
            //    (mirrors broadcast → re-broadcast behavior in a real network)
            if (connection?.isOpen()) {
                connection.send(bytes)
            }
        })

        connection.start(false /* answerer */)
    }

    if (type === 'remote-description' && connection) {
        await connection.setRemoteDescription(e.data.sdp, e.data.sdpType)
    }

    if (type === 'remote-candidate' && connection) {
        connection.addRemoteCandidate(e.data.candidate, e.data.mid)
    }

    // Explicit send (not echo — for worker→hub unique messages)
    if (type === 'send-data' && connection) {
        connection.send(new Uint8Array(e.data.bytes))
    }

    if (type === 'destroy') {
        connection?.destroy()
        connection = undefined
    }
})
