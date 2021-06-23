import { EventEmitter } from 'events'
import StrictEventEmitter from 'strict-event-emitter-types'
import { Logger } from '../helpers/Logger'
import { PeerInfo } from './PeerInfo'
import { MessageQueue, QueueItem } from './MessageQueue'
import { NameDirectory } from '../NameDirectory'

export interface ConstructorOptions {
    selfId: string
    targetPeerId: string
    routerId: string
    stunUrls: string[]
    bufferThresholdLow?: number
    bufferThresholdHigh?: number
    maxMessageSize?: number
    newConnectionTimeout?: number
    maxPingPongAttempts?: number
    pingInterval?: number
    flushRetryTimeout?: number
    messageQueue: MessageQueue<string>
    deferredConnectionAttempt: DeferredConnectionAttempt
}

let ID = 0

/**
 * Strict types for EventEmitter interface.
 */
interface Events {
    localDescription: (type: any, description: string) => void
    localCandidate: (candidate: string, mid: string) => void
    open: () => void
    message: (msg: string)  => void
    close: (err?: Error) => void
    error: (err: Error) => void
    bufferLow: () => void
    bufferHigh: () => void
}

// reminder: only use Connection emitter for external handlers
// to make it safe for consumers to call removeAllListeners
// i.e. no this.on('event')
export const ConnectionEmitter = EventEmitter as { new(): StrictEventEmitter<EventEmitter, Events> }

export class DeferredConnectionAttempt {
    
    private eventEmitter: EventEmitter
    private connectionAttemptPromise: Promise<string>

    constructor(private targetId: string) {

        this.eventEmitter = new EventEmitter()
        
        this.connectionAttemptPromise = new Promise((resolve, reject) => {
            this.eventEmitter.once('resolve', () => {
                resolve(this.targetId)
            })
            this.eventEmitter.once('reject', (reason) => {
                reject(reason)
            })
        })

        // allow promise to reject without outside catch
        this.connectionAttemptPromise.catch(() => {})
    }

    getPromise(): Promise<string> {
        return this.connectionAttemptPromise
    }

    resolve(): void {
        this.eventEmitter.emit('resolve')
    }

    reject(reason: Error | string): void {
        this.eventEmitter.emit('reject', reason)
    }
}

export function isOffering(myId: string, theirId: string): boolean {
    return myId < theirId
}

export abstract class WebRtcConnection extends ConnectionEmitter {
    public readonly id: string
    private connectionId = 'none'
    private peerInfo: PeerInfo
    private readonly routerId: string
    
    private readonly maxPingPongAttempts: number
    private readonly pingInterval: number
    private readonly flushRetryTimeout: number
    private readonly messageQueue: MessageQueue<string>
   
    private flushRef: NodeJS.Immediate | null
    private flushTimeoutRef: NodeJS.Timeout | null
    private connectionTimeoutRef: NodeJS.Timeout | null
    private pingTimeoutRef: NodeJS.Timeout | null
    private deferredConnectionAttempt: DeferredConnectionAttempt | null
    private isFinished: boolean

    protected readonly logger: Logger
    protected readonly maxMessageSize: number
    protected readonly selfId: string
    protected readonly stunUrls: string[]
    protected readonly newConnectionTimeout: number
    protected lastState: string | null
    protected lastGatheringState: string | null
    protected paused: boolean
    protected readonly bufferThresholdHigh: number
    protected readonly bufferThresholdLow: number
    protected pingAttempts = 0
    protected rtt: number | null
    protected rttStart: number | null

    constructor({
        selfId,
        targetPeerId,
        routerId,
        stunUrls,
        messageQueue,
        deferredConnectionAttempt,
        bufferThresholdHigh = 2 ** 17,
        bufferThresholdLow = 2 ** 15,
        newConnectionTimeout = 15000,
        maxPingPongAttempts = 5,
        pingInterval = 2 * 1000,
        flushRetryTimeout = 500,
        maxMessageSize = 1048576,
    }: ConstructorOptions) {
        super()

        ID += 1
        this.id = `Connection${ID}`
        this.selfId = selfId
        this.peerInfo = PeerInfo.newUnknown(targetPeerId)
        this.routerId = routerId
        this.stunUrls = stunUrls
        this.bufferThresholdHigh = bufferThresholdHigh
        this.bufferThresholdLow = bufferThresholdLow
        this.maxMessageSize = maxMessageSize
        this.newConnectionTimeout = newConnectionTimeout
        this.maxPingPongAttempts = maxPingPongAttempts
        this.pingInterval = pingInterval
        this.flushRetryTimeout = flushRetryTimeout
        this.messageQueue = messageQueue
        this.deferredConnectionAttempt = deferredConnectionAttempt
        this.logger = new Logger(module, `${NameDirectory.getName(this.getPeerId())}/${ID}`)
        this.isFinished = false

        this.paused = false
        this.lastState = null
        this.lastGatheringState = null

        this.flushTimeoutRef = null
        this.connectionTimeoutRef = null
        this.pingTimeoutRef = setTimeout(() => this.ping(), this.pingInterval)
        this.flushRef = null

        this.rtt = null
        this.rttStart = null

        this.logger.trace('create %o', {
            selfId: this.selfId,
            messageQueue: this.messageQueue.size(),
            peerInfo: this.peerInfo,
        })
    }

