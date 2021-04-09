import nodeDataChannel, { DataChannel, DescriptionType, LogLevel, PeerConnection } from 'node-datachannel'
import { Logger } from '../helpers/Logger'
import { PeerInfo } from './PeerInfo'
import { MessageQueue, QueueItem } from './MessageQueue'

nodeDataChannel.initLogger("Error" as LogLevel)

export interface ConstructorOptions {
    selfId: string
    targetPeerId: string
    routerId: string
    isOffering: boolean
    stunUrls: string[]
    bufferThresholdLow?: number
    bufferThresholdHigh?: number
    newConnectionTimeout?: number
    maxPingPongAttempts?: number
    pingInterval?: number
    flushRetryTimeout?: number
    onLocalDescription: (type: DescriptionType, description: string) => void
    onLocalCandidate: (candidate: string, mid: string) => void
    onOpen: () => void
    onMessage: (msg: string)  => void
    onClose: (err?: Error) => void
    onError: (err: Error) => void,
    onBufferLow: () => void,
    onBufferHigh: () => void
}

export class Connection {
    private readonly selfId: string
    private peerInfo: PeerInfo
    private readonly routerId: string
    private readonly isOffering: boolean
    private readonly stunUrls: string[]
    private readonly bufferThresholdHigh: number
    private readonly bufferThresholdLow: number
    private readonly newConnectionTimeout: number
    private readonly maxPingPongAttempts: number
    private readonly pingInterval: number
    private readonly flushRetryTimeout: number
    private readonly onLocalDescription: (type: DescriptionType, description: string) => void
    private readonly onLocalCandidate: (candidate: string, mid: string) => void
    private readonly onOpen: () => void
    private readonly onMessage: (msg: string)  => void
    private readonly onClose: (err?: Error) => void
    private readonly onError: (err: Error) => void
    private readonly onBufferLow: () => void
    private readonly onBufferHigh: () => void
    private readonly logger: Logger
    private readonly messageQueue: MessageQueue<string>

    private connection: PeerConnection | null
    private dataChannel: DataChannel | null
    private paused: boolean
    private lastState: string | null
    private lastGatheringState: string | null
    private flushTimeoutRef: NodeJS.Timeout | null
    private connectionTimeoutRef: NodeJS.Timeout | null
    private pingTimeoutRef: NodeJS.Timeout | null
    private flushRef: NodeJS.Immediate | null
    private pingAttempts = 0
    private rtt: number | null
    private respondedPong: boolean
    private rttStart: number | null

    constructor({
        selfId,
        targetPeerId,
        routerId,
        isOffering,
        stunUrls,
        bufferThresholdHigh = 2 ** 17,
        bufferThresholdLow = 2 ** 15,
        newConnectionTimeout = 8000,
        maxPingPongAttempts = 5,
        pingInterval = 2 * 1000,
        flushRetryTimeout = 500,
        onLocalDescription,
        onLocalCandidate,
        onOpen,
        onMessage,
        onClose,
        onError,
        onBufferLow,
        onBufferHigh
    }: ConstructorOptions) {
        this.selfId = selfId
        this.peerInfo = PeerInfo.newUnknown(targetPeerId)
        this.routerId = routerId
        this.isOffering = isOffering
        this.stunUrls = stunUrls
        this.bufferThresholdHigh = bufferThresholdHigh
        this.bufferThresholdLow = bufferThresholdLow
        this.newConnectionTimeout = newConnectionTimeout
        this.maxPingPongAttempts = maxPingPongAttempts
        this.pingInterval = pingInterval
        this.flushRetryTimeout = flushRetryTimeout
        this.logger = new Logger(['connection', 'Connection', `${this.selfId}-->${this.getPeerId()}`])

        this.messageQueue = new MessageQueue<string>(this.logger)
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
        this.respondedPong = true
        this.rttStart = null

        this.onLocalDescription = onLocalDescription
        this.onLocalCandidate = onLocalCandidate
        this.onClose = onClose
        this.onMessage = onMessage
        this.onOpen = onOpen
        this.onError = onError
        this.onBufferLow = onBufferLow
        this.onBufferHigh = onBufferHigh
    }

