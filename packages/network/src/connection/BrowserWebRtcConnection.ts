import { ConstructorOptions, WebRtcConnection } from "./WebRtcConnection"
import { Logger } from "../helpers/Logger"
import { NameDirectory } from "../NameDirectory"
import { WebRtcConnectionFactory } from "./WebRtcEndpoint"

const BrowserWebRtcConnectionFactory: WebRtcConnectionFactory = Object.freeze({
    createConnection(opts: ConstructorOptions): WebRtcConnection {
        return new BrowserWebRtcConnection(opts)
    },
    cleanUp(): void {

    }
})

export default BrowserWebRtcConnectionFactory

export class BrowserWebRtcConnection extends WebRtcConnection {
	private readonly logger: Logger
	private peerConnection: RTCPeerConnection | null = null
	private dataChannel: RTCDataChannel | null = null
	private lastState?: string | undefined = undefined
    private lastGatheringState: string | undefined = undefined
	private makingOffer = false

	constructor(opts: ConstructorOptions) {
	    super(opts)
	    this.logger = new Logger(module, `${NameDirectory.getName(this.getPeerId())}/${this.id}`)
	}
	protected doConnect(): void {

	    const urls: RTCIceServer[] = this.stunUrls.map((url) => { return { urls: [url]} } ) 
	    this.peerConnection = new RTCPeerConnection({ iceServers: urls })
		
	    this.peerConnection.onicecandidate = (event) => {
	        if (event.candidate && event.candidate.sdpMid) {
	            this.emitLocalCandidate(event.candidate.candidate, event.candidate.sdpMid)
	        }
	    }

	    this.peerConnection.onicegatheringstatechange = () => {
	        this.logger.trace('conn.onGatheringStateChange: %s -> %s', this.lastGatheringState, this.peerConnection?.iceGatheringState)
        	this.lastGatheringState = this.peerConnection?.iceGatheringState
	    }

	    this.peerConnection.onconnectionstatechange = () => {
	        const state = this.peerConnection?.connectionState
	        this.logger.trace('conn.onStateChange: %s -> %s', this.lastState, state)
	        this.lastState = state
	
	        if (state === 'disconnected' || state === 'closed') {
	            this.close()
	        } else if (state === 'failed') {
	            this.close(new Error('connection failed'))
	        } else if (state === 'connecting') {
	            this.restartConnectionTimeout()
	        }
	    }

	    if (this.isOffering()) {
	        this.peerConnection.onnegotiationneeded = async () => {
	            try {
	                if (this.peerConnection) {
	                    this. makingOffer = true
	                    await this.peerConnection.setLocalDescription()
	                    if (this.peerConnection.localDescription) {
	                        this.emitLocalDescription(this.peerConnection.localDescription?.sdp, this.peerConnection.localDescription?.type)
	                    }
	                }  
	            } catch(err) {
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
	    this.logger.warn('Closing BrowserWebRTCConnection with error: %s', err)
	    if (this.dataChannel) {
	        try {
	            this.dataChannel.close()
	        } catch (e) {
	            this.logger.warn('dc.close() errored: %s', e)
	        }
	    }

	    this.dataChannel = null

	    if (this.peerConnection) {
	        try {
	            this.peerConnection.close()
	        } catch (e) {
	            this.logger.warn('conn.close() errored: %s', e)
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

	    await this.peerConnection?.setRemoteDescription({ sdp:description, type: type as RTCSdpType })
		
	    if (type == "offer" && this.peerConnection) {
	        await this.peerConnection.setLocalDescription()
	        if (this.peerConnection.localDescription)  {
	            this.emitLocalDescription(this.peerConnection.localDescription.sdp, this.peerConnection.localDescription.type )
	        }
	    }
	}

	setRemoteDescription(description: string, type: string): void {
	    this.doSetRemoteDescription(description, type)
	}

	addRemoteCandidate(candidate: string, mid: string): void {
	    this.peerConnection?.addIceCandidate( { candidate: candidate, sdpMid: mid })
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
	        this.logger.warn('dc.onError: %s', err.error.message)
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
	    this.dataChannel = dataChannel
	    this.emitOpen()
	}
}