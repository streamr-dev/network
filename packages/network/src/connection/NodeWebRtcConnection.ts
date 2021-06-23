import { EventEmitter } from 'events'
import StrictEventEmitter from 'strict-event-emitter-types'
import nodeDataChannel, { DataChannel, DescriptionType, LogLevel, PeerConnection } from 'node-datachannel'
import { ConstructorOptions, WebRtcConnection } from './WebRtcConnection'

nodeDataChannel.initLogger("Error" as LogLevel)

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

export class NodeWebRtcConnection extends WebRtcConnection {

    private connection: PeerConnection | null
    private dataChannel: DataChannel | null
    private dataChannelEmitter?: EventEmitter
    private connectionEmitter?: EventEmitter
    private lastState?: string
    protected lastGatheringState?: string

    constructor(opts: ConstructorOptions) {
        super(opts)

        this.connection = null
        this.dataChannel = null
        this.onStateChange = this.onStateChange.bind(this)
        this.onLocalCandidate = this.onLocalCandidate.bind(this)
        this.onLocalDescription = this.onLocalDescription.bind(this)
        this.onGatheringStateChange = this.onGatheringStateChange.bind(this)
        this.onDataChannel = this.onDataChannel.bind(this)
        
    }

    protected doSendMessage(message: string): boolean {
        return this.dataChannel!.sendMessage(message)
    }

    protected doConnect(): void {
        this.connection = new nodeDataChannel.PeerConnection(this.selfId, {
            iceServers: this.stunUrls,
            maxMessageSize: this.maxMessageSize
        })

        this.connectionEmitter = PeerConnectionEmitter(this.connection)

        this.connectionEmitter.on('stateChange', this.onStateChange)
        this.connectionEmitter.on('gatheringStateChange', this.onGatheringStateChange)
        this.connectionEmitter.on('localDescription', this.onLocalDescription)
        this.connectionEmitter.on('localCandidate', this.onLocalCandidate)

        if (this.isOffering()) {
            const dataChannel = this.connection.createDataChannel('streamrDataChannel')
            this.setupDataChannel(dataChannel)
        } else {
            this.connectionEmitter.on('dataChannel', this.onDataChannel)
        }
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

    protected doClose(_err?: Error): void {
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

        this.dataChannel = null
        this.connection = null
        this.lastState = undefined
        this.lastGatheringState = undefined
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
 
    isOpen(): boolean {
        try {
            return this.dataChannel!.isOpen()
        } catch (err) {
            return false
        }
    }

    getLastState(): string | undefined {
        return this.lastState
    }

    getLastGatheringState(): string | undefined {
        return this.lastGatheringState
    }

    private onStateChange(state: string): void {
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
        this.dataChannel = dataChannel
        this.emitOpen()
    }
}