    connect(): void {
        if (this.isFinished) {
            throw new Error('Connection already closed.')
        }
        this.doConnect()
        this.connectionTimeoutRef = setTimeout(() => {
            if (this.isFinished) { return }
            this.logger.warn(`connection timed out after ${this.newConnectionTimeout}ms`)
            this.close(new Error(`timed out after ${this.newConnectionTimeout}ms`))
        }, this.newConnectionTimeout)
    }

    getDeferredConnectionAttempt(): DeferredConnectionAttempt | null {
        return this.deferredConnectionAttempt
    }

    stealDeferredConnectionAttempt(): DeferredConnectionAttempt | null {
        const att = this.deferredConnectionAttempt
        this.deferredConnectionAttempt = null
        return att
    }

    close(err?: Error): void {
        if (this.isFinished) {
            // already closed, noop
            return
        }
        this.isFinished = true

        if (err) {
            this.logger.warn('conn.close(): %s', err)
        } else {
            this.logger.trace('conn.close()')
        }

        if (this.flushRef) {
            clearImmediate(this.flushRef)
        }
        if (this.flushTimeoutRef) {
            clearTimeout(this.flushTimeoutRef)
        }
        if (this.connectionTimeoutRef) {
            clearTimeout(this.connectionTimeoutRef)
        }
        if (this.pingTimeoutRef) {
            clearTimeout(this.pingTimeoutRef)
        }
        
        this.flushTimeoutRef = null
        this.connectionTimeoutRef = null
        this.pingTimeoutRef = null
        this.flushRef = null

        try {
            this.doClose(err)
        } catch(e) {
            this.logger.warn(`doClose (subclass) threw: %s`, e)
        }

        if (err) {
            this.emitClose(err)
            return
        }
        this.emitClose('closed')
    }

    protected emitClose(reason: Error | string): void {
        if (this.deferredConnectionAttempt) {
            const def = this.deferredConnectionAttempt
            this.deferredConnectionAttempt = null
            def.reject(reason)
        }
        this.emit('close')
    }

    getConnectionId(): string {
        return this.connectionId
    }

    setConnectionId(id: string): void {
        this.connectionId = id
    }

    send(message: string): Promise<void> {
        this.setFlushRef()
        return this.messageQueue.add(message)
    }

    protected setFlushRef(): void {
        if (this.flushRef === null) {
            this.flushRef = setImmediate(() => {
                this.flushRef = null
                this.attemptToFlushMessages()
            })
        }
    }

    setPeerInfo(peerInfo: PeerInfo): void {
        this.peerInfo = peerInfo
    }

    getPeerInfo(): PeerInfo {
        return this.peerInfo
    }

    getPeerId(): string {
        return this.peerInfo.peerId
    }

    getRtt(): number | null {
        return this.rtt
    }

    getLastState(): string | null {
        return this.lastState
    }

