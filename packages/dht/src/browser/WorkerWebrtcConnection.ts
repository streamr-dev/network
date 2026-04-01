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
import { Logger } from '@streamr/utils'
import { EARLY_TIMEOUT } from '../connection/webrtc/consts'
import { createRandomConnectionId } from '../connection/Connection'
import type { WebrtcConnectionParams } from '../types/WebrtcConnectionParams'
import type { IceServer } from '../connection/webrtc/types'
import type { WebrtcBridgeApi } from './WebrtcBridge'
import { WEBRTC_BRIDGE_PORT_MESSAGE_TYPE } from './installWebrtcBridge'
import { isWorkerEnvironment } from './isWorkerEnvironment'

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
                        this.doClose(false)
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
            this.bridge.renameConnection(oldId, connectionId).catch(() => {})
        }
    }

    // ── DataChannel handling (runs entirely in the worker) ──────

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
            this.doClose(false)
        }

        dataChannel.onerror = (err) => {
            logger.warn('Data channel error (worker)', { err })
        }

        dataChannel.onmessage = (msg) => {
            logger.trace('dc.onmessage (worker)')
            this.emit('data', new Uint8Array(msg.data))
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
