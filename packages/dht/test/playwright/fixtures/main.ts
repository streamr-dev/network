/**
 * Main-thread test script.
 *
 * 1.  Creates a Worker and calls installWebrtcBridge(worker).
 * 2.  Creates a DirectWebrtcConnection on the main thread (Peer A).
 * 3.  Tells the worker to create a WorkerWebrtcConnection (Peer B).
 *     `?offerer=main` (default) makes A the offerer, `?offerer=worker` B.
 * 4.  Relays signaling (SDP offers/answers + ICE candidates) between A and B
 *     via postMessage.
 * 5.  Once both sides are connected, sends test data in both directions over
 *     the reliable channel.
 * 6.  With `?media=1`: hands each side the other's capabilities (what the
 *     handshake does in production) so the offerer opens the partially
 *     reliable media channel after the connection is up — through the bridge
 *     when the worker offers — waits for it to be open on both ends, and
 *     exchanges media-hinted data over it while unhinted data stays reliable.
 * 7.  Reports results to the DOM for Playwright to assert.
 */
import { DirectWebrtcConnection } from '../../../src/browser/DirectWebrtcConnection'
import { installWebrtcBridge } from '../../../src/browser/installWebrtcBridge'
import { MEDIA_CHANNEL_CAPABILITY } from '../../../src/connection/webrtc/consts'
import type { SendQueueStatistics } from '../../../src/connection/ConnectionStatistics'

// ── Helpers ─────────────────────────────────────────────────────────

const logEl = document.getElementById('log')!
const statusEl = document.getElementById('status')!

const params = new URLSearchParams(location.search)
const workerIsOfferer = params.get('offerer') === 'worker'
const mediaPhase = params.get('media') === '1'

function log(msg: string) {
    const line = `[main] ${msg}`
    console.info(line)
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

function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`timeout waiting for ${what}`)), ms)
        promise.then(
            (value) => { clearTimeout(timer); resolve(value) },
            (err: unknown) => { clearTimeout(timer); reject(err instanceof Error ? err : new Error(String(err))) }
        )
    })
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** the next worker message of the given type */
function fromWorker(worker: Worker, type: string): Promise<any> {
    return new Promise((resolve) => {
        const handler = (e: MessageEvent) => {
            if (e.data?.type === type) {
                worker.removeEventListener('message', handler)
                resolve(e.data)
            }
        }
        worker.addEventListener('message', handler)
    })
}

let nextRequestId = 1
/** post a message carrying a requestId and wait for the reply of the given type with the same id */
function askWorker(worker: Worker, message: Record<string, unknown>, replyType: string): Promise<any> {
    const requestId = nextRequestId++
    return new Promise((resolve) => {
        const handler = (e: MessageEvent) => {
            if (e.data?.type === replyType && e.data.requestId === requestId) {
                worker.removeEventListener('message', handler)
                resolve(e.data)
            }
        }
        worker.addEventListener('message', handler)
        worker.postMessage({ ...message, requestId })
    })
}

function nextData(peer: DirectWebrtcConnection): Promise<Uint8Array> {
    return new Promise((resolve) => peer.once('data', (bytes) => resolve(bytes)))
}

function payload(size: number, seed: number): Uint8Array {
    const data = new Uint8Array(size)
    for (let i = 0; i < size; i++) {
        data[i] = (seed + i) & 0xff
    }
    return data
}

const fmt = (a: Uint8Array) => Array.from(a).join(',')
const sameBytes = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i])

const mediaOffered = (stats?: SendQueueStatistics) => stats?.channels?.media?.offeredBytesPerSecond ?? 0
const reliableOffered = (stats?: SendQueueStatistics) => stats?.channels?.reliable?.offeredBytesPerSecond ?? stats?.offeredBytesPerSecond ?? 0

// ── Main ────────────────────────────────────────────────────────────

