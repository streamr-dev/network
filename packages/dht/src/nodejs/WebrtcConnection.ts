import { IWebrtcConnection, WebrtcConnectionEvents } from '../connection/webrtc/IWebrtcConnection'
import { ConnectionType, IConnection, ConnectionID } from '../connection/IConnection'
import { ConnectionInfo } from '../connection/ConnectionDiagnostics'
import { PeerDescriptor } from '../../generated/packages/dht/protos/DhtRpc'
import { EventEmitter } from 'eventemitter3'
import { DataChannel, DescriptionType, PeerConnection, initLogger } from 'node-datachannel'
import { Logger } from '@streamr/utils'
import { IllegalRtcPeerConnectionState } from '../helpers/errors'
import { iceServerAsString } from '../connection/webrtc/iceServerAsString'
import { IceServer, WebrtcMediaChannelOptions } from '../connection/webrtc/types'
import {
    DEFAULT_BUFFER_THRESHOLD_HIGH,
    DEFAULT_BUFFER_THRESHOLD_LOW,
    DEFAULT_MEDIA_BUFFER_THRESHOLD_HIGH,
    DEFAULT_MEDIA_BUFFER_THRESHOLD_LOW,
    DEFAULT_MEDIA_CHANNEL_MAX_PACKET_LIFE_TIME_MS,
    EARLY_TIMEOUT,
    MEDIA_CHANNEL_CAPABILITY,
    MEDIA_CHANNEL_LABEL,
    RELIABLE_CHANNEL_LABEL
} from '../connection/webrtc/consts'
import { DataChannelSet } from '../connection/webrtc/DataChannelSet'
import { SendQueueStatistics, SendQueueHint } from '../connection/ConnectionStatistics'
import { PortRange } from '../connection/ConnectionManager'
import { toNodeId } from '../identifiers'
import { createRandomConnectionId } from '../connection/Connection'
import type { WebrtcConnectionParams } from '../types/WebrtcConnectionParams'

const logger = new Logger('WebrtcConnection (Node)')

// Re-defined accoring to https://github.com/microsoft/TypeScript/blob/main/src/lib/dom.generated.d.ts
// because importing single dom definitions in not possible

enum RtcPeerConnectionStateEnum {
    closed = 'closed',
    connected = 'connected',
    connecting = 'connecting',
    disconnected = 'disconnected',
    failed = 'failed',
    new = 'new'
}

initLogger('Fatal')

type RtcPeerConnectionState = keyof typeof RtcPeerConnectionStateEnum

/**
 * node-datachannel (libdatachannel) connection. Same two-channel model as the
 * browser classes: the reliable `streamrDataChannel` carries everything and
 * defines the connection's lifetime; the ordered, partially reliable
 * `streamrMediaChannel` is created by the offerer after the handshake towards
 * peers that advertised the capability (see DataChannelSet).
 */
export class WebrtcConnection extends EventEmitter<WebrtcConnectionEvents> implements IConnection, IWebrtcConnection {

    public connectionId: ConnectionID
    private connection?: PeerConnection
    private reliableChannel?: DataChannel
    private mediaChannel?: DataChannel
    private mediaChannelClosed = false
    private remoteCapabilities: string[] = []
    private lastState: RtcPeerConnectionState = 'connecting'
    private remoteDescriptionSet = false
    public readonly connectionType: ConnectionType = ConnectionType.WEBRTC
    private readonly iceServers: IceServer[]
    private readonly bufferThresholdLow: number
    private readonly mediaChannelOptions: Required<WebrtcMediaChannelOptions>
    private readonly remotePeerDescriptor: PeerDescriptor
    private readonly portRange?: PortRange
    private readonly maxMessageSize?: number
    private readonly channels: DataChannelSet
    private closed = false
    private offering?: boolean
    private readonly earlyTimeout: NodeJS.Timeout
    private readonly constructedAt = Date.now()

