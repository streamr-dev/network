/**
 * Worker-side test script.
 *
 * On startup the WorkerWebrtcConnection module auto-listens for the
 * bridge port message from installWebrtcBridge().
 *
 * Then this script waits for instructions from the main thread to:
 *   - create a WorkerWebrtcConnection (Peer B – offerer or answerer)
 *   - relay signaling events back to the main thread
 *   - hand over the remote peer's capabilities (the handshake's job in
 *     production), which makes an offering Peer B open the media channel
 *     through the bridge
 *   - send / receive data via the transferred DataChannel(s)
 *   - report the connection info and send statistics
 */
import { WorkerWebrtcConnection } from '../../../src/browser/WorkerWebrtcConnection'

let peerB: WorkerWebrtcConnection | undefined

function randomPeerDescriptor() {
    const nodeId = new Uint8Array(32)
    crypto.getRandomValues(nodeId)
    return { nodeId, type: 0 }
}

async function report(requestId: number) {
    const info = await peerB?.getConnectionInfo()
    self.postMessage({
        type: 'info',
        requestId,
        mediaChannel: info?.mediaChannel,
        statistics: peerB?.getStatistics()
    })
}

self.addEventListener('message', async (e: MessageEvent) => {
    const { type } = e.data

    // ── Create Peer B ───────────────────────────────────────────
    if (type === 'create-peer') {
        peerB = new WorkerWebrtcConnection({
            remotePeerDescriptor: randomPeerDescriptor(),
            iceServers: [],
            mediaChannel: e.data.mediaChannel
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

        peerB.start(e.data.offerer === true)
    }

    // ── Relay incoming signaling from main thread → Peer B ──────
    if (type === 'remote-description' && peerB) {
        await peerB.setRemoteDescription(e.data.sdp, e.data.sdpType)
    }

    if (type === 'remote-candidate' && peerB) {
        peerB.addRemoteCandidate(e.data.candidate, e.data.mid)
    }

    // ── What the handshake would tell the connection ────────────
    if (type === 'remote-capabilities' && peerB) {
        peerB.setRemoteCapabilities(e.data.capabilities)
    }

    // ── Send data from Peer B (optionally hinted to a channel) ──
    if (type === 'send-data' && peerB) {
        const hint = e.data.channel !== undefined ? { channel: e.data.channel } : undefined
        peerB.send(new Uint8Array(e.data.bytes), hint)
        if (e.data.requestId !== undefined) {
            // snapshot right after the send so the offered rate still shows it
            self.postMessage({ type: 'sent', requestId: e.data.requestId, statistics: peerB.getStatistics() })
        }
    }

    if (type === 'get-info' && peerB) {
        await report(e.data.requestId)
    }

    // ── Tear down ───────────────────────────────────────────────
    if (type === 'destroy' && peerB) {
        peerB.destroy()
        peerB = undefined
    }
})
