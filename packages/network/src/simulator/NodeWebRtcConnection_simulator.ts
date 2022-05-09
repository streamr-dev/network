import { EventEmitter } from 'events'
import { ConstructorOptions, WebRtcConnection } from '../connection/WebRtcConnection'
import { Logger } from "../helpers/Logger"
import { NameDirectory } from "../NameDirectory"
import { WebRtcConnectionFactory } from "../connection/WebRtcEndpoint"
import { Simulator } from "./Simulator"
import { DescriptionType } from 'node-datachannel'

export const webRtcConnectionFactory = new class implements WebRtcConnectionFactory {
    createConnection(opts: ConstructorOptions): WebRtcConnection {
        return new NodeWebRtcConnection(opts)
    }
    registerWebRtcEndpoint(): void {
    }
    unregisterWebRtcEndpoint(): void {
    }
}

export class NodeWebRtcConnection extends WebRtcConnection {
    private readonly logger: Logger
    
    //private connection: PeerConnection | null
    //private dataChannel: DataChannel | null
    
    private dataChannelEmitter?: EventEmitter
    private connectionEmitter?: EventEmitter
    private lastState?: string = 'connecting'
    private lastGatheringState?: string
    private open = false
    private remoteDescriptionSet = false

    constructor(opts: ConstructorOptions) {
        super(opts)

        this.logger = new Logger(module, `${NameDirectory.getName(this.getPeerId())}/${this.id}`)
        Simulator.instance().addWebRtcConnection(this.selfId, this.getPeerId(), this)
    }

    protected doSendMessage(message: string): boolean {
        Simulator.instance().webRtcSend(this.selfId, this.getPeerId(), message)
        return true
        //return this.dataChannel!.sendMessage(message)
    }

    protected doConnect(): void {
        if (this.isOffering()) {
            this.emitLocalDescription("ICE description from " + this.selfId, "ICE Description")
            this.emitLocalCandidate("ICE candidate from "+ this.selfId, "abcdefg")
        }
    }

    setRemoteDescription(_udescription: string, _utype: DescriptionType): void {
        this.remoteDescriptionSet = true
        if (!this.isOffering()) {
            this.emitLocalDescription("ICE description from " + this.selfId, "ICE Description")
            this.emitLocalCandidate("ICE candidate from "+ this.selfId, "abcdefg")
        }
    }

    addRemoteCandidate(_ucandidate: string, _umid: string): void {
        if (this.remoteDescriptionSet) {
            Simulator.instance().webRtcConnect(this.selfId, this.getPeerId())
        }
        else {
            this.logger.warn("Tried setting remoteCandidate before remote description, closing")
            this.close(new Error('Tried setting remoteCandidate before remote description, closing'))
        }
    }

    protected doClose(_err?: Error): void {
        Simulator.instance().webRtcDisconnect(this.selfId, this.getPeerId())
        this.lastState = undefined
        this.lastGatheringState = undefined
        this.open = false
    }

    getBufferedAmount(): number {
        return 0
    }

    getMaxMessageSize(): number {
        return 1024 * 1024
    }
 
    isOpen(): boolean {
        return this.open
    }

    getLastState(): string | undefined {
        return this.lastState
    }

    getLastGatheringState(): string | undefined {
        return this.lastGatheringState
    }

    // called by simulator
    
    public handleIncomingMessage(message: string): void {
        this.logger.trace('dc.onmessage')
        this.emitMessage(message)
    }

    public handleIncomingDisconnection(): void {
        this.logger.trace('dc.onClosed')
        this.close()
    }
    
    public handleIncomingConnection(): void {
        this.open = true
        this.lastState = 'connected'
        this.emitOpen()
    }

}