    ping(): void {
        if (this.isFinished) {
            return
        }
        if (this.isOpen()) {
            if (this.pingAttempts >= this.maxPingPongAttempts) {
                this.logger.warn(`failed to receive any pong after ${this.maxPingPongAttempts} ping attempts, closing connection`)
                this.close(new Error('pong not received'))
            } else {
                this.rttStart = Date.now()
                try {
                    if (this.isOpen()) {
                        this.doSendMessage('ping')
                    }
                } catch (e) {
                    this.logger.warn(`failed to send ping to ${this.peerInfo.peerId} with error: ${e}`)
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
            this.logger.warn(`failed to send pong to ${this.peerInfo.peerId} with error: ${e}`)
        }
    }

    getQueueSize(): number {
        return this.messageQueue.size()
    }

    isOffering(): boolean {
        return isOffering(this.selfId, this.peerInfo.peerId)
    }
   
    private attemptToFlushMessages(): void {
        let numOfSuccessSends = 0
        while (!this.isFinished && !this.messageQueue.empty() && this.isOpen()) {
            // Max 10 messages sent in busy-loop, then relinquish control for a moment, in case `dc.send` is blocking
            // (is it?)
            if (numOfSuccessSends >= 10) {
                this.setFlushRef()
                return
            }

            const queueItem = this.messageQueue.peek()
            if (queueItem.isFailed()) {
                this.logger.debug('popping failed queue item: %o', queueItem, numOfSuccessSends)
                this.messageQueue.pop()
            } else if (queueItem.getMessage().length > this.getMaxMessageSize())  {
                const errorMessage = 'Dropping message due to size '
                    + queueItem.getMessage().length
                    + ' exceeding the limit of '
                    + this.getMaxMessageSize()
                queueItem.immediateFail(errorMessage)
                this.logger.warn(errorMessage)
                this.messageQueue.pop()
            } else if (this.paused || this.getBufferedAmount() >= this.bufferThresholdHigh) {
                if (!this.paused) {
                    this.paused = true
                    this.emit('bufferHigh')
                }
                return // method eventually re-scheduled by `onBufferedAmountLow`
            } else {
                let sent = false
                let isOpen
                try {
                    // this.isOpen() is checked immediately after the call to node-datachannel.sendMessage() as if
                    // this.isOpen() returns false after a "successful" send, the message is lost with a near 100% chance.
                    // This does not work as expected if this.isOpen() is checked before sending a message
                    sent = this.isOpen() && this.doSendMessage(queueItem.getMessage())
                    isOpen = this.isOpen()
                    sent = sent && isOpen
                } catch (e) {
                    this.processFailedMessage(queueItem, e)
                    return // method rescheduled by `this.flushTimeoutRef`
                }

                if (sent) {
                    this.messageQueue.pop()
                    queueItem.delivered()
                    numOfSuccessSends += 1
                } else {
                    this.logger.debug('queue item was not sent: %o', {
                        wasOpen: isOpen,
                        numOfSuccessSends,
                        queueItem,
                        messageQueueSize: this.messageQueue.size(),
                    })
                    this.processFailedMessage(queueItem, new Error('sendMessage returned false'))
                }
            }
        }
    }

    private processFailedMessage(queueItem: QueueItem<any>, e: Error): void {
        queueItem.incrementTries({
            error: e.toString(),
            'connection.iceConnectionState': this.lastGatheringState,
            'connection.connectionState': this.lastState
        })
        if (queueItem.isFailed()) {
            const infoText = queueItem.getErrorInfos().map((i) => JSON.stringify(i)).join('\n\t')
            this.logger.warn('failed to send message after %d tries due to\n\t%s',
                MessageQueue.MAX_TRIES,
                infoText)
            this.messageQueue.pop()
        }
        if (this.flushTimeoutRef === null) {
            this.flushTimeoutRef = setTimeout(() => {
                this.flushTimeoutRef = null
                this.attemptToFlushMessages()
            }, this.flushRetryTimeout)
        }
    }
    
    abstract setRemoteDescription(description: string, type: string): void
    abstract addRemoteCandidate(candidate: string, mid: string): void
    abstract getBufferedAmount(): number
    abstract getMaxMessageSize(): number
    abstract isOpen(): boolean
    protected abstract doConnect(): void
    protected abstract doClose(err?: Error): void

    /**
     * Invoked when a message is ready to be sent. Connectivity is ensured
     * with a check to `isOpen` before invocation.
     * @param message - mesasge to be sent
     * @return return false if the message could not be delivered
     */
    protected abstract doSendMessage(message: string): boolean

    /**
     * Subclass should call this method when the connection has opened!
     */
    protected emitOpen(): void {
        if (this.connectionTimeoutRef !== null) {
            clearTimeout(this.connectionTimeoutRef)
        }
        if (this.deferredConnectionAttempt) {
            const def = this.deferredConnectionAttempt
            this.deferredConnectionAttempt = null
            def.resolve()
        }
        this.setFlushRef()
        this.emit('open')
    }

    /**
     * Forcefully restart the connection timeout (e.g. on state change) from subclass.
     */
    protected restartConnectionTimeout(): void {
        clearTimeout(this.connectionTimeoutRef!)
        this.connectionTimeoutRef = setTimeout(() => {
            if (this.isFinished) { return }
            this.logger.warn(`connection timed out after ${this.newConnectionTimeout}ms`)
            this.close(new Error(`timed out after ${this.newConnectionTimeout}ms`))
        }, this.newConnectionTimeout)
    }
}
