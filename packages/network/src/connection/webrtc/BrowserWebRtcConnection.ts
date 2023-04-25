import { ConstructorOptions, WebRtcConnection } from "./WebRtcConnection"
import { Logger } from "@streamr/utils"
import { NameDirectory } from "../../NameDirectory"
import { WebRtcConnectionFactory } from "./WebRtcEndpoint"

/* eslint-disable class-methods-use-this */
export const webRtcConnectionFactory = new class implements WebRtcConnectionFactory {
    createConnection(opts: ConstructorOptions): WebRtcConnection {
        return new BrowserWebRtcConnection(opts)
    }
    registerWebRtcEndpoint(): void {
    }
    unregisterWebRtcEndpoint(): void {
    }
}

/** eslint-disable class-methods-use-this */
export class BrowserWebRtcConnection extends WebRtcConnection {
    private readonly logger: Logger
    private peerConnection: RTCPeerConnection | null = null
    private dataChannel: RTCDataChannel | null = null
    private lastState?: string | undefined = undefined
    private lastGatheringState: string | undefined = undefined
    private makingOffer = false

    constructor(opts: ConstructorOptions) {
        super(opts)
        this.logger = new Logger(module, { connection: `${NameDirectory.getName(this.getPeerId())}/${this.id}` })
    }

    protected doConnect(): void {

        const urls: RTCIceServer[] = this.iceServers.map(({ url, port, username, password }) => ({
            urls: `${url}:${port}`,
            username,
            credential: password
        }))
        this.peerConnection = new RTCPeerConnection({ iceServers: urls })

        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate && event.candidate.sdpMid) {
                this.emitLocalCandidate(event.candidate.candidate, event.candidate.sdpMid)
            }
        }

        this.peerConnection.onicegatheringstatechange = () => {
            this.logger.trace('conn.onGatheringStateChange', {
                oldState: this.lastGatheringState,
                newState: this.peerConnection?.iceGatheringState
            })
            this.lastGatheringState = this.peerConnection?.iceGatheringState
        }

        if (this.isOffering()) {
            this.peerConnection.onnegotiationneeded = async () => {
                try {
                    if (this.peerConnection) {
                        this. makingOffer = true
                        try {
                            await this.peerConnection.setLocalDescription()
                        } catch (err) {
                            this.logger.warn('Failed to set local description', err)
                        }
                        if (this.peerConnection.localDescription) {
                            this.emitLocalDescription(this.peerConnection.localDescription?.sdp, this.peerConnection.localDescription?.type)
                        }
                    }
                } catch (err) {
                    console.error(err)
                } finally {
                    this.makingOffer = false
                }
            }

            const dataChannel = this.peerConnection.createDataChannel('streamrDataChannel')
            this.setupDataChannel(dataChannel)
        } else {
            this.peerConnection.ondatachannel = (event) => {
                this.setupDataChannel(event.channel)
                this.logger.trace('connection.onDataChannel')
                this.openDataChannel(event.channel)
            }
        }
    }

    protected doClose(err?: Error): void {
        if (err !== undefined) {
            this.logger.warn('Close BrowserWebRTCConnection', { err })
        }
        if (this.dataChannel) {
            try {
                this.dataChannel.close()
            } catch (err) {
                this.logger.warn('Encountered error while closing dataChannel', { err })
            }
        }

        this.dataChannel = null

        if (this.peerConnection) {
            try {
                this.peerConnection.close()
            } catch (err) {
                this.logger.warn('Encountered error while closing peerConnection', { err })
            }
        }

        this.peerConnection = null
    }

    private async doSetRemoteDescription(description: string, type: string) {
        const offerCollision = (type == "offer") && (this.makingOffer || !this.peerConnection || this.peerConnection.signalingState != "stable")

        const ignoreOffer = this.isOffering() && offerCollision
        if (ignoreOffer) {
            return
        }
        try {
            await this.peerConnection?.setRemoteDescription({ sdp:description, type: type as RTCSdpType })
        } catch (err) {
            this.logger.warn('Failed to set remote description', err)
        }

        if (type == "offer" && this.peerConnection) {
            try {
                await this.peerConnection.setLocalDescription()
            } catch (err) {
                this.logger.warn('Failed to set local description', err)
            }
            if (this.peerConnection.localDescription) {
                this.emitLocalDescription(this.peerConnection.localDescription.sdp, this.peerConnection.localDescription.type )
            }
        }
    }

    setRemoteDescription(description: string, type: string): void {
        this.doSetRemoteDescription(description, type)
    }

    addRemoteCandidate(candidate: string, mid: string): void {
        try {
            this.peerConnection?.addIceCandidate( { candidate: candidate, sdpMid: mid })
                .then(() => {
                    return
                }).catch((err: any) => {
                    this.logger.warn('Failed to add ice candidate (#1)', { err })
                })
        } catch (err) {
            this.logger.warn('Failed to add ice candidate (#2)', { err })
        }
    }

    getBufferedAmount(): number {
        if (this.dataChannel) {
            return this.dataChannel?.bufferedAmount
        }
        return 0
    }

    getMaxMessageSize(): number {
        return 1024 * 1024
    }

    isOpen(): boolean {

        if (!this.peerConnection || !this.dataChannel || this.dataChannel.readyState != "open") {
            return false
        }

        return true
    }

    getLastState(): string | undefined {
        return this.lastState
    }

    getLastGatheringState(): string | undefined {
        return this.lastGatheringState
    }

    protected doSendMessage(message: string): boolean {
        this.dataChannel?.send(message)
        return true
    }

    private setupDataChannel(dataChannel: RTCDataChannel): void {
        dataChannel.onopen = () => {
            this.logger.trace('dc.onOpen')
            this.openDataChannel(dataChannel)
        }

        dataChannel.onclose = () => {
            this.logger.trace('dc.onClosed')
            this.close()
        }

        dataChannel.onerror = (err) => {
            this.logger.warn('Encountered error (emitted by dataChannel.onerror)', { err })
        }

        dataChannel.onbufferedamountlow = () => {
            this.emitLowBackpressure()
        }

        dataChannel.onmessage = (msg) => {
            this.logger.trace('dc.onmessage')
            this.emitMessage(msg.data.toString())
        }
    }

    private openDataChannel(dataChannel: RTCDataChannel): void {
        this.lastState = 'connected'
        this.dataChannel = dataChannel
        this.emitOpen()
    }

    close(err?: Error): void {
        this.lastState = 'close'
        super.close(err)
    }
}
