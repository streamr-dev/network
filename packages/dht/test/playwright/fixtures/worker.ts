/**
 * Worker-side test script.
 *
 * On startup the WorkerWebrtcConnection module auto-listens for the
 * bridge port message from installWebrtcBridge().
 *
 * Then this script waits for instructions from the main thread to:
 *   - create a WorkerWebrtcConnection (Peer B – answerer)
 *   - relay signaling events back to the main thread
 *   - send / receive data via the transferred DataChannel
 */
import { WorkerWebrtcConnection } from '../../../src/browser/WorkerWebrtcConnection'

let peerB: WorkerWebrtcConnection | undefined

function randomPeerDescriptor() {
    const nodeId = new Uint8Array(32)
    crypto.getRandomValues(nodeId)
    return { nodeId, type: 0 }
}

self.addEventListener('message', async (e: MessageEvent) => {
    const { type } = e.data

    // ── Create Peer B (answerer) ────────────────────────────────
    if (type === 'create-peer') {
        peerB = new WorkerWebrtcConnection({
            remotePeerDescriptor: randomPeerDescriptor(),
            iceServers: [],
        })

        // Signaling events → main thread
        peerB.on('localDescription', (sdp: string, sdpType: string) => {
            self.postMessage({ type: 'local-description', sdp, sdpType })
        })

        peerB.on('localCandidate', (candidate: string, mid: string) => {
            self.postMessage({ type: 'local-candidate', candidate, mid })
        })

        peerB.on('connected', () => {
            self.postMessage({ type: 'connected' })
        })

        peerB.on('data', (bytes: Uint8Array) => {
            // Transfer the raw data back to main thread for verification.
            self.postMessage({ type: 'data', bytes: Array.from(bytes) })
        })

        peerB.on('disconnected', () => {
            self.postMessage({ type: 'disconnected' })
        })

        // Start as answerer
        peerB.start(false)
    }

    // ── Relay incoming signaling from main thread → Peer B ──────
    if (type === 'remote-description' && peerB) {
        await peerB.setRemoteDescription(e.data.sdp, e.data.sdpType)
    }

    if (type === 'remote-candidate' && peerB) {
        peerB.addRemoteCandidate(e.data.candidate, e.data.mid)
    }

    // ── Send data from Peer B ───────────────────────────────────
    if (type === 'send-data' && peerB) {
        peerB.send(new Uint8Array(e.data.bytes))
    }

    // ── Tear down ───────────────────────────────────────────────
    if (type === 'destroy' && peerB) {
        peerB.destroy()
        peerB = undefined
    }
})
