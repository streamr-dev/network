import { EventEmitter } from 'events'
import { Logger } from '../helpers/Logger'
import { NameDirectory } from '../NameDirectory'
import { PeerInfo } from './PeerInfo'
import StrictEventEmitter from 'strict-event-emitter-types'
import { DisconnectionCode, DisconnectionReason } from './IWsEndpoint'
import { DeferredConnectionAttempt } from './DeferredConnectionAttempt'


const HIGH_BACK_PRESSURE = 1024 * 1024 * 2
const LOW_BACK_PRESSURE = 1024 * 1024
const WS_BUFFER_SIZE = HIGH_BACK_PRESSURE + 1024 // add 1 MB safety margin

let ID = 0

export interface ConstructorOptions {
	selfAddress: string
	selfPeerInfo: PeerInfo
	targetPeerAddress: string


	bufferThresholdLow?: number
	bufferThresholdHigh?: number
	maxMessageSize?: number
	newConnectionTimeout?: number
	maxPingPongAttempts?: number
	pingInterval?: number
	flushRetryTimeout?: number

	deferredConnectionAttempt: DeferredConnectionAttempt | null
}

/**
 * Strict types for EventEmitter interface.
 */
interface Events {
	open: () => void
	message: (msg: string) => void
	close: (code: DisconnectionCode, reason: DisconnectionReason) => void
	error: (err: Error) => void
	highBackPressure: () => void
	lowBackPressure: () => void
}

// reminder: only use Connection emitter for external handlers
// to make it safe for consumers to call removeAllListeners
// i.e. no this.on('event')
export const ConnectionEmitter = EventEmitter as { new(): StrictEventEmitter<EventEmitter, Events> }

export abstract class WebSocketConnection extends ConnectionEmitter {

	private readonly baseLogger: Logger
	private peerInfo: PeerInfo | null = null
	private highBackPressure = false
	protected isFinished: boolean
	private deferredConnectionAttempt: DeferredConnectionAttempt | null
	private readonly maxPingPongAttempts: number
    private readonly pingInterval: number
	private pingTimeoutRef: NodeJS.Timeout | null
    private pingAttempts = 0
    private rtt: number | null
    private rttStart: number | null

	protected readonly id: string
	protected readonly selfAddress: string
	protected readonly selfPeerInfo: PeerInfo
	protected readonly targetPeerAddress: string

	constructor({ selfAddress, 
				selfPeerInfo, 
				targetPeerAddress, 
				deferredConnectionAttempt,
				maxPingPongAttempts = 5,
				pingInterval = 2 * 1000}: ConstructorOptions) {
		super()

		ID += 1
		this.id = `Connection${ID}`
		this.baseLogger = new Logger(module, `${NameDirectory.getName(this.getPeerId())}/${ID}`)
		this.isFinished = false

		this.selfAddress = selfAddress
		this.selfPeerInfo = selfPeerInfo
		this.targetPeerAddress = targetPeerAddress
		this.maxPingPongAttempts = maxPingPongAttempts
        this.pingInterval = pingInterval
		this.pingTimeoutRef = null
        
        this.rtt = null
        this.rttStart = null
		this.deferredConnectionAttempt = deferredConnectionAttempt

	}

	getPeerAddress(): string {
		return this.targetPeerAddress
	}

	async send(message: string): Promise<void> {
		this.doSendMessage(message)
		this.evaluateBackPressure()
	}

	protected evaluateBackPressure(): void {
		const bufferedAmount = this.getBufferedAmount()

		if (!this.highBackPressure && bufferedAmount > HIGH_BACK_PRESSURE) {
			this.baseLogger.trace('Back pressure HIGH for %s at %d', this.peerInfo, bufferedAmount)
			this.emitHighBackpressure()
			this.highBackPressure = true
		} else if (this.highBackPressure && bufferedAmount < LOW_BACK_PRESSURE) {
			this.baseLogger.trace('Back pressure LOW for %s at %d', this.peerInfo, bufferedAmount)
			this.emitLowBackpressure()
			this.highBackPressure = false
		}
	}

