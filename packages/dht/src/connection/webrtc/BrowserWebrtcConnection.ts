import EventEmitter from 'eventemitter3'
import { WebrtcConnectionEvents, IWebrtcConnection, RtcDescription } from './IWebrtcConnection'
import { IConnection, ConnectionID, ConnectionEvents, ConnectionType } from '../IConnection'
import { Logger } from '@streamr/utils'
import { IceServer } from './WebrtcConnector'

const logger = new Logger(module)

export const WEBRTC_CLEANUP = new class {
    // eslint-disable-next-line class-methods-use-this
    cleanUp(): void {
    }
}

type Events = WebrtcConnectionEvents & ConnectionEvents

interface Params {
    iceServers?: IceServer[]
}

export class NodeWebrtcConnection extends EventEmitter<Events> implements IWebrtcConnection, IConnection {

    public connectionId: ConnectionID
    public readonly connectionType: ConnectionType = ConnectionType.WEBRTC

    // We need to keep track of connection state ourselves because
    // RTCPeerConnection.connectionState is not supported on Firefox

    private lastState: RTCPeerConnectionState = 'connecting'

    private readonly iceServers: IceServer[]
    private peerConnection?: RTCPeerConnection
    private dataChannel?: RTCDataChannel
    private makingOffer = false
    private isOffering = false
    private closed = false

    constructor(params: Params) {
        super()
        this.connectionId = new ConnectionID()
        this.iceServers = params.iceServers ?? []
    }

    public start(isOffering: boolean): void {
        this.isOffering = isOffering
        const urls: RTCIceServer[] = this.iceServers.map(({ url, port, username, password }) => ({
            urls: `${url}:${port}`,
            username,
            credential: password
        }))
        this.peerConnection = new RTCPeerConnection({ iceServers: urls })

        this.peerConnection.onicecandidate = (event) => {
            if ((event.candidate !== null) && (event.candidate.sdpMid !== null)) {
                this.emit('localCandidate', event.candidate.candidate, event.candidate.sdpMid)
            }
        }

        this.peerConnection.onicegatheringstatechange = () => {
            logger.trace(`conn.onGatheringStateChange: ${this.peerConnection?.iceGatheringState}`)
        }

        if (isOffering) {
            this.peerConnection.onnegotiationneeded = async () => {
                try {
                    if (this.peerConnection !== undefined) {
                        this.makingOffer = true
                        try {
                            await this.peerConnection.setLocalDescription()
                        } catch (err) {
                            logger.warn('error', { err })
                        }
                        if (this.peerConnection.localDescription !== null) {
                            this.emit('localDescription', this.peerConnection.localDescription?.sdp, this.peerConnection.localDescription?.type)
                        }
                    }
                } catch (err) {
                    logger.error('error', { err })
                } finally {
                    this.makingOffer = false
                }
            }

            const dataChannel = this.peerConnection.createDataChannel('streamrDataChannel')
            this.setupDataChannel(dataChannel)
        } else {
            this.peerConnection.ondatachannel = (event) => {
                this.setupDataChannel(event.channel)
            }
        }
    }

    public async setRemoteDescription(description: string, type: string): Promise<void> {
        const offerCollision = (type.toLowerCase() === RtcDescription.OFFER) && (this.makingOffer || (this.peerConnection === undefined) ||
            this.peerConnection.signalingState != 'stable')

        const ignoreOffer = this.isOffering && offerCollision
        if (ignoreOffer) {
            return
        }
        try {
            await this.peerConnection?.setRemoteDescription({ sdp: description, type: type.toLowerCase() as RTCSdpType })
        } catch (err) {
            logger.warn('error', { err })
        }

        if ((type.toLowerCase() === RtcDescription.OFFER) && (this.peerConnection !== undefined)) {
            try {
                await this.peerConnection.setLocalDescription()
            } catch (err) {
                logger.warn('error', { err })
            }
            if (this.peerConnection.localDescription !== null) {
                this.emit('localDescription', this.peerConnection.localDescription.sdp, this.peerConnection.localDescription.type)
            }
        }
    }

    public addRemoteCandidate(candidate: string, mid: string): void {
        try {
            this.peerConnection?.addIceCandidate({ candidate: candidate, sdpMid: mid }).then(() => { return }).catch((err: any) => {
                logger.warn('error', { err })
            })
        } catch (err) {
            logger.warn('error', { err })
        }
    }

    public isOpen(): boolean {
        return this.lastState === 'connected'
    }

    // IConnection implementation
    
    public async close(gracefulLeave: boolean, reason?: string): Promise<void> {
        this.doClose(gracefulLeave, reason)
    }
    
    private doClose(gracefulLeave: boolean, reason?: string): void {
        if (!this.closed) {
            this.closed = true
            this.lastState = 'closed'

            this.stopListening()
            this.emit('disconnected', gracefulLeave, undefined, reason)
            
            this.removeAllListeners()

            if (this.dataChannel !== undefined) {
                try {
                    this.dataChannel.close()
                } catch (e) {
                    logger.warn(`dc.close() errored: ${e}`)
                }
            }

            this.dataChannel = undefined

            if (this.peerConnection !== undefined) {
                try {
                    this.peerConnection.close()
                } catch (e) {
                    logger.warn(`conn.close() errored: ${e}`)
                }
            }
            this.peerConnection = undefined
            
        }
    }

    public destroy(): void {
        this.removeAllListeners()
        this.doClose(false)
    }

    public send(data: Uint8Array): void {
        if (this.lastState === 'connected') {
            this.dataChannel?.send(data as Buffer)
        } else {
            logger.warn('Tried to send on a connection with last state ' + this.lastState)
        }
    }

    private setupDataChannel(dataChannel: RTCDataChannel): void {
        this.dataChannel = dataChannel
        dataChannel.onopen = () => {
            logger.trace('dc.onOpen')
            this.openDataChannel()
        }

        dataChannel.onclose = () => {
            logger.trace('dc.onClosed')
            this.doClose(false)
        }

        dataChannel.onerror = (err) => {
            logger.warn(`dc.onError: ${err}`)
        }

        dataChannel.onbufferedamountlow = () => {
            //this.emitLowBackpressure()
        }

        dataChannel.onmessage = (msg) => {
            logger.trace('dc.onmessage')
            this.emit('data', new Uint8Array(msg.data))
        }
    }

    private stopListening() {
        if (this.dataChannel !== undefined) {
            this.dataChannel.onopen = null
            this.dataChannel.onclose = null
            this.dataChannel.onerror = null
            this.dataChannel.onbufferedamountlow = null
            this.dataChannel.onmessage = null
        }

        if (this.peerConnection !== undefined) {
            this.peerConnection.onicecandidate = null
            this.peerConnection.onicegatheringstatechange = null
            this.peerConnection.onnegotiationneeded = null
            this.peerConnection.ondatachannel = null
        }
    }

    private openDataChannel(): void {
        this.lastState = 'connected'
        this.emit('connected')
    }

    public setConnectionId(connectionID: string): void {
        this.connectionId = new ConnectionID(connectionID)
    }
}
