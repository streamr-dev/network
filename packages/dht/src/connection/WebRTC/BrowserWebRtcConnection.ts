import EventEmitter from "events"
import { Event, IWebRtcConnection } from "./IWebRtcConnection"
import { IConnection, Event as ConnectionEvent, ConnectionType } from "../IConnection"
import { PeerDescriptor } from "../../proto/DhtRpc"
import { ConnectionID } from "../../types"
import { Logger } from '../../helpers/Logger'

enum ConnectionState { CONNECTING = 'connecting', OPEN = 'open', CLOSED = 'closed' }

const logger = new Logger(module)

export class NodeWebRtcConnection extends EventEmitter implements IWebRtcConnection, IConnection {

    public readonly connectionId: ConnectionID = new ConnectionID()
    public readonly connectionType: ConnectionType = ConnectionType.WEBRTC

    private lastState: ConnectionState = ConnectionState.CONNECTING
    private stunUrls = ['stun:stun.l.google.com:19302']
    private peerConnection: RTCPeerConnection | null = null
    private dataChannel: RTCDataChannel | null = null
    private makingOffer = false
    private isOffering = false
    private buffer: Uint8Array[] = []

    private remotePeerDescriptor: PeerDescriptor | null = null

    start(isOffering: boolean): void {
        this.isOffering = isOffering
        const urls: RTCIceServer[] = this.stunUrls.map((url) => { return { urls: [url] } })
        this.peerConnection = new RTCPeerConnection({ iceServers: urls })

        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate && event.candidate.sdpMid) {
                this.emit(Event.LOCAL_CANDIDATE, event.candidate.candidate, event.candidate.sdpMid)
            }
        }

        this.peerConnection.onicegatheringstatechange = () => {
            //this.logger.trace('conn.onGatheringStateChange: %s -> %s', this.lastGatheringState, this.peerConnection?.iceGatheringState)
            //this.lastGatheringState = this.peerConnection?.iceGatheringState
        }

        if (isOffering) {
            this.peerConnection.onnegotiationneeded = async () => {
                try {
                    if (this.peerConnection) {
                        this.makingOffer = true
                        try {
                            await this.peerConnection.setLocalDescription()
                        } catch (err) {
                            logger.warn(err)
                        }
                        if (this.peerConnection.localDescription) {
                            this.emit(Event.LOCAL_DESCRIPTION, this.peerConnection.localDescription?.sdp, this.peerConnection.localDescription?.type)
                        }
                    }
                } catch (err) {
                    logger.error(err)
                } finally {
                    this.makingOffer = false
                }
            }

            const dataChannel = this.peerConnection.createDataChannel('streamrDataChannel')
            this.setupDataChannel(dataChannel)
        } else {
            this.peerConnection.ondatachannel = (event) => {
                this.setupDataChannel(event.channel)
                logger.trace('connection.onDataChannel')
                this.openDataChannel(event.channel)
            }
        }
    }

    async setRemoteDescription(description: string, type: string): Promise<void> {
        const offerCollision = (type.toLowerCase() == "offer") && (this.makingOffer || !this.peerConnection || 
            this.peerConnection.signalingState != "stable")

        const ignoreOffer = this.isOffering && offerCollision
        if (ignoreOffer) {
            return
        }
        try {
            await this.peerConnection?.setRemoteDescription({ sdp: description, type: type.toLowerCase() as RTCSdpType })
        } catch (err) {
            logger.warn(err)
        }

        if (type == "Offer" && this.peerConnection) {
            try {
                await this.peerConnection.setLocalDescription()
            } catch (err) {
                logger.warn(err)
            }
            if (this.peerConnection.localDescription) {  
                this.emit(Event.LOCAL_DESCRIPTION, this.peerConnection.localDescription.sdp, this.peerConnection.localDescription.type)
            }
        }
    }

    addRemoteCandidate(candidate: string, mid: string): void {
        try {
            this.peerConnection?.addIceCandidate({ candidate: candidate, sdpMid: mid }).then(() => { return }).catch((err: any) => {
                logger.warn(err)
            })
        } catch (e) {
            logger.warn(e)
        }
    }

    isOpen(): boolean {
        if (this.lastState == ConnectionState.OPEN) {
            return true
        }
        return false
    }

    // IConnection implementation
    close(): void {
        this.lastState = ConnectionState.CLOSED

        if (this.dataChannel) {
            try {
                this.dataChannel.close()
            } catch (e) {
                logger.warn('dc.close() errored: %s', e)
            }
        }

        this.dataChannel = null

        if (this.peerConnection) {
            try {
                this.peerConnection.close()
            } catch (e) {
                logger.warn('conn.close() errored: %s', e)
            }
        }

        this.peerConnection = null
    }

    setPeerDescriptor(peerDescriptor: PeerDescriptor): void {
        this.remotePeerDescriptor = peerDescriptor
    }

    getPeerDescriptor(): PeerDescriptor | null {
        return this.remotePeerDescriptor
    }

    send(data: Uint8Array): void {
        if (this.lastState == ConnectionState.OPEN) {
            this.doSend(data)
        }
        else if (this.lastState == ConnectionState.CONNECTING) {
            this.addToBuffer(data)
        }
    }

    sendBufferedMessages(): void {
        while (this.buffer.length > 0) {
            this.send(this.buffer.shift() as Uint8Array)
        }
    }

    private doSend(data: Uint8Array): void {
        this.dataChannel?.send(data as Buffer)
    }

    private addToBuffer(msg: Uint8Array): void {
        this.buffer.push(msg)
    }

    getBufferedMessages(): Uint8Array[] {
        return this.buffer
    }

    private setupDataChannel(dataChannel: RTCDataChannel): void {
        dataChannel.onopen = () => {
            logger.trace('dc.onOpen')
            this.openDataChannel(dataChannel)
        }

        dataChannel.onclose = () => {
            logger.trace('dc.onClosed')
            this.close()
        }

        dataChannel.onerror = (err) => {
            logger.warn('dc.onError: %o', err)
        }

        dataChannel.onbufferedamountlow = () => {
            //this.emitLowBackpressure()
        }

        dataChannel.onmessage = (msg) => {
            logger.trace('dc.onmessage')
            this.emit(ConnectionEvent.DATA, new Uint8Array(msg.data))
        }
    }

    private openDataChannel(dataChannel: RTCDataChannel): void {
        this.dataChannel = dataChannel
        this.lastState = ConnectionState.OPEN
        this.emit(ConnectionEvent.CONNECTED)
    }
}