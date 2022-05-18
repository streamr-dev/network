import { IWebRtcConnection, Event as IWebRtcEvent } from './IWebRtcConnection'
import { ConnectionType, IConnection, Event as ConnectionEvent, } from '../IConnection'
import { ConnectionID } from '../../types'
import { PeerDescriptor } from '../../proto/DhtRpc'
import EventEmitter = require('events')
import { DataChannel, DescriptionType, PeerConnection } from 'node-datachannel'
import { PeerID } from '../../PeerID'

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

    constructor(private remotePeerDescriptor: PeerDescriptor) {
        super()
        this.connectionId = new ConnectionID()
    }

    start(isOffering: boolean): void {
        const stringId = PeerID.fromValue(this.remotePeerDescriptor.peerId).toString()
        this.isOffering = isOffering
        this.connection = new PeerConnection(stringId, {
            iceServers: [...this.stunUrls],
            maxMessageSize: this.maxMessageSize
        })

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
                this.connection!.setRemoteDescription(description, type as DescriptionType)
                this.remoteDescriptionSet = true
            } catch (err) {
                console.error(err)
            }
        }
    }

    addRemoteCandidate(candidate: string, mid: string): void {
        if (this.connection) {
            if (this.remoteDescriptionSet) {
                try {
                    this.connection!.addRemoteCandidate(candidate, mid)
                } catch (err) {
                    console.error(err)
                }
            }
        }
    }

    setPeerDescriptor(peerDescriptor: PeerDescriptor): void {
        this.remotePeerDescriptor = peerDescriptor
    }

    getPeerDescriptor(): PeerDescriptor | null {
        return this.remotePeerDescriptor
    }

    send(data: Uint8Array): void {
        if (this.lastState === 'open') {
            this.doSend(data)
        }
        else if (this.lastState === 'connecting') {
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
            this.openDataChannel(dataChannel)
        })

        dataChannel.onClosed(() => {
            this.close()
        })

        dataChannel.onError((err) => console.error(err))

        dataChannel.onBufferedAmountLow( () => {})

        dataChannel.onMessage((msg) => {
            this.emit(ConnectionEvent.DATA, msg as Buffer)
        })
    }

    private openDataChannel(dataChannel: DataChannel): void {
        this.dataChannel = dataChannel
        this.sendBufferedMessages()

    }

    private onStateChange(state: string): void {
        this.lastState = state
    }

    isOpen(): boolean {
        // console.log(this.lastState)
        return this.lastState === 'connected' && !!this.dataChannel
    }
}