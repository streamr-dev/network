import { IWebRtcConnection, WebRtcConnectionEvents } from './IWebRtcConnection'
import { ConnectionType, IConnection, ConnectionID, ConnectionEvents } from '../IConnection'
import { PeerDescriptor } from '../../proto/packages/dht/protos/DhtRpc'
import EventEmitter from 'eventemitter3'
import nodeDatachannel, { DataChannel, DescriptionType, PeerConnection } from 'node-datachannel'
import { Logger } from '@streamr/utils'
import { IllegalRTCPeerConnectionState } from '../../helpers/errors'
import { keyFromPeerDescriptor } from '../../helpers/peerIdFromPeerDescriptor'
import { DisconnectionType } from '../../transport/ITransport'
import { iceServerAsString } from './iceServerAsString'
import { IceServer } from './WebRtcConnector'

const logger = new Logger(module)

const MAX_MESSAGE_SIZE = 1048576

export const WEB_RTC_CLEANUP = new class {
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
    iceServers?: IceServer[]
}

// Re-defined accoring to https://github.com/microsoft/TypeScript/blob/main/src/lib/dom.generated.d.ts
// because importing single dom definitions in not possible

enum RTCPeerConnectionStateEnum {
    closed = 'closed',
    connected = 'connected',
    connecting = 'connecting',
    disconnected = 'disconnected',
    failed = 'failed',
    new = 'new'
}

nodeDatachannel.initLogger("Fatal")

type RTCPeerConnectionState = keyof typeof RTCPeerConnectionStateEnum

type Events = WebRtcConnectionEvents & ConnectionEvents

export class NodeWebRtcConnection extends EventEmitter<Events> implements IConnection, IWebRtcConnection {

    public connectionId: ConnectionID
    private connection?: PeerConnection
    private dataChannel?: DataChannel
    private lastState: RTCPeerConnectionState = 'connecting'
    private remoteDescriptionSet = false
    private connectingTimeoutRef?: NodeJS.Timeout

    public readonly connectionType: ConnectionType = ConnectionType.WEBRTC
    private readonly iceServers: IceServer[]
    private readonly bufferThresholdHigh: number // TODO: buffer handling must be implemented before production use
    private readonly bufferThresholdLow: number
    private readonly connectingTimeout: number
    private readonly remotePeerDescriptor: PeerDescriptor
    private closed = false

    constructor(params: Params) {
        super()
        this.connectionId = new ConnectionID()
        this.iceServers = params.iceServers || []
        this.bufferThresholdHigh = params.bufferThresholdHigh || 2 ** 17
        this.bufferThresholdLow = params.bufferThresholdLow || 2 ** 15
        this.connectingTimeout = params.connectingTimeout || 20000
        this.remotePeerDescriptor = params.remotePeerDescriptor
    }

    public start(isOffering: boolean): void {
        logger.trace(`Staring new connection for peer: ${this.remotePeerDescriptor.kademliaId.toString()}`)
        const hexId = keyFromPeerDescriptor(this.remotePeerDescriptor)
        logger.trace(`Staring new connection for peer: ${hexId} offering: ${isOffering}`)
        this.connection = new PeerConnection(hexId, {
            iceServers: this.iceServers.map(iceServerAsString),
            maxMessageSize: MAX_MESSAGE_SIZE
        })

        this.connectingTimeoutRef = setTimeout(() => {
            logger.trace('connectingTimeout, this.closed === ' + this.closed)
            this.doClose('OTHER')
        }, this.connectingTimeout)

        this.connection.onStateChange((state: string) => this.onStateChange(state))
        this.connection.onGatheringStateChange((_state: string) => {})

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
                logger.trace(`Setting remote descriptor for peer: ${keyFromPeerDescriptor(this.remotePeerDescriptor)}`)
                this.connection!.setRemoteDescription(description, type as DescriptionType)
                this.remoteDescriptionSet = true
            } catch (err) {
                logger.warn(`Failed to set remote descriptor for peer ${keyFromPeerDescriptor(this.remotePeerDescriptor)}`)
            }
        } else {
            this.doClose('OTHER', `Tried to set description for non-existent connection`)
        }
    }

    public addRemoteCandidate(candidate: string, mid: string): void {
        if (this.connection) {
            if (this.remoteDescriptionSet) {
                try {
                    logger.trace(`Setting remote candidate for peer: ${keyFromPeerDescriptor(this.remotePeerDescriptor)}`)
                    this.connection!.addRemoteCandidate(candidate, mid)
                } catch (err) {
                    logger.warn(`Failed to set remote candidate for peer ${keyFromPeerDescriptor(this.remotePeerDescriptor)}`)
                    this.doClose('OTHER')
                }
            } else {
                this.doClose('OTHER', `Tried to set candidate before description`)
            }
        } else {
            this.doClose('OTHER', `Tried to set candidate for non-existent connection`)
        }
    }

    public send(data: Uint8Array): void {
        if (this.isOpen()) {
            try {
                this.dataChannel!.sendMessageBinary(data as Buffer)
            } catch (err) {
                logger.warn('Failed to send binary message to ' + keyFromPeerDescriptor(this.remotePeerDescriptor) + err)
            }
        }
    }

    public async close(disconnectionType: DisconnectionType, reason?: string): Promise<void> {
        this.doClose(disconnectionType, reason)
    }

    private doClose(disconnectionType: DisconnectionType, reason?: string): void {
        if (!this.closed) {
            logger.trace(
                `Closing Node WebRTC Connection to ${keyFromPeerDescriptor(this.remotePeerDescriptor)}`
                + `${reason ? `, reason: ${reason}` : ''}`
            )

            this.closed = true
            
            this.emit('disconnected', disconnectionType, undefined, reason)
            this.removeAllListeners()
            
            if (this.connectingTimeoutRef) {
                clearTimeout(this.connectingTimeoutRef)
            }

            if (this.dataChannel) {
                try {
                    logger.trace('closing datachannel')
                    this.dataChannel.close()
                } catch (e) {
                    logger.warn('dc.close() errored: %s', e)
                }
            }
            
            if (this.connection) {
                try {
                    this.connection.close()
                } catch (e) {
                    logger.warn('conn.close() errored: %s', e)
                }
            }
        }
    }

    public destroy(): void {
        this.removeAllListeners()
        this.doClose('OTHER')
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
            this.doClose('OTHER', 'DataChannel closed')
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
        logger.trace(`DataChannel opened for peer ${this.remotePeerDescriptor.kademliaId.toString()}`)
        this.emit('connected')
    }

    private onStateChange(state: string): void {
        logger.trace('onStateChange ' + state)
        if (!Object.keys(RTCPeerConnectionStateEnum).filter((s) => isNaN(+s)).includes(state)) {
            throw new IllegalRTCPeerConnectionState('NodeWebRtcConnection used an unknown state: ' + state)
        } else {
            this.lastState = state as RTCPeerConnectionState
        }
        
        if (state === RTCPeerConnectionStateEnum.closed
            || state === RTCPeerConnectionStateEnum.disconnected
            || state === RTCPeerConnectionStateEnum.failed
        ) {
            this.doClose('OTHER')
        }
        
    }

    isOpen(): boolean {
        return !this.closed && this.lastState === 'connected' && !!this.dataChannel
    }

    public setConnectionId(connectionID: string): void {
        this.connectionId = new ConnectionID(connectionID)
    }
}
