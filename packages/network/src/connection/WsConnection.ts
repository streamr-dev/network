import { ConstructorOptions } from './WebSocketConnection'
import WebSocket from 'ws'
import { PeerInfo, PeerType } from './PeerInfo'
import { Logger } from '../helpers/Logger'
import { NameDirectory } from '../NameDirectory'
import { DisconnectionCode, DisconnectionReason } from './IWsEndpoint'
import { ClientWebSocketConnection } from './ClientWebSocketConnection'
import { ClientWebSocketConnectionFactory } from './WebSocketEndpoint'

export const WsConnectionFactory: ClientWebSocketConnectionFactory = Object.freeze({
    createConnection(opts: ConstructorOptions): ClientWebSocketConnection {
        return new WsConnection(opts)
    }
})

export class WsConnection extends ClientWebSocketConnection {

	private logger: Logger
	private ws: WebSocket | null = null

	constructor(opts: ConstructorOptions) {
	    super(opts)
	    this.logger = new Logger(module, `${NameDirectory.getName(this.getPeerId())}/${this.id}`)
	}

	private toHeaders(peerInfo: PeerInfo): { [key: string]: string } {
	    return {
	        'streamr-peer-id': peerInfo.peerId
	    }
	}

	doConnect(): void {
		if (this.isFinished) {
			throw new Error('Connection already closed.')
		}
		try {
			let serverPeerInfo: PeerInfo
			const ws = new WebSocket(`${this.targetPeerAddress}/ws?address=${this.selfAddress}`, { headers: this.toHeaders(this.selfPeerInfo) })

			ws.on('upgrade', (res) => {
				const peerId = res.headers['streamr-peer-id'] as string

				if (peerId) {
					serverPeerInfo = PeerInfo.newTracker(peerId)
				} else {
					this.logger.debug('Invalid message headers received on upgrade: ' + res)
				}
			})

			ws.once('open', () => {
				if (!serverPeerInfo) {
					this.close(DisconnectionCode.MISSING_REQUIRED_PARAMETER, DisconnectionReason.MISSING_REQUIRED_PARAMETER)
				} else {
					this.emitOpen(serverPeerInfo)
				}
			})

			ws.on('error', (err) => {

				this.logger.trace('failed to connect to %s, error: %o', this.targetPeerAddress, err)
				this.emitError(err)
			})

			ws.on('message', (message: string | Buffer | Buffer[]) => {
				// TODO check message.type [utf8|binary]
				// toString() needed for SSL connections as message will be Buffer instead of String

				this.emitMessage(message.toString())
			})

	        this.ws = ws

	    } catch (err) {
	        this.logger.trace('failed to connect to %s, error: %o', this.targetPeerAddress, err)
	        this.emitError(err)
	    }
	}

	protected doClose(code: DisconnectionCode, reason: DisconnectionReason): void {
	    try {
	        this.ws?.close(code, reason)
	    } catch (e) {
	        this.logger.error('failed to close ws, reason: %s', e)
	    }
	}

	protected doSendMessage(message: string): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			if (!this.ws) {
				reject('ws was null')
			} else {

				this.ws.send(message, (err) => {
					if (err) {
						this.logger.error("error sending ws message " + err)
						reject(err)
					} else {
						resolve()
					}
				})
			}
		})
	}

	getBufferedAmount(): number {
	    if (this.ws)
	        {return this.ws?.bufferedAmount}
	    return 0
	}

	isOpen(): boolean {
	    if (!this.ws || this.ws.readyState != this.ws.OPEN) {
	        return false
	    } else {
	        return true
	    }
	}

	getReadyState(): number | undefined {
		return this.ws?.readyState
	}
}