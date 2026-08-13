/**
 * WorkerWebrtcConnection — runs inside a **Web Worker**.
 *
 * Implements the same IWebrtcConnection + IConnection interfaces as
 * DirectWebrtcConnection, but delegates RTCPeerConnection management to
 * the main-thread {@link WebrtcBridge} via Comlink.
 *
 * The RTCDataChannel is **transferred** from the main thread and lives
 * entirely in the worker — all data events (onmessage, onopen, onclose,
 * onbufferedamountlow) fire in the worker's event loop.  The main thread
 * is never involved in the data path.
 */
import { EventEmitter } from 'eventemitter3'
import * as Comlink from 'comlink'
import type { Remote } from 'comlink'
import { WebrtcConnectionEvents, IWebrtcConnection } from '../connection/webrtc/IWebrtcConnection'
import { IConnection, ConnectionID, ConnectionType } from '../connection/IConnection'
import { ConnectionInfo } from '../connection/ConnectionDiagnostics'
import { Logger } from '@streamr/utils'
import { EARLY_TIMEOUT } from '../connection/webrtc/consts'
import { createRandomConnectionId } from '../connection/Connection'
import type { WebrtcConnectionParams } from '../types/WebrtcConnectionParams'
import type { IceServer } from '../connection/webrtc/types'
import type { WebrtcBridgeApi } from './WebrtcBridge'
import { WEBRTC_BRIDGE_PORT_MESSAGE_TYPE } from './installWebrtcBridge'
import { isWorkerEnvironment } from './isWorkerEnvironment'
import { isGapDiagnosticsEnabled, logGapDiagnosticSampled } from '../GapDiagnostics'

// ── agent log: layer0-vs-layer2 contention probe ────────────────────
// Every DHT connection's datachannel `onmessage` runs in THIS one worker, and
// `emit('data')` synchronously drives the downstream routing / RPC dispatch.
// So timing each emit captures the per-message synchronous processing cost —
// and aggregating across ALL connections tells us how much of the worker's
// event loop is consumed servicing GLOBAL-DHT layer0 traffic (routing for the
// hundreds of nodes we forward for) vs our handful of media messages. If a
// media arrival gap coincides with a window of high non-media processing, that
// is layer0 starving layer2. Emitted in the same `[gap-diagnostics]` line
// shape the analyzer already parses.
let dcWinStart = performance.now()
let dcWinCount = 0
let dcWinBusyMs = 0
let dcWinMaxMs = 0
function recordDcProcessing(procMs: number): void {
    if (!isGapDiagnosticsEnabled() && !(globalThis as any).__dhtGapDiagEnabled) {
        return
    }
    dcWinCount++
    dcWinBusyMs += procMs
    if (procMs > dcWinMaxMs) dcWinMaxMs = procMs
    // Individual event for a single message whose inline processing blocked the
    // loop unusually long (one expensive routing/RPC dispatch).
    if (procMs > 15) {
        try {
            console.log(
                '[gap-diagnostics]',
                JSON.stringify({
                    layer: 'dht.dc.processing.slow',
                    timestampMs: performance.now(),
                    deltaMs: +procMs.toFixed(2),
                }),
            )
        } catch {
            /* ignore */
        }
    }
    const now = performance.now()
    const winElapsed = now - dcWinStart
    if (winElapsed >= 1000) {
        try {
            console.log(
                '[gap-diagnostics]',
                JSON.stringify({
                    layer: 'dht.dc.processing.window',
                    timestampMs: now,
                    detail: {
                        windowMs: +winElapsed.toFixed(0),
                        count: dcWinCount,
                        msgPerSec: +((dcWinCount / winElapsed) * 1000).toFixed(0),
                        busyMs: +dcWinBusyMs.toFixed(1),
                        occupancyPct: +(
                            (dcWinBusyMs / winElapsed) *
                            100
                        ).toFixed(1),
                        maxMs: +dcWinMaxMs.toFixed(1),
                    },
                }),
            )
        } catch {
            /* ignore */
        }
        dcWinStart = now
        dcWinCount = 0
        dcWinBusyMs = 0
        dcWinMaxMs = 0
    }
}

// ── Module-level bridge client (initialized once per worker) ────────