    constructor(params: WebrtcConnectionParams) {
        super()
        this.connectionId = createRandomConnectionId()
        this.iceServers = params.iceServers ?? []
        const bufferThresholdHigh = params.bufferThresholdHigh ?? DEFAULT_BUFFER_THRESHOLD_HIGH
        this.bufferThresholdLow = params.bufferThresholdLow ?? DEFAULT_BUFFER_THRESHOLD_LOW
        this.mediaChannelOptions = {
            enabled: params.mediaChannel?.enabled ?? true,
            maxPacketLifeTimeMs: params.mediaChannel?.maxPacketLifeTimeMs ?? DEFAULT_MEDIA_CHANNEL_MAX_PACKET_LIFE_TIME_MS,
            bufferThresholdHigh: params.mediaChannel?.bufferThresholdHigh ?? DEFAULT_MEDIA_BUFFER_THRESHOLD_HIGH,
            bufferThresholdLow: params.mediaChannel?.bufferThresholdLow ?? DEFAULT_MEDIA_BUFFER_THRESHOLD_LOW
        }
        const sendOn = (channel: () => DataChannel | undefined) => (data: Uint8Array) => {
            const dc = channel()
            if (dc === undefined) {
                return
            }
            try {
                dc.sendMessageBinary(data as Buffer)
            } catch (err) {
                logger.debug('Failed to send binary message to ' + toNodeId(this.remotePeerDescriptor), { err })
            }
        }
        this.channels = new DataChannelSet({
            reliable: {
                bufferedAmount: () => this.reliableChannel?.bufferedAmount() ?? 0,
                send: sendOn(() => this.reliableChannel)
            },
            media: {
                bufferedAmount: () => this.mediaChannel?.bufferedAmount() ?? 0,
                send: sendOn(() => this.mediaChannel)
            }
        }, {
            bufferThresholdHigh,
            mediaBufferThresholdHigh: this.mediaChannelOptions.bufferThresholdHigh
        })
        this.remotePeerDescriptor = params.remotePeerDescriptor
        this.maxMessageSize = params.maxMessageSize ?? 1048576
        this.portRange = params.portRange
        this.earlyTimeout = setTimeout(() => {
            this.doClose(false, 'timed out due to remote descriptor not being set')
        }, EARLY_TIMEOUT)
    }

    public start(isOffering: boolean): void {
        const nodeId = toNodeId(this.remotePeerDescriptor)
        this.offering = isOffering
        logger.trace(`Starting new connection for peer ${nodeId}`, { isOffering })
        this.connection = new PeerConnection(nodeId, {
            iceServers: this.iceServers.map(iceServerAsString),
            maxMessageSize: this.maxMessageSize,
            portRangeBegin: this.portRange?.min,
            portRangeEnd: this.portRange?.max,
        })

        this.connection.onStateChange((state: string) => this.onStateChange(state))
        this.connection.onGatheringStateChange(() => {})

        this.connection.onLocalDescription((description: string, type: DescriptionType) => {
            this.emit('localDescription', description, type.toString())
        })
        this.connection.onLocalCandidate((candidate: string, mid: string) => {
            this.emit('localCandidate', candidate, mid)
        })
        if (isOffering) {
            const dataChannel = this.connection.createDataChannel(RELIABLE_CHANNEL_LABEL)
            this.setupReliableChannel(dataChannel)
        } else {
            this.connection.onDataChannel((dataChannel) => this.onIncomingDataChannel(dataChannel))
        }
    }

    public async setRemoteDescription(description: string, type: string): Promise<void> {
        if (this.connection) {
            clearTimeout(this.earlyTimeout)
            const remoteNodeId = toNodeId(this.remotePeerDescriptor)
            try {
                logger.trace(`Setting remote descriptor for peer: ${remoteNodeId}`)
                this.connection.setRemoteDescription(description, type as DescriptionType)
                this.remoteDescriptionSet = true
            } catch {
                logger.debug(`Failed to set remote descriptor for peer ${remoteNodeId}`)
            }
        } else {
            this.doClose(false, `Tried to set description for non-existent connection`)
        }
    }

