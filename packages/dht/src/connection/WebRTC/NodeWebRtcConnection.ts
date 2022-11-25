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

enum RTCPeerConnectionStateEnum {
    closed = 'closed',
    connected = 'connected',
    connecting = 'connecting',
    disconnected = 'disconnected',
    failed = 'failed',
    new = 'new'
}

nodeDatachannel.initLogger("Verbose")

type RTCPeerConnectionState = keyof typeof RTCPeerConnectionStateEnum

type Events = WebRtcConnectionEvents & ConnectionEvents

type HandlerParameters<T extends (...args: any[]) => any> = Parameters<Parameters<T>[0]>

function PeerConnectionEmitter(connection: PeerConnection) {
    const emitter: EventEmitter = new EventEmitter()
    emitter.on('error', () => {}) // noop to prevent unhandled error event
    connection.onStateChange((...args: HandlerParameters<PeerConnection['onStateChange']>) => emitter.emit('stateChange', ...args))
    connection.onGatheringStateChange((...args: HandlerParameters<PeerConnection['onGatheringStateChange']>) => (
        emitter.emit('gatheringStateChange', ...args)
    ))
    connection.onLocalDescription((...args: HandlerParameters<PeerConnection['onLocalDescription']>) => emitter.emit('localDescription', ...args))
    connection.onLocalCandidate((...args: HandlerParameters<PeerConnection['onLocalCandidate']>) => emitter.emit('localCandidate', ...args))
    connection.onDataChannel((...args: HandlerParameters<PeerConnection['onDataChannel']>) => emitter.emit('dataChannel', ...args))
    return emitter
}


export class NodeWebRtcConnection extends EventEmitter<Events> implements IConnection, IWebRtcConnection {

    public connectionId: ConnectionID
    private connection?: PeerConnection
    private dataChannel?: DataChannel
    private lastState: RTCPeerConnectionState = 'connecting'
    private remoteDescriptionSet = false
    private connectingTimeoutRef?: NodeJS.Timeout
    private connectionEmitter?: EventEmitter

    public readonly connectionType: ConnectionType = ConnectionType.WEBRTC
    private readonly stunUrls: string[]
    //private readonly bufferThresholdHigh: number // TODO: buffer handling must be implemented before production use
    private readonly bufferThresholdLow: number
    private readonly connectingTimeout: number
    private readonly remotePeerDescriptor: PeerDescriptor
    private closed = false

    constructor(params: Params) {
        super()
        this.connectionId = new ConnectionID()
        this.stunUrls = params.stunUrls || []
        //this.bufferThresholdHigh = params.bufferThresholdHigh || 2 ** 17
        this.bufferThresholdLow = params.bufferThresholdLow || 2 ** 15
        this.connectingTimeout = params.connectingTimeout || 20000
        this.remotePeerDescriptor = params.remotePeerDescriptor
    }

    start(isOffering: boolean): void {
        const hexId = PeerID.fromValue(this.remotePeerDescriptor.kademliaId).toKey()
        logger.info(`Staring new connection for peer: ${hexId} offering: ${isOffering}`)
        this.connection = new PeerConnection(hexId, {
            iceServers: this.stunUrls,
            maxMessageSize: MAX_MESSAGE_SIZE
        })

        this.connectingTimeoutRef = setTimeout(() => {
            this.close()
        }, this.connectingTimeout)

        // this.connection.onStateChange((state: string) => this.onStateChange(state))
        // this.connection.onGatheringStateChange((_state: string) => {})
        // this.connection.onLocalDescription((description: string, type: DescriptionType) => {
        //     this.emit('localDescription', description, type.toString())
        // })
        // this.connection.onLocalCandidate((candidate: string, mid: string) => {
        //     this.emit('localCandidate', candidate, mid)
        // })

        this.connectionEmitter = PeerConnectionEmitter(this.connection)

        this.connectionEmitter.on('stateChange', this.onStateChange)
        this.connectionEmitter.on('gatheringStateChange', this.onGatheringStateChange)
        this.connectionEmitter.on('localDescription', this.onLocalDescription)
        this.connectionEmitter.on('localCandidate', this.onLocalCandidate)

        console.log(this.connection.localDescription())
        if (isOffering) {
            const dataChannel = this.connection.createDataChannel('streamrDataChannel')
            this.setupDataChannel(dataChannel)
            // if (this.connection.localDescription()) {
            //     this.emit('localDescription', this.connection.localDescription()!.sdp, this.connection.localDescription()!.type)
            // }
        } else {
            this.connectionEmitter.on('dataChannel', this.onDataChannel)
        }
    }

