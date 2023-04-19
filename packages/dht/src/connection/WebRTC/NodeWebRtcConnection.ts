import { IWebRtcConnection, WebRtcConnectionEvents } from './IWebRtcConnection'
import { ConnectionType, IConnection, ConnectionID, ConnectionEvents } from '../IConnection'
import { PeerDescriptor } from '../../proto/DhtRpc'
import EventEmitter from 'eventemitter3'
import nodeDatachannel, { DataChannel, DescriptionType, PeerConnection } from 'node-datachannel'
import { PeerID } from '../../helpers/PeerID'
import { Logger } from '@streamr/utils'
import { IllegalRTCPeerConnectionState } from '../../helpers/errors'

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
    stunUrls?: string[]
}

// Re-defined accoring to https://github.com/microsoft/TypeScript/blob/main/src/lib/dom.generated.d.ts
// because importing single dom definitions in not possible

enum RTCPeerConnectionStateEnum {closed, connected, connecting, disconnected, failed, new}
type RTCPeerConnectionState = keyof typeof RTCPeerConnectionStateEnum  

type Events = WebRtcConnectionEvents | ConnectionEvents

export class NodeWebRtcConnection extends EventEmitter<Events> implements IConnection, IWebRtcConnection {

    public connectionId: ConnectionID
    private connection?: PeerConnection
    private dataChannel?: DataChannel
    private lastState: RTCPeerConnectionState = 'connecting'
    private remoteDescriptionSet = false
    private connectingTimeoutRef?: NodeJS.Timeout

    public readonly connectionType: ConnectionType = ConnectionType.WEBRTC
    private readonly stunUrls: string[]
    //private readonly bufferThresholdHigh: number // TODO: buffer handling must be implemented before production use
    private readonly bufferThresholdLow: number
    private readonly connectingTimeout: number
    private readonly remotePeerDescriptor: PeerDescriptor

    constructor(params: Params) {
        super()
        this.connectionId = new ConnectionID()
        this.stunUrls = params.stunUrls || []
        //this.bufferThresholdHigh = params.bufferThresholdHigh || 2 ** 17
        this.bufferThresholdLow = params.bufferThresholdLow || 2 ** 15
        this.connectingTimeout = params.connectingTimeout || 10000
        this.remotePeerDescriptor = params.remotePeerDescriptor
    }

    start(isOffering: boolean): void {
        logger.trace(`Staring new connection for peer: ${this.remotePeerDescriptor.peerId.toString()}`)
        const hexId = PeerID.fromValue(this.remotePeerDescriptor.peerId).toKey()
        this.connection = new PeerConnection(hexId, {
            iceServers: [...this.stunUrls],
            maxMessageSize: MAX_MESSAGE_SIZE
        })

        this.connectingTimeoutRef = setTimeout(() => {
            this.close()
        }, this.connectingTimeout)

        this.connection.onStateChange((state) => this.onStateChange(state))
        this.connection.onGatheringStateChange((_state) => {})
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

    async setRemoteDescription(description: string, type: string): Promise<void> {
        if (this.connection) {
            try {
                logger.trace(`Setting remote descriptor for peer: ${this.remotePeerDescriptor.peerId.toString()}`)
                this.connection!.setRemoteDescription(description, type as DescriptionType)
                this.remoteDescriptionSet = true
            } catch (err) {
                console.error(err)
            }
        } else {
            this.close()
        }
    }

    addRemoteCandidate(candidate: string, mid: string): void {
        if (this.connection) {
            if (this.remoteDescriptionSet) {
                try {
                    logger.trace(`Setting remote candidate for peer: ${this.remotePeerDescriptor.peerId.toString()}`)
                    this.connection!.addRemoteCandidate(candidate, mid)
                } catch (err) {
                    console.error(err)
                }
            } else {
                this.close()
            }
        } else {
            this.close()
        }
    }

    send(data: Uint8Array): void {
        if (this.isOpen()) {
            this.dataChannel?.sendMessageBinary(data as Buffer)
        } else {
            logger.warn('Tried to send data on a non-open connection')
        }
    }

    close(): void {
        logger.trace(`Closing Node WebRTC Connection`)
        if (this.connectingTimeoutRef) {
            clearTimeout(this.connectingTimeoutRef)
        }
        this.emit('disconnected')
        if (this.dataChannel) {
            this.dataChannel.close()
        }
        if (this.connection) {
            this.connection.close()
        }
        this.removeAllListeners()
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
            this.close()
        })

        dataChannel.onError((err) => logger.error('error', { err }))

        dataChannel.onBufferedAmountLow( () => {
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
        logger.trace(`DataChannel opened for peer ${this.remotePeerDescriptor.peerId.toString()}`)
        this.emit('connected')
    }

    private onStateChange(state: string): void {
        if (!Object.keys(RTCPeerConnectionStateEnum).filter((s) => isNaN(+s)).includes(state)) {
            throw new IllegalRTCPeerConnectionState('NodeWebRtcConnection used an unknown state: ' + state)
        } else {
            this.lastState = state as RTCPeerConnectionState
        }
    }

    isOpen(): boolean {
        return this.lastState === 'connected' && !!this.dataChannel
    }

    public setConnectionId(connectionID: string): void {
        this.connectionId = new ConnectionID(connectionID)
    }
}