    connect(): void {
        this.connection = new nodeDataChannel.PeerConnection(this.selfId, {
            iceServers: this.stunUrls
        })
        this.connection.onStateChange((state) => {
            this.lastState = state
            this.logger.debug('conn.onStateChange: %s', state)
            if (state === 'disconnected' || state === 'closed') {
                this.close()
            } if (state === 'connecting' && !this.connectionTimeoutRef) {
                this.connectionTimeoutRef = setTimeout(() => {
                    this.logger.warn('connection timed out')
                    this.close(new Error('timed out'))
                }, this.newConnectionTimeout)
            }
        })
        this.connection.onGatheringStateChange((state) => {
            this.lastGatheringState = state
            this.logger.debug('conn.onGatheringStateChange: %s', state)
        })
        this.connection.onLocalDescription((description, type: DescriptionType) => {
            this.onLocalDescription(type, description)
        })
        this.connection.onLocalCandidate((candidate, mid) => {
            this.onLocalCandidate(candidate, mid)
        })

        if (this.isOffering) {
            const dataChannel = this.connection.createDataChannel('streamrDataChannel')
            this.setupDataChannel(dataChannel)
        } else {
            this.connection.onDataChannel((dataChannel) => {
                this.setupDataChannel(dataChannel)
                this.logger.debug('connection.onDataChannel')
                this.openDataChannel(dataChannel)
            })
        }

        this.connectionTimeoutRef = setTimeout(() => {
            this.logger.warn('connection timed out')
            this.close(new Error('timed out'))
        }, this.newConnectionTimeout)
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
        if (this.dataChannel) {
            try {
                this.dataChannel.close()
            } catch (e) {
                this.logger.warn('dc.close() errored: %s', e)
            }
        }
        if (this.connection) {
            try {
                this.connection.close()
            } catch (e) {
                this.logger.warn('conn.close() errored: %s', e)
            }
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
            this.onError(err)
        }
        this.onClose()
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
        setTimeout(() => this.ping(), this.pingInterval)
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

    private setupDataChannel(dataChannel: DataChannel): void {
        this.paused = false
        dataChannel.setBufferedAmountLowThreshold(this.bufferThresholdLow)
        if (this.isOffering) {
            dataChannel.onOpen(() => {
                this.logger.debug('dc.onOpen')
                this.openDataChannel(dataChannel)
            })
        }
        dataChannel.onClosed(() => {
            this.logger.debug('dc.onClosed')
            this.close()
        })
        dataChannel.onError((e) => {
            this.logger.warn('dc.onError: %s', e)
        })
        dataChannel.onBufferedAmountLow(() => {
            if (this.paused) {
                this.paused = false
                this.setFlushRef()
                this.onBufferLow()
            }
        })
        dataChannel.onMessage((msg) => {
            this.logger.debug('dc.onmessage')
            if (msg === 'ping') {
                this.pong()
            } else if (msg === 'pong') {
                this.pingAttempts = 0
                this.rtt = Date.now() - this.rttStart!
            } else {
                this.onMessage(msg.toString()) // TODO: what if we get binary?
            }
        })
    }

    private openDataChannel(dataChannel: DataChannel): void {
        if (this.connectionTimeoutRef !== null) {
            clearInterval(this.connectionTimeoutRef)
        }
        this.dataChannel = dataChannel
        this.setFlushRef()
        this.onOpen()
    }

    private attemptToFlushMessages(): void {
        let numOfSuccessSends = 0
        while (!this.messageQueue.empty() && this.dataChannel != null) {
            // Max 10 messages sent in busy-loop, then relinquish control for a moment, in case `dc.send` is blocking
            // (is it?)
            if (numOfSuccessSends >= 10) {
                this.setFlushRef()
                return
            }

            const queueItem = this.messageQueue.peek()
            if (queueItem.isFailed()) {
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
                    this.onBufferHigh()
                }
                return // method eventually re-scheduled by `onBufferedAmountLow`
            } else {
                let sent = false
                try {
                    // Checking `this.open()` is left out on purpose. We want the message to be discarded if it was not
                    // sent after MAX_TRIES regardless of the reason.
                    sent = this.dataChannel!.sendMessage(queueItem.getMessage())
                    numOfSuccessSends += 1
                } catch (e) {
                    this.processFailedMessage(queueItem, e)
                    return // method rescheduled by `this.flushTimeoutRef`
                }

                if (sent) {
                    this.messageQueue.pop()
                    queueItem.delivered()
                } else {
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