    async setRemoteDescription(description: string, type: string): Promise<void> {
        if (this.connection) {
            try {
                logger.trace(`Setting remote descriptor for peer: ${PeerID.fromValue(this.remotePeerDescriptor.kademliaId).toKey()}`)
                this.connection!.setRemoteDescription(description, type as DescriptionType)
                this.remoteDescriptionSet = true
            } catch (err) {
                logger.warn(`Failed to set remote descriptor for peer ${PeerID.fromValue(this.remotePeerDescriptor.kademliaId).toKey()}`)
            }
        } else {
            this.close(`Tried to set description for non-existent connection`)
        }
    }

    addRemoteCandidate(candidate: string, mid: string): void {
        if (this.connection) {
            if (this.remoteDescriptionSet) {
                try {
                    logger.trace(`Setting remote candidate for peer: ${PeerID.fromValue(this.remotePeerDescriptor.kademliaId).toKey()}`)
                    this.connection!.addRemoteCandidate(candidate, mid)
                } catch (err) {
                    logger.warn(`Failed to set remote candidate for peer ${PeerID.fromValue(this.remotePeerDescriptor.kademliaId).toKey()}`)
                    this.close()
                }
            } else {
                this.close(`Tried to set candidate before description`)
            }
        } else {
            this.close(`Tried to set candidate for non-existent connection`)
        }
    }

    send(data: Uint8Array): void {
        if (this.isOpen()) {
            try {
                console.log("webrtc sending")
                this.dataChannel!.sendMessageBinary(data as Buffer)
            } catch (err) {
                logger.warn('Failed to send binary message to ' + PeerID.fromValue(this.remotePeerDescriptor.kademliaId).toKey())
            }
        }
    }

    close(reason?: string): void {
        console.log("CLOSING")
        if (this.closed === false) {
            logger.trace(
                `Closing Node WebRTC Connection to ${PeerID.fromValue(this.remotePeerDescriptor.kademliaId).toKey()}`
                + `${reason ? `, reason: ${reason}` : ''}`
            )
            this.closed = true
            if (this.connectingTimeoutRef) {
                clearTimeout(this.connectingTimeoutRef)
            }

            if (this.connectionEmitter) {
                this.connectionEmitter.removeAllListeners()
            }

            this.emit('disconnected')

            if (this.connection) {
                try {
                    this.connection.close()
                } catch (e) {
                    logger.warn('conn.close() errored: %s', e)
                }
            }

            if (this.dataChannel) {
                try {
                    this.dataChannel.close()
                } catch (e) {
                    logger.warn('dc.close() errored: %s', e)
                }
            }
            this.removeAllListeners()
        }
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
            this.close('DataChannel closed')
        })

        dataChannel.onError((err) => logger.warn(err))
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
        console.log("DC OPENED")
        this.dataChannel = dataChannel
        logger.trace(`DataChannel opened for peer ${this.remotePeerDescriptor.kademliaId.toString()}`)
        this.emit('connected')
    }

    private onStateChange(state: string): void {
        if (!Object.keys(RTCPeerConnectionStateEnum).filter((s) => isNaN(+s)).includes(state)) {
            throw new IllegalRTCPeerConnectionState('NodeWebRtcConnection used an unknown state: ' + state)
        } else {
            this.lastState = state as RTCPeerConnectionState
        }
        if (state === RTCPeerConnectionStateEnum.closed
            || state === RTCPeerConnectionStateEnum.disconnected
            || state === RTCPeerConnectionStateEnum.failed
        ) {
            this.close()
        }
    }

    private onGatheringStateChange(state: string): void {
        logger.trace(`Gathering state changed to ${state}`)
    }

    private onLocalDescription(description: string, type: DescriptionType): void {
        this.emit('localDescription', description, type)
    }

    private onLocalCandidate(candidate: string, mid: string): void {
        this.emit('localCandidate', candidate, mid)
    }

    isOpen(): boolean {
        return !this.closed && this.lastState === 'connected' && !!this.dataChannel
    }

    public setConnectionId(connectionID: string): void {
        this.connectionId = new ConnectionID(connectionID)
    }
}