    public addRemoteCandidate(candidate: string, mid: string): void {
        if (this.connection) {
            if (this.remoteDescriptionSet) {
                const remoteNodeId = toNodeId(this.remotePeerDescriptor)
                try {
                    logger.trace(`Setting remote candidate for peer: ${remoteNodeId}`)
                    this.connection.addRemoteCandidate(candidate, mid)
                } catch {
                    logger.debug(`Failed to set remote candidate for peer ${remoteNodeId}`)
                }
            } else {
                // TODO: should queue candidates until remote description is set?
                this.doClose(false, `Tried to set candidate before description`)
            }
        } else {
            this.doClose(false, `Tried to set candidate for non-existent connection`)
        }
    }

    public send(data: Uint8Array, hint?: SendQueueHint): void {
        if (this.isOpen()) {
            this.channels.send(data, hint)
        }
    }

    public purgeSendQueue(purgeKey: string): number {
        return this.channels.purge(purgeKey)
    }

    public async close(gracefulLeave: boolean, reason?: string): Promise<void> {
        this.doClose(gracefulLeave, reason)
    }

    private doClose(gracefulLeave: boolean, reason?: string): void {
        if (!this.closed) {
            clearTimeout(this.earlyTimeout)
            const remoteNodeId = toNodeId(this.remotePeerDescriptor)
            logger.trace(`Closing Node WebRTC Connection to ${remoteNodeId}` + `${(reason !== undefined) ? `, reason: ${reason}` : ''}`)

            this.closed = true
            this.channels.clear()

            this.emit('disconnected', gracefulLeave, undefined, reason)
            this.removeAllListeners()

            for (const channel of [this.mediaChannel, this.reliableChannel]) {
                if (channel) {
                    try {
                        logger.trace('closing datachannel')
                        channel.close()
                    } catch (e) {
                        logger.trace('dc.close() errored: %s', e)
                    }
                }
            }

            if (this.connection) {
                try {
                    this.connection.close()
                } catch (e) {
                    logger.trace('conn.close() errored: %s', e)
                }
            }
            this.connection = undefined
            this.reliableChannel = undefined
            this.mediaChannel = undefined
        }
    }

    public destroy(): void {
        this.removeAllListeners()
        this.doClose(false)
    }

    // ── capabilities / media channel ──────────────────────────────────

    public getLocalCapabilities(): string[] {
        return this.mediaChannelOptions.enabled ? [MEDIA_CHANNEL_CAPABILITY] : []
    }

    public setRemoteCapabilities(capabilities: string[]): void {
        this.remoteCapabilities = capabilities
        if (
            this.offering === true
            && this.mediaChannelOptions.enabled
            && capabilities.includes(MEDIA_CHANNEL_CAPABILITY)
            && !this.closed
            && this.mediaChannel === undefined
            && this.connection !== undefined
        ) {
            try {
                const channel = this.connection.createDataChannel(MEDIA_CHANNEL_LABEL, {
                    unordered: false,
                    maxPacketLifeTime: this.mediaChannelOptions.maxPacketLifeTimeMs
                })
                this.setupMediaChannel(channel)
            } catch (err) {
                logger.warn('Failed to create the media channel, media stays on the reliable channel', { err })
            }
        }
    }

    private onIncomingDataChannel(dataChannel: DataChannel): void {
        const label = dataChannel.getLabel()
        if (label === RELIABLE_CHANNEL_LABEL) {
            this.setupReliableChannel(dataChannel)
        } else if (label === MEDIA_CHANNEL_LABEL && this.mediaChannelOptions.enabled && this.mediaChannel === undefined) {
            this.setupMediaChannel(dataChannel)
        } else {
            logger.warn(`unexpected data channel "${label}" from ${toNodeId(this.remotePeerDescriptor)}, closing it`)
            try {
                dataChannel.close()
            } catch {
                // ignore
            }
        }
    }

