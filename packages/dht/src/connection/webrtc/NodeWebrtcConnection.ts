import { IWebrtcConnection, WebrtcConnectionEvents } from './IWebrtcConnection'
import { ConnectionType, IConnection, ConnectionID, ConnectionEvents } from '../IConnection'
import { PeerDescriptor } from '../../../generated/packages/dht/protos/DhtRpc'
import EventEmitter from 'eventemitter3'
import { DataChannel, DescriptionType, PeerConnection, initLogger } from 'node-datachannel'
import { Logger } from '@streamr/utils'
import { IllegalRtcPeerConnectionState } from '../../helpers/errors'
import { iceServerAsString } from './iceServerAsString'
import { IceServer, EARLY_TIMEOUT } from './WebrtcConnector'
import { PortRange } from '../ConnectionManager'
import { toNodeId } from '../../identifiers'
import { createRandomConnectionId } from '../Connection'

const logger = new Logger(module)

export interface Params {
    remotePeerDescriptor: PeerDescriptor
    bufferThresholdHigh?: number
    bufferThresholdLow?: number
    maxMessageSize?: number
    iceServers?: IceServer[] // TODO make this parameter required (empty array is a good fallback which can be set by the caller if needed)
    portRange?: PortRange
}

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

type Events = WebrtcConnectionEvents & ConnectionEvents

export class NodeWebrtcConnection extends EventEmitter<Events> implements IConnection, IWebrtcConnection {
    public connectionId: ConnectionID
    private connection?: PeerConnection
    private dataChannel?: DataChannel
    private lastState: RtcPeerConnectionState = 'connecting'
    private remoteDescriptionSet = false
    public readonly connectionType: ConnectionType = ConnectionType.WEBRTC
    private readonly iceServers: IceServer[]
    private readonly _bufferThresholdHigh: number // TODO: buffer handling must be implemented before production use (NET-938)
    private readonly bufferThresholdLow: number
    private readonly remotePeerDescriptor: PeerDescriptor
    private readonly portRange?: PortRange
    private readonly maxMessageSize?: number
    private closed = false
    private offering?: boolean
    private readonly earlyTimeout: NodeJS.Timeout

    constructor(params: Params) {
        super()
        this.connectionId = createRandomConnectionId()
        this.iceServers = params.iceServers ?? []
        // eslint-disable-next-line no-underscore-dangle
        this._bufferThresholdHigh = params.bufferThresholdHigh ?? 2 ** 17
        this.bufferThresholdLow = params.bufferThresholdLow ?? 2 ** 15
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
            portRangeEnd: this.portRange?.max
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
            const dataChannel = this.connection.createDataChannel('streamrDataChannel')
            this.setupDataChannel(dataChannel)
        } else {
            this.connection.onDataChannel((dataChannel) => this.setupDataChannel(dataChannel))
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

    public send(data: Uint8Array): void {
        if (this.isOpen()) {
            try {
                this.dataChannel!.sendMessageBinary(data as Buffer)
            } catch (err) {
                const remoteNodeId = toNodeId(this.remotePeerDescriptor)
                logger.debug('Failed to send binary message to ' + remoteNodeId + err)
            }
        }
    }

    public async close(gracefulLeave: boolean, reason?: string): Promise<void> {
        this.doClose(gracefulLeave, reason)
    }

    private doClose(gracefulLeave: boolean, reason?: string): void {
        if (!this.closed) {
            clearTimeout(this.earlyTimeout)
            const remoteNodeId = toNodeId(this.remotePeerDescriptor)
            logger.trace(
                `Closing Node WebRTC Connection to ${remoteNodeId}` +
                    `${reason !== undefined ? `, reason: ${reason}` : ''}`
            )

            this.closed = true

            this.emit('disconnected', gracefulLeave, undefined, reason)
            this.removeAllListeners()

            if (this.dataChannel) {
                try {
                    logger.trace('closing datachannel')
                    this.dataChannel.close()
                } catch (e) {
                    logger.trace('dc.close() errored: %s', e)
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
            this.dataChannel = undefined
        }
    }

    public destroy(): void {
        this.removeAllListeners()
        this.doClose(false)
    }

    private setupDataChannel(dataChannel: DataChannel): void {
        this.dataChannel = dataChannel
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

        dataChannel.onBufferedAmountLow(() => {
            logger.trace(`dc.onBufferedAmountLow`)
        })

        dataChannel.onMessage((msg) => {
            logger.trace(`dc.onMessage`)
            this.emit('data', msg as Buffer)
        })
    }

    private onDataChannelOpen(): void {
        logger.trace(`DataChannel opened for peer ${toNodeId(this.remotePeerDescriptor)}`)
        this.emit('connected')
    }

    private onStateChange(state: string): void {
        logger.trace('onStateChange ' + state)
        if (
            !Object.keys(RtcPeerConnectionStateEnum)
                .filter((s) => isNaN(+s))
                .includes(state)
        ) {
            throw new IllegalRtcPeerConnectionState('NodeWebrtcConnection used an unknown state: ' + state)
        } else {
            this.lastState = state as RtcPeerConnectionState
        }

        if (
            state === RtcPeerConnectionStateEnum.closed ||
            state === RtcPeerConnectionStateEnum.disconnected ||
            state === RtcPeerConnectionStateEnum.failed
        ) {
            this.doClose(false)
        }
    }

    isOpen(): boolean {
        return !this.closed && this.lastState === 'connected' && !!this.dataChannel
    }

    public setConnectionId(connectionId: ConnectionID): void {
        this.connectionId = connectionId
    }
}
