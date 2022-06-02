import { IWebRtcConnection, Event as IWebRtcEvent } from './IWebRtcConnection'
import { ConnectionType, IConnection, Event as ConnectionEvent, } from '../IConnection'
import { ConnectionID } from '../../types'
import { PeerDescriptor } from '../../proto/DhtRpc'
import EventEmitter = require('events')
import nodeDatachannel, { DataChannel, DescriptionType, PeerConnection } from 'node-datachannel'
import { PeerID } from '../../helpers/PeerID'
import { Logger } from '../../helpers/Logger'
import { IWebRtcCleanUp } from './IWebRtcCleanUp'

const logger = new Logger(module)

export const WebRtcCleanUp = new class implements IWebRtcCleanUp {
    cleanUp(): void {
        nodeDatachannel.cleanup()
    }
}

export class NodeWebRtcConnection extends EventEmitter implements IConnection, IWebRtcConnection {

    public connectionId: ConnectionID
    public connectionType: ConnectionType = ConnectionType.WEBRTC
    private connection: PeerConnection | null = null
    private dataChannel: DataChannel | null = null
    private stunUrls = []
    private isOffering = false
    private maxMessageSize = 1048576
    private _bufferThresholdHigh = 2 ** 17
    private bufferThresholdLow = 2 ** 15
    private lastState = ''
    private buffer: Uint8Array[] = []
    private remoteDescriptionSet = false
    private connectingTimeoutRef: NodeJS.Timeout | null = null
    private connectingTimeout = 10000
    constructor(private remotePeerDescriptor: PeerDescriptor) {
        super()
        this.connectionId = new ConnectionID()
    }

    start(isOffering: boolean): void {
        logger.trace(`Staring new connection for peer: ${this.remotePeerDescriptor.peerId.toString()}`)
        const hexId = PeerID.fromValue(this.remotePeerDescriptor.peerId).toMapKey()
        this.isOffering = isOffering
        this.connection = new PeerConnection(hexId, {
            iceServers: [...this.stunUrls],
            maxMessageSize: this.maxMessageSize
        })

        this.connectingTimeoutRef = setTimeout(() => {
            this.close()
        }, this.connectingTimeout)

        this.connection.onStateChange((state) => this.onStateChange(state))
        this.connection.onGatheringStateChange((_state) => {})
        this.connection.onLocalDescription((description: string, type: DescriptionType) => {
            this.emit(IWebRtcEvent.LOCAL_DESCRIPTION, description, type.toString())
        })
        this.connection.onLocalCandidate((candidate: string, mid: string) => {
            this.emit(IWebRtcEvent.LOCAL_CANDIDATE, candidate, mid)
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

    setPeerDescriptor(peerDescriptor: PeerDescriptor): void {
        this.remotePeerDescriptor = peerDescriptor
    }

    getPeerDescriptor(): PeerDescriptor | null {
        return this.remotePeerDescriptor
    }

    send(data: Uint8Array): void {
        if (this.isOpen()) {
            this.doSend(data)
        }
        else {
            this.addToBuffer(data)
        }
    }

    sendBufferedMessages(): void {
        while (this.buffer.length > 0) {
            this.send(this.buffer.shift() as Uint8Array)
        }
    }

    private doSend(data: Uint8Array): void {
        this.dataChannel?.sendMessageBinary(data as Buffer)
    }

    private addToBuffer(msg: Uint8Array): void {
        this.buffer.push(msg)
    }

    getBufferedMessages(): Uint8Array[] {
        return this.buffer
    }

    close(): void {
        logger.trace(`Closing Node WebRTC Connection`)
        if (this.connectingTimeoutRef) {
            clearTimeout(this.connectingTimeoutRef)
        }
        this.emit(ConnectionEvent.DISCONNECTED)
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

        dataChannel.onError((err) => logger.error(err))

        dataChannel.onBufferedAmountLow( () => {
            logger.trace(`dc.onBufferedAmountLow`)
        })

        dataChannel.onMessage((msg) => {
            logger.trace(`dc.onMessage`)
            this.emit(ConnectionEvent.DATA, msg as Buffer)
        })
    }

    private openDataChannel(dataChannel: DataChannel): void {
        if (this.connectingTimeoutRef) {
            clearTimeout(this.connectingTimeoutRef)
        }
        this.dataChannel = dataChannel
        this.sendBufferedMessages()
        logger.trace(`DataChannel opened for peer ${this.remotePeerDescriptor.peerId.toString()}`)
        this.emit(ConnectionEvent.CONNECTED)

    }

    private onStateChange(state: string): void {
        this.lastState = state
    }

    isOpen(): boolean {
        return this.lastState === 'connected' && !!this.dataChannel
    }

    public setConnectionId(connectionID: string): void {
        this.connectionId = new ConnectionID(connectionID)
    }
}