let resolveBridgeProxy: (proxy: Remote<WebrtcBridgeApi>) => void
const bridgeProxyPromise = new Promise<Remote<WebrtcBridgeApi>>((resolve) => {
    resolveBridgeProxy = resolve
})

// Listen for the bridge port message from the main thread.
// This is guarded so it only runs inside a worker context.
if (isWorkerEnvironment) {
    const handler = (e: MessageEvent) => {
        if (e.data?.type === WEBRTC_BRIDGE_PORT_MESSAGE_TYPE && e.data.port) {
            const proxy = Comlink.wrap<WebrtcBridgeApi>(e.data.port)
            resolveBridgeProxy(proxy)
            self.removeEventListener('message', handler)
        }
    }
    self.addEventListener('message', handler)
}

function getBridgeProxy(): Promise<Remote<WebrtcBridgeApi>> {
    return bridgeProxyPromise
}

// ── Disconnection states ────────────────────────────────────────────

enum DisconnectedState {
    DISCONNECTED = 'disconnected',
    FAILED = 'failed',
    CLOSED = 'closed',
}

const logger = new Logger('WorkerWebrtcConnection')

// ── WorkerWebrtcConnection ──────────────────────────────────────────

export class WorkerWebrtcConnection
    extends EventEmitter<WebrtcConnectionEvents>
    implements IWebrtcConnection, IConnection {

    public connectionId: ConnectionID
    public readonly connectionType: ConnectionType = ConnectionType.WEBRTC

    private readonly iceServers: IceServer[]
    private readonly bufferThresholdHigh: number
    private readonly bufferThresholdLow: number
    private dataChannel?: RTCDataChannel
    private bridge?: Remote<WebrtcBridgeApi>
    private closed = false
    private connected = false
    private earlyTimeout: NodeJS.Timeout
    private readonly messageQueue: Uint8Array[] = []
    private startPromise?: Promise<void>
    private renamePromise?: Promise<void>
    private readonly constructedAt = Date.now()

    // agent log: PER-CONNECTION datachannel receive cadence. The global
    // `dht.dc.onmessage` accumulator can't isolate one stream; this tracks
    // inter-message arrival on THIS connection so we can pick the connection
    // carrying the composite media (highest count/bytes) and compare its
    // datachannel-level gaps against messageArrival (post-routing) and
    // videoFrameArrival (post-decrypt) — i.e. localize WHERE the gap is born.
    private lastRecvMs?: number
    private recvWinStart = 0
    private recvCount = 0
    private recvSumDelta = 0
    private recvMaxDelta = 0
    private recvBytes = 0
    private recvMaxBytes = 0

    constructor(params: WebrtcConnectionParams) {
        super()
        this.connectionId = createRandomConnectionId()
        this.iceServers = params.iceServers ?? []
        this.bufferThresholdHigh = params.bufferThresholdHigh ?? 2 ** 17
        this.bufferThresholdLow = params.bufferThresholdLow ?? 2 ** 15
        this.earlyTimeout = setTimeout(() => {
            this.doClose(false, 'timed out due to remote descriptor not being set')
        }, EARLY_TIMEOUT)
    }

    // ── IWebrtcConnection ───────────────────────────────────────

    public start(isOffering: boolean): void {
        this.startPromise = this.doStart(isOffering)
        this.startPromise.catch((err) => {
            logger.warn('Failed to start worker WebRTC connection', { err })
            this.doClose(false, 'Failed to start')
        })
    }

    private async doStart(isOffering: boolean): Promise<void> {
        this.bridge = await getBridgeProxy()

        const iceServers: RTCIceServer[] = this.iceServers.map(
            ({ url, port, username, password }) => ({
                urls: `${url}:${port}`,
                username,
                credential: password,
            })
        )

        await this.bridge.start(
            this.connectionId,
            iceServers,
            isOffering,
            Comlink.proxy({
                onLocalCandidate: (candidate: string, mid: string) => {
                    if (!this.closed) {
                        this.emit('localCandidate', candidate, mid)
                    }
                },

                onLocalDescription: (description: string, type: string) => {
                    if (!this.closed) {
                        this.emit('localDescription', description, type)
                    }
                },

                onConnectionStateChange: (state: string) => {
                    if (
                        state === DisconnectedState.CLOSED ||
                        state === DisconnectedState.DISCONNECTED ||
                        state === DisconnectedState.FAILED
                    ) {
                        this.doClose(false, `pcState=${state}`)
                    }
                },

                onDataChannel: (channel: RTCDataChannel) => {
                    if (!this.closed) {
                        this.setupDataChannel(channel)
                        // If the channel was already open at transfer time
                        if (channel.readyState === 'open') {
                            this.onDataChannelOpen()
                        }
                    }
                },
            })
        )
    }

    public async setRemoteDescription(
        description: string,
        type: string
    ): Promise<void> {
        if (this.startPromise) {
            await this.startPromise
        }
        if (!this.bridge || this.closed) {
            return
        }
        const wasSet = await this.bridge.setRemoteDescription(
            this.connectionId,
            description,
            type
        )
        if (wasSet) {
            clearTimeout(this.earlyTimeout)
        }
    }

    public addRemoteCandidate(candidate: string, mid: string): void {
        this.doAddRemoteCandidate(candidate, mid).catch((err) => {
            logger.warn('Failed to add remote candidate via bridge', { err })
        })
    }

    private async doAddRemoteCandidate(candidate: string, mid: string): Promise<void> {
        if (this.startPromise) {
            await this.startPromise
        }
        if (!this.bridge || this.closed) {
            return
        }
        await this.bridge.addRemoteCandidate(this.connectionId, candidate, mid)
    }

    public isOpen(): boolean {
        return this.connected
    }

    // ── IConnection ─────────────────────────────────────────────

    public async close(gracefulLeave: boolean, reason?: string): Promise<void> {
        this.doClose(gracefulLeave, reason)
    }

    public destroy(): void {
        this.removeAllListeners()
        this.doClose(false)
    }

    public send(data: Uint8Array): void {
        if (this.connected && this.dataChannel) {
            logGapDiagnosticSampled('dht.dc.send', {
                detail: { bufferedAmount: this.dataChannel.bufferedAmount, queueLen: this.messageQueue.length }
            })
            if (this.dataChannel.bufferedAmount > this.bufferThresholdHigh) {
                this.messageQueue.push(data)
            } else {
                this.dataChannel.send(data as ArrayBufferView<ArrayBuffer>)
            }
        } else if (!this.closed) {
            this.messageQueue.push(data)
        }
    }

    public setConnectionId(connectionId: ConnectionID): void {
        const oldId = this.connectionId
        this.connectionId = connectionId
        if (this.bridge && oldId !== connectionId) {
            // remember the rename so bridge lookups by the new id can await it
            this.renamePromise = this.bridge.renameConnection(oldId, connectionId)
            this.renamePromise.catch(() => {})
        }
    }

    public async getConnectionInfo(): Promise<ConnectionInfo | undefined> {
        try {
            if (this.startPromise) {
                await this.startPromise
            }
            if (this.renamePromise) {
                await this.renamePromise
            }
        } catch {
            return undefined
        }
        if (!this.bridge || this.closed) {
            return undefined
        }
        try {
            const info = await this.bridge.getConnectionInfo(this.connectionId)
            if (info !== undefined) {
                info.ms = Date.now() - this.constructedAt
            }
            return info
        } catch {
            return undefined
        }
    }

    // ── DataChannel handling (runs entirely in the worker) ──────

    private recordRecv(bytes: number): void {
        if (!isGapDiagnosticsEnabled() && !(globalThis as any).__dhtGapDiagEnabled) {
            return
        }
        const now = performance.now()
        const conn = String(this.connectionId).slice(0, 8)
        if (this.lastRecvMs !== undefined) {
            const delta = now - this.lastRecvMs
            this.recvSumDelta += delta
            if (delta > this.recvMaxDelta) this.recvMaxDelta = delta
            if (delta > 60) {
                try {
                    console.log('[gap-diagnostics]', JSON.stringify({
                        layer: 'dht.dc.recvGap',
                        timestampMs: now,
                        deltaMs: +delta.toFixed(1),
                        detail: { conn, bytes },
                    }))
                } catch (_e) { /* ignore */ }
            }
        }
        this.lastRecvMs = now
        this.recvCount++
        this.recvBytes += bytes
        if (bytes > this.recvMaxBytes) this.recvMaxBytes = bytes
        if (this.recvWinStart === 0) this.recvWinStart = now
        const elapsed = now - this.recvWinStart
        if (elapsed >= 1000) {
            try {
                console.log('[gap-diagnostics]', JSON.stringify({
                    layer: 'dht.dc.recv',
                    timestampMs: now,
                    detail: {
                        conn,
                        count: this.recvCount,
                        perSec: Math.round((this.recvCount / elapsed) * 1000),
                        meanMs: +(this.recvSumDelta / Math.max(1, this.recvCount)).toFixed(1),
                        maxMs: +this.recvMaxDelta.toFixed(1),
                        bytesPerSec: Math.round((this.recvBytes / elapsed) * 1000),
                        maxBytes: this.recvMaxBytes,
                    },
                }))
            } catch (_e) { /* ignore */ }
            this.recvWinStart = now
            this.recvCount = 0
            this.recvSumDelta = 0
            this.recvMaxDelta = 0
            this.recvBytes = 0
            this.recvMaxBytes = 0
        }
    }

    private setupDataChannel(dataChannel: RTCDataChannel): void {
        this.dataChannel = dataChannel
        this.dataChannel.binaryType = 'arraybuffer'
        this.dataChannel.bufferedAmountLowThreshold = this.bufferThresholdLow

        dataChannel.onopen = () => {
            logger.trace('dc.onOpen (worker)')
            this.onDataChannelOpen()
        }

        dataChannel.onclose = () => {
            logger.trace('dc.onClosed (worker)')
            this.doClose(false, 'dataChannel.onclose')
        }

        dataChannel.onerror = (err) => {
            logger.warn('Data channel error (worker)', { err })
        }

        dataChannel.onmessage = (msg) => {
            logger.trace('dc.onmessage (worker)')
            logGapDiagnosticSampled('dht.dc.onmessage')
            this.recordRecv(
                msg.data instanceof ArrayBuffer ? msg.data.byteLength : 0,
            )
            const t0 = performance.now()
            this.emit('data', new Uint8Array(msg.data))
            recordDcProcessing(performance.now() - t0)
        }

        dataChannel.onbufferedamountlow = () => {
            logger.trace('dc.onBufferedAmountLow (worker)')
            while (
                this.messageQueue.length > 0 &&
                this.dataChannel!.bufferedAmount < this.bufferThresholdHigh
            ) {
                const data = this.messageQueue.shift()!
                this.dataChannel!.send(data as ArrayBufferView<ArrayBuffer>)
            }
        }
    }

    private onDataChannelOpen(): void {
        this.connected = true
        this.flushMessageQueue()
        this.emit('connected')
    }

    private flushMessageQueue(): void {
        while (
            this.messageQueue.length > 0 &&
            this.dataChannel &&
            this.dataChannel.bufferedAmount < this.bufferThresholdHigh
        ) {
            const data = this.messageQueue.shift()!
            this.dataChannel.send(data as ArrayBufferView<ArrayBuffer>)
        }
    }

    // ── Teardown ────────────────────────────────────────────────

    private doClose(gracefulLeave: boolean, reason?: string): void {
        if (!this.closed) {
            this.closed = true
            this.connected = false
            this.messageQueue.length = 0
            clearTimeout(this.earlyTimeout)

            this.stopListening()
            this.emit('disconnected', gracefulLeave, undefined, reason)
            this.removeAllListeners()

            if (this.dataChannel !== undefined) {
                try {
                    this.dataChannel.close()
                } catch (err) {
                    logger.warn('Failed to close data channel (worker)', { err })
                }
            }
            this.dataChannel = undefined

            // Tell the main-thread bridge to tear down the RTCPeerConnection.
            // Fire-and-forget — we don't block on this.
            this.bridge
                ?.close(this.connectionId)
                .catch(() => {
                    // intentionally swallowed
                })
        }
    }

    private stopListening(): void {
        if (this.dataChannel !== undefined) {
            this.dataChannel.onopen = null
            this.dataChannel.onclose = null
            this.dataChannel.onerror = null
            this.dataChannel.onbufferedamountlow = null
            this.dataChannel.onmessage = null
        }
    }
}