	getPeerInfo(): PeerInfo | null {
		return this.peerInfo
	}

	getPeerId(): string {
		return '' + this.peerInfo?.peerId
	}

	getDeferredConnectionAttempt(): DeferredConnectionAttempt | null {
		return this.deferredConnectionAttempt
	}

	ping(): void {
		if (this.isFinished) {
			return
		}
		if (this.isOpen()) {
			if (this.pingAttempts >= this.maxPingPongAttempts) {
				this.baseLogger.warn(`failed to receive any pong after ${this.maxPingPongAttempts} ping attempts, closing connection`)
				this.close(DisconnectionCode.DEAD_CONNECTION, DisconnectionReason.DEAD_CONNECTION)
			} else {
				this.rttStart = Date.now()
				try {
					if (this.isOpen()) {
						this.doSendMessage('ping')
					}
				} catch (e) {
					this.baseLogger.warn(`failed to send ping to ${this.selfPeerInfo.peerId} with error: ${e}`)
				}
				this.pingAttempts += 1
			}
		}
		if (this.pingTimeoutRef) {
			clearTimeout(this.pingTimeoutRef)
		}
		this.pingTimeoutRef = setTimeout(() => this.ping(), this.pingInterval)
	}

	pong(): void {
		if (this.isFinished) {
			return
		}
		try {
			if (this.isOpen()) {
				this.doSendMessage('pong')
			}
		} catch (e) {
			this.baseLogger.warn(`failed to send pong to ${this.selfPeerInfo.peerId} with error: ${e}`)
		}
	}

	getRtt(): number | null  {
		return this.rtt
	}

	protected setPeerInfo(info: PeerInfo) {
		this.peerInfo = info
	}

	/**
	 * Subclass should call this method when the connection has opened.
	*/

	protected emitOpen(peerInfo: PeerInfo): void {
		this.peerInfo = peerInfo
		if (this.deferredConnectionAttempt) {
			const def = this.deferredConnectionAttempt
			this.deferredConnectionAttempt = null
			def.resolve(peerInfo.peerId)
		}
		this.ping()
		this.emit('open')
	}

	/**
	 * Subclass should call this method when it has received a message.
	 */
	protected emitMessage(msg: string): void {
		if (msg == 'ping') {
			this.pong()
		} else if (msg == 'pong') {
			this.pingAttempts = 0
			this.rtt = Date.now() - this.rttStart!
		} else {
			this.emit('message', msg)
		}
	}

	/**
	 * Subclass should call this method when backpressure has reached low watermark.
	 */
	protected emitLowBackpressure(): void {
		this.emit('lowBackPressure')
	}

	/**
	 * Subclass should call this method when backpressure has reached low watermark.
	 */
	protected emitHighBackpressure(): void {
		this.emit('highBackPressure')
	}

	protected emitError(error: Error): void {

		this.emit('error', error)
	}

	private emitClose(code: DisconnectionCode, reason: DisconnectionReason): void {
		if (this.deferredConnectionAttempt) {
			const def = this.deferredConnectionAttempt
			this.deferredConnectionAttempt = null
			def.reject(reason)
		}
		this.emit('close', code, reason)
	}

	close(code: DisconnectionCode, reason: DisconnectionReason): void {
		if (this.isFinished) {
			// already closed, noop
			return
		}
		this.isFinished = true

		this.baseLogger.trace('conn.close() %s %s', code, reason)

		if (this.pingTimeoutRef) {
            clearTimeout(this.pingTimeoutRef)
			this.pingTimeoutRef = null
		}

		try {
			this.doClose(code, reason)
		} catch (e) {
			this.baseLogger.warn(`doClose (subclass) threw: %s`, e)
		}


		this.emitClose(code, reason)
	}

	protected abstract doSendMessage(message: string): Promise<void>
	abstract getBufferedAmount(): number
	protected abstract doClose(code: DisconnectionCode, reason: DisconnectionReason): void
	abstract isOpen(): boolean
	abstract getReadyState(): number | undefined
}