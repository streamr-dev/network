/**
 * Main-thread test script.
 *
 * 1.  Creates a Worker and calls installWebrtcBridge(worker).
 * 2.  Creates a DirectWebrtcConnection on the main thread (Peer A – offerer).
 * 3.  Tells the worker to create a WorkerWebrtcConnection (Peer B – answerer).
 * 4.  Relays signaling (SDP offers/answers + ICE candidates) between A and B
 *     via postMessage.
 * 5.  Once both sides are connected, sends test data in both directions.
 * 6.  Reports results to the DOM for Playwright to assert.
 */
import { DirectWebrtcConnection } from '../../../src/browser/DirectWebrtcConnection'
import { installWebrtcBridge } from '../../../src/browser/installWebrtcBridge'

// ── Helpers ─────────────────────────────────────────────────────────

const logEl = document.getElementById('log')!
const statusEl = document.getElementById('status')!

function log(msg: string) {
    const line = `[main] ${msg}`
    console.log(line)
    logEl.textContent += line + '\n'
}

function setResult(result: 'pass' | 'fail', detail?: string) {
    statusEl.textContent = result
    statusEl.setAttribute('data-detail', detail ?? '')
    log(`RESULT: ${result} ${detail ?? ''}`)
}

// A minimal PeerDescriptor – only nodeId (bytes) is required.
function randomPeerDescriptor() {
    const nodeId = new Uint8Array(32)
    crypto.getRandomValues(nodeId)
    return { nodeId, type: 0 /* NodeType.NODEJS */ }
}

// ── Main ────────────────────────────────────────────────────────────

async function run() {
    try {
        // 1.  Create Worker + bridge
        const worker = new Worker('/worker.js', { type: 'module' })
        installWebrtcBridge(worker)
        log('Bridge installed')

        // 2.  Create main-thread peer (Peer A – offerer)
        const peerA = new DirectWebrtcConnection({
            remotePeerDescriptor: randomPeerDescriptor(),
            iceServers: [], // loopback – no STUN/TURN needed
        })
        log(`Peer A created (connectionId=${peerA.connectionId})`)

        // 3.  Tell worker to create Peer B (answerer)
        //     We send the connectionId so the worker can mirror it
        //     (not strictly required, but keeps logs tidy).
        const peerBConnectionId = peerA.connectionId
        worker.postMessage({ type: 'create-peer', connectionId: peerBConnectionId })

        // ── Promise gates ───────────────────────────────────────

        const peerAConnected = new Promise<void>((resolve) => {
            peerA.on('connected', () => { log('Peer A connected'); resolve() })
        })

        const peerBConnected = new Promise<void>((resolve) => {
            const handler = (e: MessageEvent) => {
                if (e.data?.type === 'connected') {
                    log('Peer B connected (reported by worker)')
                    resolve()
                    worker.removeEventListener('message', handler)
                }
            }
            worker.addEventListener('message', handler)
        })

        const aReceivedData = new Promise<Uint8Array>((resolve) => {
            peerA.on('data', (bytes) => { log(`Peer A received ${bytes.length} bytes`); resolve(bytes) })
        })

        const bReceivedData = new Promise<Uint8Array>((resolve) => {
            const handler = (e: MessageEvent) => {
                if (e.data?.type === 'data') {
                    const bytes = new Uint8Array(e.data.bytes)
                    log(`Peer B received ${bytes.length} bytes (reported by worker)`)
                    resolve(bytes)
                    worker.removeEventListener('message', handler)
                }
            }
            worker.addEventListener('message', handler)
        })

        // ── Signaling relay: A → B ──────────────────────────────

        peerA.on('localDescription', (sdp, sdpType) => {
            log(`A → B  localDescription (${sdpType})`)
            worker.postMessage({ type: 'remote-description', sdp, sdpType })
        })

        peerA.on('localCandidate', (candidate, mid) => {
            log(`A → B  iceCandidate`)
            worker.postMessage({ type: 'remote-candidate', candidate, mid })
        })

        // ── Signaling relay: B → A ──────────────────────────────

        worker.addEventListener('message', async (e: MessageEvent) => {
            if (e.data?.type === 'local-description') {
                log(`B → A  localDescription (${e.data.sdpType})`)
                await peerA.setRemoteDescription(e.data.sdp, e.data.sdpType)
            } else if (e.data?.type === 'local-candidate') {
                log('B → A  iceCandidate')
                peerA.addRemoteCandidate(e.data.candidate, e.data.mid)
            }
        })

        // ── Start both peers ────────────────────────────────────

        peerA.start(true /* offerer */)
        log('Peer A started (offerer)')

        // ── Wait for connection ─────────────────────────────────

        log('Waiting for both peers to connect…')
        await Promise.all([peerAConnected, peerBConnected])
        log('Both peers connected!')

        // ── Exchange data ───────────────────────────────────────

        const testPayloadAtoB = new Uint8Array([1, 2, 3, 4, 5])
        const testPayloadBtoA = new Uint8Array([10, 20, 30, 40, 50])

        peerA.send(testPayloadAtoB)
        log('Peer A sent data')

        worker.postMessage({ type: 'send-data', bytes: Array.from(testPayloadBtoA) })
        log('Asked Peer B to send data')

        // ── Wait for data ───────────────────────────────────────

        const [dataFromB, dataFromA] = await Promise.all([aReceivedData, bReceivedData])

        // ── Assertions ──────────────────────────────────────────

        const errors: string[] = []

        if (dataFromB.toString() !== testPayloadBtoA.toString()) {
            errors.push(`A received wrong data: expected [${testPayloadBtoA}] got [${dataFromB}]`)
        }
        if (dataFromA.toString() !== testPayloadAtoB.toString()) {
            errors.push(`B received wrong data: expected [${testPayloadAtoB}] got [${dataFromA}]`)
        }

        // ── Clean up ────────────────────────────────────────────

        peerA.destroy()
        worker.postMessage({ type: 'destroy' })

        if (errors.length > 0) {
            setResult('fail', errors.join('; '))
        } else {
            setResult('pass')
        }
    } catch (err: any) {
        setResult('fail', String(err?.stack ?? err))
    }
}

run()