    private setupReliableChannel(dataChannel: DataChannel): void {
        this.reliableChannel = dataChannel
        dataChannel.setBufferedAmountLowThreshold(this.bufferThresholdLow)
        dataChannel.onOpen(() => {
            logger.trace(`dc.onOpened`)
            this.onDataChannelOpen()
        })

        dataChannel.onClosed(() => {
            logger.trace(`dc.closed`)
            this.doClose(false, 'DataChannel closed')
        })

        dataChannel.onError((err) => logger.error('error', { err }))

        dataChannel.onBufferedAmountLow(() => this.channels.flush('reliable'))

        dataChannel.onMessage((msg) => {
            logger.trace(`dc.onMessage`)
            this.emit('data', msg as Buffer)
        })
    }

    private setupMediaChannel(dataChannel: DataChannel): void {
        this.mediaChannel = dataChannel
        dataChannel.setBufferedAmountLowThreshold(this.mediaChannelOptions.bufferThresholdLow)
        const markOpen = () => {
            logger.trace('media dc.onOpened')
            this.channels.setOpen('media', true)
        }
        dataChannel.onOpen(markOpen)
        if (dataChannel.isOpen()) {
            markOpen()
        }
        dataChannel.onClosed(() => {
            logger.debug('media channel closed, media falls back to the reliable channel')
            this.mediaChannelClosed = true
            this.channels.detachMedia()
        })
        dataChannel.onError((err) => logger.warn('media channel error', { err }))
        dataChannel.onBufferedAmountLow(() => this.channels.flush('media'))
        dataChannel.onMessage((msg) => {
            this.emit('data', msg as Buffer)
        })
    }

    private onDataChannelOpen(): void {
        logger.trace(`DataChannel opened for peer ${toNodeId(this.remotePeerDescriptor)}`)
        this.channels.setOpen('reliable', true)
        this.emit('connected')
    }

    private onStateChange(state: string): void {
        logger.trace('onStateChange ' + state)
        if (!Object.keys(RtcPeerConnectionStateEnum).filter((s) => isNaN(+s)).includes(state)) {
            throw new IllegalRtcPeerConnectionState('NodeWebrtcConnection used an unknown state: ' + state)
        } else {
            this.lastState = state as RtcPeerConnectionState
        }

        if (state === RtcPeerConnectionStateEnum.closed
            || state === RtcPeerConnectionStateEnum.disconnected
            || state === RtcPeerConnectionStateEnum.failed
        ) {
            this.doClose(false)
        }

    }

    isOpen(): boolean {
        return !this.closed && this.lastState === 'connected' && !!this.reliableChannel
    }

    /** Synchronous send-queue snapshot (see IConnection.getStatistics). */
    public getStatistics(): SendQueueStatistics | undefined {
        return this.closed ? undefined : this.channels.getStatistics()
    }

    public async getConnectionInfo(): Promise<ConnectionInfo | undefined> {
        if (this.connection === undefined || this.closed) {
            return undefined
        }
        try {
            const pair = this.connection.getSelectedCandidatePair()
            if (pair == null) {
                return undefined
            }
            const info: ConnectionInfo = {
                local: `${pair.local.type}/${pair.local.transportType}`.toLowerCase(),
                remote: `${pair.remote.type}/${pair.remote.transportType}`.toLowerCase(),
                ms: Date.now() - this.constructedAt,
                mediaChannel: (this.mediaChannel === undefined && !this.mediaChannelClosed)
                    ? 'none'
                    : (this.channels.isOpen('media') ? 'open' : 'closed')
            }
            if (pair.local.type.toLowerCase().includes('relay')) {
                info.relayAddr = `${pair.local.address}:${pair.local.port}`
            }
            const rtt = this.connection.rtt()
            if (rtt >= 0) {
                info.rttMs = rtt
            }
            return info
        } catch {
            return undefined
        }
    }

    public setConnectionId(connectionId: ConnectionID): void {
        this.connectionId = connectionId
    }
}
