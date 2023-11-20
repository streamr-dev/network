import { IWebrtcConnection, WebrtcConnectionEvents } from './IWebrtcConnection'
import { IConnection, ConnectionID, ConnectionEvents } from '../IConnection'
import { PeerDescriptor } from '../../proto/packages/dht/protos/DhtRpc'
import EventEmitter from 'eventemitter3'
import nodeDatachannel, { DataChannel, DescriptionType, PeerConnection } from 'node-datachannel'
import { Logger } from '@streamr/utils'
import { IllegalRtcPeerConnectionState } from '../../helpers/errors'
import { getNodeIdFromPeerDescriptor, keyFromPeerDescriptor } from '../../helpers/peerIdFromPeerDescriptor'
import { iceServerAsString } from './iceServerAsString'
import { IceServer } from './WebrtcConnector'
import { PortRange } from '../ConnectionManager'

const logger = new Logger(module)

export const WEBRTC_CLEANUP = new class {
    // eslint-disable-next-line class-methods-use-this
    cleanUp(): void {
        nodeDatachannel.cleanup()
    }
}

export interface Params {
    remotePeerDescriptor: PeerDescriptor
    bufferThresholdHigh?: number
    bufferThresholdLow?: number
    connectingTimeout?: number
    maxMessageSize?: number
    iceServers?: IceServer[]
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

nodeDatachannel.initLogger('Fatal')

type RtcPeerConnectionState = keyof typeof RtcPeerConnectionStateEnum

type Events = WebrtcConnectionEvents & ConnectionEvents

export class NodeWebrtcConnection extends EventEmitter<Events> implements IConnection, IWebrtcConnection {

    public connectionId: ConnectionID
    private connection?: PeerConnection
    private dataChannel?: DataChannel
    private lastState: RtcPeerConnectionState = 'connecting'
    private remoteDescriptionSet = false
    private connectingTimeoutRef?: NodeJS.Timeout

    private readonly iceServers: IceServer[]
    private readonly _bufferThresholdHigh: number // TODO: buffer handling must be implemented before production use (NET-938)
    private readonly bufferThresholdLow: number
    private readonly connectingTimeout: number
    private readonly remotePeerDescriptor: PeerDescriptor
    private readonly portRange?: PortRange
    private readonly maxMessageSize?: number
    private closed = false

    constructor(params: Params) {
        super()
        this.connectionId = new ConnectionID()
        this.iceServers = params.iceServers ?? []
        // eslint-disable-next-line no-underscore-dangle
        this._bufferThresholdHigh = params.bufferThresholdHigh ?? 2 ** 17
        this.bufferThresholdLow = params.bufferThresholdLow ?? 2 ** 15
        this.connectingTimeout = params.connectingTimeout ?? 20000
        this.remotePeerDescriptor = params.remotePeerDescriptor
        this.maxMessageSize = params.maxMessageSize ?? 1048576
        this.portRange = params.portRange
    }

    public start(isOffering: boolean): void {
        const peerIdKey = keyFromPeerDescriptor(this.remotePeerDescriptor)
        logger.trace(`Starting new connection for peer ${getNodeIdFromPeerDescriptor(this.remotePeerDescriptor)}`, { isOffering })
        this.connection = new PeerConnection(peerIdKey, {
            iceServers: this.iceServers.map(iceServerAsString),
            maxMessageSize: this.maxMessageSize,
            portRangeBegin: this.portRange?.min,
            portRangeEnd: this.portRange?.max,
        })

        this.connectingTimeoutRef = setTimeout(() => {
            logger.trace('connectingTimeout, this.closed === ' + this.closed)
            this.doClose(false)
        }, this.connectingTimeout)

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
            this.connection.onDataChannel((dataChannel) => this.onDataChannel(dataChannel))
        }
    }

    public async setRemoteDescription(description: string, type: string): Promise<void> {
        if (this.connection) {
            try {
                logger.trace(`Setting remote descriptor for peer: ${getNodeIdFromPeerDescriptor(this.remotePeerDescriptor)}`)
                this.connection.setRemoteDescription(description, type as DescriptionType)
                this.remoteDescriptionSet = true
            } catch (err) {
                logger.debug(`Failed to set remote descriptor for peer ${getNodeIdFromPeerDescriptor(this.remotePeerDescriptor)}`)
            }
        } else {
            this.doClose(false, `Tried to set description for non-existent connection`)
        }
    }

    public addRemoteCandidate(candidate: string, mid: string): void {
        if (this.connection) {
            if (this.remoteDescriptionSet) {
                try {
                    logger.trace(`Setting remote candidate for peer: ${getNodeIdFromPeerDescriptor(this.remotePeerDescriptor)}`)
                    this.connection.addRemoteCandidate(candidate, mid)
                } catch (err) {
                    logger.debug(`Failed to set remote candidate for peer ${getNodeIdFromPeerDescriptor(this.remotePeerDescriptor)}`)
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
                logger.debug('Failed to send binary message to ' + getNodeIdFromPeerDescriptor(this.remotePeerDescriptor) + err)
            }
        }
    }

    public async close(gracefulLeave: boolean, reason?: string): Promise<void> {
        this.doClose(gracefulLeave, reason)
    }

    private doClose(gracefulLeave: boolean, reason?: string): void {
        if (!this.closed) {
            logger.trace(
                `Closing Node WebRTC Connection to ${getNodeIdFromPeerDescriptor(this.remotePeerDescriptor)}`
                + `${reason ? `, reason: ${reason}` : ''}`
            )

            this.closed = true
            
            this.emit('disconnected', gracefulLeave, undefined, reason)
            this.removeAllListeners()
            
            if (this.connectingTimeoutRef) {
                clearTimeout(this.connectingTimeoutRef)
            }

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
        }
    }

    public destroy(): void {
        this.removeAllListeners()
        this.doClose(false)
    }

    private onDataChannel(dataChannel: DataChannel): void {
        this.openDataChannel(dataChannel)
        this.setupDataChannel(dataChannel)
    }

    private setupDataChannel(dataChannel: DataChannel): void {
        dataChannel.setBufferedAmountLowThreshold(this.bufferThresholdLow)
        dataChannel.onOpen(() => {
            logger.trace(`dc.onOpened`)
            this.openDataChannel(dataChannel)
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

    private openDataChannel(dataChannel: DataChannel): void {
        if (this.connectingTimeoutRef) {
            clearTimeout(this.connectingTimeoutRef)
        }
        this.dataChannel = dataChannel
        logger.trace(`DataChannel opened for peer ${getNodeIdFromPeerDescriptor(this.remotePeerDescriptor)}`)
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
        return !this.closed && this.lastState === 'connected' && !!this.dataChannel
    }

    public setConnectionId(connectionID: string): void {
        this.connectionId = new ConnectionID(connectionID)
    }
}