async function run() {
    const errors: string[] = []
    const facts: string[] = []
    try {
        // 1.  Create Worker + bridge
        const worker = new Worker('/worker.js', { type: 'module' })
        installWebrtcBridge(worker)
        log(`Bridge installed (offerer=${workerIsOfferer ? 'worker' : 'main'}, media=${mediaPhase})`)

        // 2.  Create main-thread peer (Peer A)
        const peerA = new DirectWebrtcConnection({
            remotePeerDescriptor: randomPeerDescriptor(),
            iceServers: [], // loopback – no STUN/TURN needed
            mediaChannel: { enabled: true }
        })
        log(`Peer A created (connectionId=${peerA.connectionId})`)

        // 3.  Tell worker to create Peer B
        worker.postMessage({ type: 'create-peer', offerer: workerIsOfferer, mediaChannel: { enabled: true } })

        // ── Promise gates ───────────────────────────────────────

        const peerAConnected = new Promise<void>((resolve) => {
            peerA.on('connected', () => { log('Peer A connected'); resolve() })
        })
        const peerBConnected = fromWorker(worker, 'connected').then(() => log('Peer B connected (reported by worker)'))

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
                log(`B → A  localDescription (${String(e.data.sdpType)})`)
                await peerA.setRemoteDescription(e.data.sdp, e.data.sdpType)
            } else if (e.data?.type === 'local-candidate') {
                log('B → A  iceCandidate')
                peerA.addRemoteCandidate(e.data.candidate, e.data.mid)
            }
        })

        // ── Start both peers ────────────────────────────────────

        peerA.start(!workerIsOfferer)
        log(`Peer A started (${workerIsOfferer ? 'answerer' : 'offerer'})`)

        // ── Wait for connection ─────────────────────────────────

        log('Waiting for both peers to connect…')
        await withTimeout(Promise.all([peerAConnected, peerBConnected]), 10_000, 'both peers to connect')
        log('Both peers connected!')

        // ── Exchange data over the reliable channel ─────────────

        const testPayloadAtoB = new Uint8Array([1, 2, 3, 4, 5])
        const testPayloadBtoA = new Uint8Array([10, 20, 30, 40, 50])

        const aReceivedData = nextData(peerA)
        const bReceivedData = fromWorker(worker, 'data').then((m) => new Uint8Array(m.bytes))

        peerA.send(testPayloadAtoB)
        log('Peer A sent data')
        worker.postMessage({ type: 'send-data', bytes: Array.from(testPayloadBtoA) })
        log('Asked Peer B to send data')

        const [dataFromB, dataFromA] = await withTimeout(Promise.all([aReceivedData, bReceivedData]), 10_000, 'reliable data')
        log(`Peer A received ${dataFromB.length} bytes, Peer B received ${dataFromA.length} bytes`)

        if (!sameBytes(dataFromB, testPayloadBtoA)) {
            errors.push(`A received wrong data: expected [${fmt(testPayloadBtoA)}] got [${fmt(dataFromB)}]`)
        }
        if (!sameBytes(dataFromA, testPayloadAtoB)) {
            errors.push(`B received wrong data: expected [${fmt(testPayloadAtoB)}] got [${fmt(dataFromA)}]`)
        }

        // ── Media channel ───────────────────────────────────────

        if (mediaPhase) {
            const infoBefore = await peerA.getConnectionInfo()
            facts.push(`before=${infoBefore?.mediaChannel}`)
            if (infoBefore?.mediaChannel !== 'none') {
                errors.push(`media channel existed before the capabilities were known: ${infoBefore?.mediaChannel}`)
            }

            // what the handshake does in production: each side learns the other's capabilities
            peerA.setRemoteCapabilities([MEDIA_CHANNEL_CAPABILITY])
            worker.postMessage({ type: 'remote-capabilities', capabilities: [MEDIA_CHANNEL_CAPABILITY] })
            log('Capabilities exchanged, waiting for the media channel to open on both ends…')

            const deadline = Date.now() + 10_000
            let stateA: string | undefined
            let stateB: string | undefined
            while (Date.now() < deadline) {
                stateA = (await peerA.getConnectionInfo())?.mediaChannel
                stateB = (await askWorker(worker, { type: 'get-info' }, 'info')).mediaChannel
                if (stateA === 'open' && stateB === 'open') {
                    break
                }
                await sleep(100)
            }
            facts.push(`A=${stateA}`, `B=${stateB}`)
            if (stateA !== 'open' || stateB !== 'open') {
                throw new Error(`media channel not open on both ends: A=${stateA} B=${stateB}`)
            }
            log('Media channel open on both ends')

            // media-hinted data both ways; the offered-rate snapshot right after
            // each send proves which channel carried it
            const mediaAtoB = payload(2000, 7)
            const mediaBtoA = payload(2000, 99)
            const aGotMedia = nextData(peerA)
            const bGotMedia = fromWorker(worker, 'data').then((m) => new Uint8Array(m.bytes))

            peerA.send(mediaAtoB, { channel: 'media' })
            const statsA = peerA.getStatistics()
            const sentB = await askWorker(worker, { type: 'send-data', bytes: Array.from(mediaBtoA), channel: 'media' }, 'sent')
            const statsB: SendQueueStatistics | undefined = sentB.statistics

            const [gotA, gotB] = await withTimeout(Promise.all([aGotMedia, bGotMedia]), 10_000, 'media data')
            if (!sameBytes(gotA, mediaBtoA)) {
                errors.push(`A received wrong media data (${gotA.length} bytes)`)
            }
            if (!sameBytes(gotB, mediaAtoB)) {
                errors.push(`B received wrong media data (${gotB.length} bytes)`)
            }
            facts.push(`mediaOfferedA=${mediaOffered(statsA)}`, `mediaOfferedB=${mediaOffered(statsB)}`)
            if (mediaOffered(statsA) <= 0) {
                errors.push(`A did not route the hinted message to the media channel: ${JSON.stringify(statsA)}`)
            }
            if (mediaOffered(statsB) <= 0) {
                errors.push(`B did not route the hinted message to the media channel: ${JSON.stringify(statsB)}`)
            }

            // an unhinted message still takes the reliable channel
            const bGotReliable = fromWorker(worker, 'data').then((m) => new Uint8Array(m.bytes))
            const reliableAgain = payload(3000, 42)
            peerA.send(reliableAgain)
            const statsA2 = peerA.getStatistics()
            const gotB2 = await withTimeout(bGotReliable, 10_000, 'reliable data after media open')
            if (!sameBytes(gotB2, reliableAgain)) {
                errors.push(`B received wrong unhinted data after the media channel opened (${gotB2.length} bytes)`)
            }
            facts.push(`reliableOfferedA=${reliableOffered(statsA2)}`)
            if (reliableOffered(statsA2) < reliableAgain.length) {
                errors.push(`unhinted message was not offered on the reliable channel: ${JSON.stringify(statsA2)}`)
            }
        }

        // ── Clean up ────────────────────────────────────────────

        peerA.destroy()
        worker.postMessage({ type: 'destroy' })

        if (errors.length > 0) {
            setResult('fail', errors.join('; '))
        } else {
            setResult('pass', facts.join(' '))
        }
    } catch (err: any) {
        setResult('fail', [...errors, String(err?.stack ?? err)].join('; '))
    }
}

run()
