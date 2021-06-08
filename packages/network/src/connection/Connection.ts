import EventEmitter from 'events'
import StrictEventEmitter from 'strict-event-emitter-types'
import nodeDataChannel, { DataChannel, DescriptionType, LogLevel, PeerConnection } from 'node-datachannel'
import { Logger } from '../helpers/Logger'
import { PeerInfo } from './PeerInfo'
import { MessageQueue, QueueItem } from './MessageQueue'
import { NameDirectory } from '../NameDirectory'

nodeDataChannel.initLogger("Error" as LogLevel)

export interface ConstructorOptions {
    selfId: string
    targetPeerId: string
    routerId: string
    isOffering: boolean
    stunUrls: string[]
    bufferThresholdLow?: number
    bufferThresholdHigh?: number
    maxMessageSize?: number
    newConnectionTimeout?: number
    maxPingPongAttempts?: number
    pingInterval?: number
    flushRetryTimeout?: number
    messageQueue: MessageQueue<string>
}

let ID = 0

/**
 * Parameters that would be passed to an event handler function
 * e.g.
 * HandlerParameters<SomeClass['onSomeEvent']> will map to the list of
 * parameters that would be passed to `fn` in: `someClass.onSomeEvent(fn)`
 */
type HandlerParameters<T extends (...args: any[]) => any> = Parameters<Parameters<T>[0]>

interface PeerConnectionEvents {
    stateChange: (...args: HandlerParameters<PeerConnection['onStateChange']>) => void
    gatheringStateChange: (...args: HandlerParameters<PeerConnection['onGatheringStateChange']>) => void
    localDescription: (...args: HandlerParameters<PeerConnection['onLocalDescription']>) => void
    localCandidate: (...args: HandlerParameters<PeerConnection['onLocalCandidate']>) => void
    dataChannel: (...args: HandlerParameters<PeerConnection['onDataChannel']>) => void
    error: (err: Error) => void
}

/**
 * Create an EventEmitter that fires appropriate events for
 * each peerConnection.onEvent handler.
 *
 * Wrapping allows us to trivially clear all event handlers.
 * There's no way to reliably stop PeerConnection from running an event handler
 * after you've passed it. Closing a connection doesn't prevent handlers from firing.
 * Replacing handlers with noops doesn't work reliably, it can still fire the old handlers.
 */
function PeerConnectionEmitter(connection: PeerConnection) {
    const emitter: StrictEventEmitter<EventEmitter, PeerConnectionEvents> = new EventEmitter()
    emitter.on('error', () => {}) // noop to prevent unhandled error event
    connection.onStateChange((...args: HandlerParameters<PeerConnection['onStateChange']>) => emitter.emit('stateChange', ...args))
    connection.onGatheringStateChange((...args: HandlerParameters<PeerConnection['onGatheringStateChange']>) => (
        emitter.emit('gatheringStateChange', ...args)
    ))
    connection.onLocalDescription((...args: HandlerParameters<PeerConnection['onLocalDescription']>) => emitter.emit('localDescription', ...args))
    connection.onLocalCandidate((...args: HandlerParameters<PeerConnection['onLocalCandidate']>) => emitter.emit('localCandidate', ...args))
    connection.onDataChannel((...args: HandlerParameters<PeerConnection['onDataChannel']>) => emitter.emit('dataChannel', ...args))
    return emitter
}

interface DataChannelEvents {
    open: (...args: HandlerParameters<DataChannel['onOpen']>) => void
    closed: (...args: HandlerParameters<DataChannel['onClosed']>) => void
    error: (...args: HandlerParameters<DataChannel['onError']>) => void
    bufferedAmountLow: (...args: HandlerParameters<DataChannel['onBufferedAmountLow']>) => void
    message: (...args: HandlerParameters<DataChannel['onMessage']>) => void
}

