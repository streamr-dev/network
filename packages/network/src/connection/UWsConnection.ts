import { ConstructorOptions, WebSocketConnection } from "./WebSocketConnection"
import uWS from 'uWebSockets.js'
import { DisconnectionCode, DisconnectionReason } from "./IWsEndpoint"
import { Logger } from "../helpers/Logger"
import { NameDirectory } from "../NameDirectory"
import { PeerInfo } from "./PeerInfo"

function ab2str(buf: ArrayBuffer | SharedArrayBuffer): string {
    return Buffer.from(buf).toString('utf8')
}

export class UWsConnection extends WebSocketConnection {

	private logger: Logger
	private ws: uWS.WebSocket
	private readyState = 1

	constructor(
	    opts: ConstructorOptions,
	    ws: uWS.WebSocket,
	    clientPeerInfo: PeerInfo
	) {
	    super(opts)

	    this.setPeerInfo(clientPeerInfo)
	    this.ws = ws
	    this.logger = new Logger(module, `${NameDirectory.getName(this.getPeerId())}/${this.id}`)
	    this.ping()
	}

	protected doClose(code: DisconnectionCode, reason: DisconnectionReason): void {
	    try {
	        if (this.readyState !=3 ) {
	            this.ws.end(code, reason)
	        	this.readyState = 3
	        }
	    } catch (e) {
	        this.logger.error('failed to terminate ws, reason %s', e)
	    }
	}

	protected async doSendMessage(message: string): Promise<void> {
	    this.ws.send(message)
	}

	getBufferedAmount(): number {
	    return this.ws.getBufferedAmount()
	}

	isOpen(): boolean {
	    if (!this.ws || this.readyState != 1) {
	        return false
	    } else {
	        return true
	    }
	}

	//interface towards UWsServer

	handleMessage(message: ArrayBuffer, _isBinary: boolean): void {
	    this.emitMessage(ab2str(message))
	}

	handleDrain(): void {
	    this.emitLowBackpressure()
	}

	handleClose(code: number, message: ArrayBuffer): void {
	    this.close(code, ab2str(message) as DisconnectionReason)
	}

	handlePong(): void {
	    this.emitMessage('pong')
	}

	getReadyState(): number | undefined {
	    return this.readyState
	}
}