function DataChannelEmitter(dataChannel: DataChannel) {
    const emitter: StrictEventEmitter<EventEmitter, DataChannelEvents> = new EventEmitter()
    emitter.on('error', () => {}) // noop to prevent unhandled error event
    dataChannel.onOpen((...args: HandlerParameters<DataChannel['onOpen']>) => emitter.emit('open', ...args))
    dataChannel.onClosed((...args: HandlerParameters<DataChannel['onClosed']>) => emitter.emit('closed', ...args))
    dataChannel.onError((...args: HandlerParameters<DataChannel['onError']>) => emitter.emit('error', ...args))
    dataChannel.onBufferedAmountLow((...args: HandlerParameters<DataChannel['onBufferedAmountLow']>) => emitter.emit('bufferedAmountLow', ...args))
    dataChannel.onMessage((...args: HandlerParameters<DataChannel['onMessage']>) => emitter.emit('message', ...args))
    return emitter
}

/**
 * Strict types for EventEmitter interface.
 */
interface Events {
    localDescription: (type: DescriptionType, description: string) => void
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
    
    }

    getPromise(): Promise<string> {
        return this.connectionAttemptPromise
    }

    resolve() {
        this.eventEmitter.emit('resolve')
    }

    reject(reason: any) {
        this.eventEmitter.emit('reject', reason)
    }
}

export class Connection extends ConnectionEmitter {
    public readonly id: string
    private connectionId = 'none'
    private readonly selfId: string
    private peerInfo: PeerInfo
    private isFinished: boolean
    private readonly routerId: string
    private readonly isOffering: boolean
    private readonly stunUrls: string[]
    private readonly bufferThresholdHigh: number
    private readonly bufferThresholdLow: number
    private readonly maxMessageSize: number
    private readonly newConnectionTimeout: number
    private readonly maxPingPongAttempts: number
    private readonly pingInterval: number
    private readonly flushRetryTimeout: number
    private readonly logger: Logger
    private readonly messageQueue: MessageQueue<string>

    private connection: PeerConnection | null
    private dataChannel: DataChannel | null
    private dataChannelEmitter?: EventEmitter
    private connectionEmitter?: EventEmitter
    private paused: boolean
    private lastState: string | null
    private lastGatheringState: string | null
    private flushTimeoutRef: NodeJS.Timeout | null
    private connectionTimeoutRef: NodeJS.Timeout | null
    private pingTimeoutRef: NodeJS.Timeout | null
    private flushRef: NodeJS.Immediate | null
    private pingAttempts = 0
    private rtt: number | null
    private rttStart: number | null
    private deferredConnectionAttempt: DeferredConnectionAttempt | null = null

    constructor({
        selfId,
        targetPeerId,
        routerId,
        isOffering,
        stunUrls,
        messageQueue,
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
        this.isOffering = isOffering
        this.stunUrls = stunUrls
        this.bufferThresholdHigh = bufferThresholdHigh
        this.bufferThresholdLow = bufferThresholdLow
        this.maxMessageSize = maxMessageSize
        this.newConnectionTimeout = newConnectionTimeout
        this.maxPingPongAttempts = maxPingPongAttempts
        this.pingInterval = pingInterval
        this.flushRetryTimeout = flushRetryTimeout
        this.logger = new Logger(module, `${NameDirectory.getName(this.getPeerId())}/${ID}`)
        this.isFinished = false

        this.messageQueue = messageQueue
        this.connection = null
        this.dataChannel = null
        this.paused = false
        this.lastState = null
        this.lastGatheringState = null

        this.flushTimeoutRef = null
        this.connectionTimeoutRef = null
        this.pingTimeoutRef = setTimeout(() => this.ping(), this.pingInterval)
        this.flushRef = null

        this.rtt = null
        this.rttStart = null

        this.onStateChange = this.onStateChange.bind(this)
        this.onLocalCandidate = this.onLocalCandidate.bind(this)
        this.onLocalDescription = this.onLocalDescription.bind(this)
        this.onStateChange = this.onStateChange.bind(this)
        this.onGatheringStateChange = this.onGatheringStateChange.bind(this)
        this.onDataChannel = this.onDataChannel.bind(this)
        this.logger.trace('create %o', {
            selfId: this.selfId,
            messageQueue: this.messageQueue.size(),
            peerInfo: this.peerInfo,
        })
    }

    createDeferredConnectionAttempt(): void {
        this.deferredConnectionAttempt = new DeferredConnectionAttempt(this.peerInfo.peerId)
    }

    setDeferredConnectionAttempt(attempt: DeferredConnectionAttempt | null): void {
        this.deferredConnectionAttempt = attempt
    }

    getDeferredConnectionAttempt(): DeferredConnectionAttempt | null {
        return this.deferredConnectionAttempt
    }

    stealDeferredConnectionAttempt(): DeferredConnectionAttempt | null {
        const att = this.deferredConnectionAttempt
        this.deferredConnectionAttempt = null
        return att
    }

    private emitOpen() {
        if (this.deferredConnectionAttempt) {
            const def = this.deferredConnectionAttempt
            this.deferredConnectionAttempt = null
            def.resolve()
        }
        this.emit('open')
    }

    private emitClose(reason: any) {
        if (this.deferredConnectionAttempt) {
            const def = this.deferredConnectionAttempt
            this.deferredConnectionAttempt = null
            def.reject(reason)
        }
        this.emit('close')
    }

    connect(): void {
        if (this.isFinished) {
            throw new Error('Connection already closed.')
        }

        this.connection = new nodeDataChannel.PeerConnection(this.selfId, {
            iceServers: this.stunUrls,
            maxMessageSize: this.maxMessageSize
        })

        this.connectionEmitter = PeerConnectionEmitter(this.connection)

        this.connectionEmitter.on('stateChange', this.onStateChange)
        this.connectionEmitter.on('gatheringStateChange', this.onGatheringStateChange)
        this.connectionEmitter.on('localDescription', this.onLocalDescription)
        this.connectionEmitter.on('localCandidate', this.onLocalCandidate)

        if (this.isOffering) {
            const dataChannel = this.connection.createDataChannel('streamrDataChannel')
            this.setupDataChannel(dataChannel)
        } else {
            this.connectionEmitter.on('dataChannel', this.onDataChannel)
        }

        this.connectionTimeoutRef = setTimeout(() => {
            if (this.isFinished) { return }
            this.logger.warn(`connection timed out after ${this.newConnectionTimeout}ms`)
            this.close(new Error(`timed out after ${this.newConnectionTimeout}ms`))
        }, this.newConnectionTimeout)
    }

    getConnectionId(): string {
        return this.connectionId
    }

    setConnectionId(id: string): void {
        this.connectionId = id
    }

    setRemoteDescription(description: string, type: DescriptionType): void {
        if (this.connection) {
            try {
                this.connection.setRemoteDescription(description, type)
            } catch (err) {
                this.logger.warn('setRemoteDescription failed, reason: %s', err)
            }
        } else {
            this.logger.warn('skipped setRemoteDescription, connection is null')
        }
    }

    addRemoteCandidate(candidate: string, mid: string): void {
        if (this.connection) {
            try {
                this.connection.addRemoteCandidate(candidate, mid)
            } catch (err) {
                this.logger.warn('addRemoteCandidate failed, reason: %s', err)
            }
        } else {
            this.logger.warn('skipped addRemoteCandidate, connection is null')
        }
    }

    send(message: string): Promise<void> {
        this.setFlushRef()
        return this.messageQueue.add(message)
    }

    private setFlushRef() {
        if (this.flushRef === null) {
            this.flushRef = setImmediate(() => {
                this.flushRef = null
                this.attemptToFlushMessages()
            })
        }
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

        if (this.connectionEmitter) {
            this.connectionEmitter.removeAllListeners()
        }

        if (this.dataChannelEmitter) {
            this.dataChannelEmitter.removeAllListeners()
        }

        if (this.connection) {
            try {
                this.connection.close()
            } catch (e) {
                this.logger.warn('conn.close() errored: %s', e)
            }
        }

        if (this.dataChannel) {
            try {
                this.dataChannel.close()
            } catch (e) {
                this.logger.warn('dc.close() errored: %s', e)
            }
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
        this.dataChannel = null
        this.connection = null
        this.flushTimeoutRef = null
        this.connectionTimeoutRef = null
        this.pingTimeoutRef = null
        this.flushRef = null

        if (err) {
            this.emitClose(err)
            return
        }
        this.emitClose('closed')
    }

    ping(): void {
        if (this.isOpen()) {
            if (this.pingAttempts >= this.maxPingPongAttempts) {
                this.logger.warn(`failed to receive any pong after ${this.maxPingPongAttempts} ping attempts, closing connection`)
                this.close(new Error('pong not received'))
            } else {
                this.rttStart = Date.now()
                try {
                    this.dataChannel!.sendMessage('ping')
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
        try {
            this.dataChannel!.sendMessage('pong')
        } catch (e) {
            this.logger.warn(`failed to send pong to ${this.peerInfo.peerId} with error: ${e}`)
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

    getBufferedAmount(): number {
        try {
            return this.dataChannel!.bufferedAmount().valueOf()
        } catch (err) {
            return 0
        }
    }

    getMaxMessageSize(): number {
        try {
            return this.dataChannel!.maxMessageSize().valueOf()
        } catch (err) {
            return 1024 * 1024
        }
    }

    getQueueSize(): number {
        return this.messageQueue.size()
    }

    isOpen(): boolean {
        try {
            return this.dataChannel!.isOpen()
        } catch (err) {
            return false
        }
    }

    private onStateChange(state: string): void {
        this.logger.trace('conn.onStateChange: %s -> %s', this.lastState, state)

        this.lastState = state

        if (state === 'disconnected' || state === 'closed') {
            this.close()
        } else if (state === 'failed') {
            this.close(new Error('connection failed'))
        } else if (state === 'connecting') {
            // reset timeout on connecting
            clearTimeout(this.connectionTimeoutRef!)
            this.connectionTimeoutRef = setTimeout(() => {
                if (this.isFinished) { return }
                this.logger.warn(`connection timed out after ${this.newConnectionTimeout}ms`)
                this.close(new Error(`timed out after ${this.newConnectionTimeout}ms`))
            }, this.newConnectionTimeout)
        }
    }

    private onGatheringStateChange(state: string): void {
        this.logger.trace('conn.onGatheringStateChange: %s -> %s', this.lastGatheringState, state)
        this.lastGatheringState = state
    }

    private onDataChannel(dataChannel: DataChannel): void {
        this.setupDataChannel(dataChannel)
        this.logger.trace('connection.onDataChannel')
        this.openDataChannel(dataChannel)
    }

    private onLocalDescription(description: string, type: DescriptionType): void {
        this.emit('localDescription', type, description)
    }

    private onLocalCandidate(candidate: string, mid: string): void {
        this.emit('localCandidate', candidate, mid)
    }

    private setupDataChannel(dataChannel: DataChannel): void {
        this.paused = false
        this.dataChannelEmitter = DataChannelEmitter(dataChannel)
        dataChannel.setBufferedAmountLowThreshold(this.bufferThresholdLow)
        this.dataChannelEmitter.on('open', () => {
            this.logger.trace('dc.onOpen')
            this.openDataChannel(dataChannel)
        })

        this.dataChannelEmitter.on('closed', () => {
            this.logger.trace('dc.onClosed')
            this.close()
        })

        this.dataChannelEmitter.on('error', (err) => {
            this.logger.warn('dc.onError: %s', err)
        })

        this.dataChannelEmitter.on('bufferedAmountLow', () => {
            if (!this.paused) { return }
            this.paused = false
            this.setFlushRef()
            this.emit('bufferLow')
        })

        this.dataChannelEmitter.on('message', (msg) => {
            this.logger.trace('dc.onmessage')
            if (msg === 'ping') {
                this.pong()
            } else if (msg === 'pong') {
                this.pingAttempts = 0
                this.rtt = Date.now() - this.rttStart!
            } else {
                this.emit('message', msg.toString()) // TODO: what if we get binary?
            }
        })
    }

    private openDataChannel(dataChannel: DataChannel): void {
        if (this.connectionTimeoutRef !== null) {
            clearTimeout(this.connectionTimeoutRef)
        }
        this.dataChannel = dataChannel
        this.setFlushRef()
        this.emitOpen()
    }

    private attemptToFlushMessages(): void {
        let numOfSuccessSends = 0
        while (!this.isFinished && !this.messageQueue.empty() && this.dataChannel != null) {
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
                    sent = this.dataChannel!.sendMessage(queueItem.getMessage())
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
}
