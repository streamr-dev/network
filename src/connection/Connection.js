const Heap = require('heap')
const nodeDataChannel = require('node-datachannel')

const getLogger = require('../helpers/logger')

const { PeerInfo } = require('./PeerInfo')

class QueueItem {
    constructor(message, onSuccess, onError) {
        this.message = message
        this.onSuccess = onSuccess
        this.onError = onError
        this.tries = 0
        this.infos = []
        this.no = QueueItem.nextNumber
        QueueItem.nextNumber += 1
    }

    getMessage() {
        return this.message
    }

    getInfos() {
        return this.infos
    }

    isFailed() {
        return this.tries >= QueueItem.MAX_TRIES
    }

    delivered() {
        this.onSuccess()
    }

    incrementTries(info) {
        this.tries += 1
        this.infos.push(info)
        if (this.isFailed()) {
            this.onError(new Error('Failed to deliver message.'))
        }
    }
}

QueueItem.nextNumber = 0

QueueItem.MAX_TRIES = 10

QueueItem.events = Object.freeze({
    SENT: 'sent',
    FAILED: 'failed'
})

module.exports = class Connection {
    constructor({
        selfId,
        targetPeerId,
        routerId,
        isOffering,
        stunUrls,
        bufferHighThreshold = 2 ** 20,
        bufferLowThreshold = 2 ** 17,
        newConnectionTimeout = 5000,
        maxPingPongAttempts = 5,
        pingPongTimeout = 2000,
        onLocalDescription,
        onLocalCandidate,
        onOpen,
        onMessage,
        onClose,
        onError
    }) {
        this.selfId = selfId
        this.peerInfo = PeerInfo.newUnknown(targetPeerId)
        this.routerId = routerId
        this.isOffering = isOffering
        this.stunUrls = stunUrls
        this.bufferHighThreshold = bufferHighThreshold
        this.bufferLowThreshold = bufferLowThreshold
        this.newConnectionTimeout = newConnectionTimeout
        this.maxPingPongAttempts = maxPingPongAttempts
        this.pingPongTimeout = pingPongTimeout

        this.messageQueue = new Heap((a, b) => a.no - b.no)
        this.connection = null
        this.dataChannel = null
        this.paused = false
        this.lastState = null
        this.lastGatheringState = null

        this.flushTimeoutRef = null
        this.connectionTimeoutRef = null
        this.peerPingTimeoutRef = null
        this.peerPongTimeoutRef = null

        this.rtt = null
        this.respondedPong = true
        this.rttStart = null

        this.onLocalDescription = onLocalDescription
        this.onLocalCandidate = onLocalCandidate
        this.onClose = onClose
        this.onMessage = onMessage
        this.onOpen = onOpen
        this.onError = onError

        this.logger = getLogger(`streamr:WebRtc:Connection(${this.selfId}-->${this.getPeerId()})`)
    }

    connect() {
        this.connection = new nodeDataChannel.PeerConnection(this.selfId, {
            iceServers: this.stunUrls
        })
        this.connection.onStateChange((state) => {
            this.lastState = state
            this.logger.debug('conn.onStateChange: %s', state)
            if (state === 'disconnected' || state === 'closed') {
                this.close()
            }
        })
        this.connection.onGatheringStateChange((state) => {
            this.lastGatheringState = state
            this.logger.debug('conn.onGatheringStateChange: %s', state)
        })
        this.connection.onLocalDescription((description, type) => {
            this.onLocalDescription(type, description)
        })
        this.connection.onLocalCandidate((candidate, mid) => {
            this.onLocalCandidate(candidate, mid)
        })

        if (this.isOffering) {
            const dataChannel = this.connection.createDataChannel('streamrDataChannel')
            this._setupDataChannel(dataChannel)
        } else {
            this.connection.onDataChannel((dataChannel) => {
                this._setupDataChannel(dataChannel)
                this.logger.debug('connection.onDataChannel')
                this._openDataChannel(dataChannel)
            })
        }

        this.connectionTimeoutRef = setTimeout(() => {
            this.logger.warn('connection timed out')
            this.close(new Error('timed out'))
        }, this.newConnectionTimeout)
    }

    setRemoteDescription(description, type) {
        if (this.connection) {
            this.connection.setRemoteDescription(description, type)
        } else {
            // Prevent node-datachannel crash
            this.logger.warn('attempt to invoke setRemoteDescription, but connection is null')
        }
    }

    addRemoteCandidate(candidate, mid) {
        if (this.connection) {
            this.connection.addRemoteCandidate(candidate, mid)
        } else {
            // Prevent node-datachannel crash
            this.logger.warn('attempt to invoke setRemoteDescription, but connection is null')
        }
    }

    send(message) {
        return new Promise((resolve, reject) => {
            const queueItem = new QueueItem(message, resolve, reject)
            this.messageQueue.push(queueItem)
            setImmediate(() => this._attemptToFlushMessages())
        })
    }

    close(err = null) {
        if (this.dataChannel) {
            this.dataChannel.close()
        }
        if (this.connection) {
            this.connection.close()
        }
        if (this.flushTimeoutRef) {
            clearTimeout(this.flushTimeoutRef)
        }
        if (this.connectionTimeoutRef) {
            clearTimeout(this.connectionTimeoutRef)
        }
        if (this.peerPingTimeoutRef) {
            clearTimeout(this.peerPingTimeoutRef)
        }
        if (this.peerPongTimeoutRef) {
            clearTimeout(this.peerPongTimeoutRef)
        }
        this.dataChannel = null
        this.connection = null
        this.flushTimeoutRef = null
        this.connectionTimeoutRef = null
        this.peerPingTimeoutRef = null
        this.peerPongTimeoutRef = null

        if (err) {
            this.onError(err)
        }
        this.onClose()
    }

    ping(attempt = 0) {
        clearTimeout(this.peerPingTimeoutRef)
        try {
            if (this.isOpen()) {
                if (this.respondedPong === false) {
                    throw new Error('dataChannel is not active')
                }
                this.respondedPong = false
                this.rttStart = Date.now()
                this.dataChannel.sendMessage('ping')
            }
        } catch (e) {
            if (attempt < this.maxPingPongAttempts && this.isOpen()) {
                this.logger.debug('failed to ping connection, error %s, re-attempting', e)
                this.peerPingTimeoutRef = setTimeout(() => this.ping(attempt + 1), this.pingPongTimeout)
            } else {
                this.logger.warn('failed all ping re-attempts to connection, terminating connection', e)
                this.close(new Error('ping attempts failed'))
            }
        }
    }

    pong(attempt = 0) {
        clearTimeout(this.peerPongTimeoutRef)
        try {
            if (this.isOpen()) {
                this.dataChannel.sendMessage('pong')
            }
        } catch (e) {
            if (attempt < this.maxPingPongAttempts && this.dataChannel && this.isOpen()) {
                this.logger.debug('failed to pong connection, error %s, re-attempting', e)
                this.peerPongTimeoutRef = setTimeout(() => this.pong(attempt + 1), this.pingPongTimeout)
            } else {
                this.logger.warn('failed all pong re-attempts to connection, terminating connection', e)
                this.close(new Error('pong attempts failed'))
            }
        }
    }

    setPeerInfo(peerInfo) {
        this.peerInfo = peerInfo
    }

    getPeerInfo() {
        return this.peerInfo
    }

    getPeerId() {
        return this.peerInfo.peerId
    }

    getRtt() {
        return this.rtt
    }

    getBufferedAmount() {
        return this.isOpen() ? this.dataChannel.getBufferedAmount() : 0
    }

    getQueueSize() {
        return this.messageQueue.size()
    }

    isOpen() {
        return (this.dataChannel || false) && this.dataChannel.isOpen()
    }

    _setupDataChannel(dataChannel) {
        this.paused = false
        dataChannel.setBufferedAmountLowThreshold(this.bufferLowThreshold)
        if (this.isOffering) {
            dataChannel.onOpen(() => {
                this.logger.debug('dataChannel.onOpen')
                this._openDataChannel(dataChannel)
            })
        }
        dataChannel.onClosed(() => {
            this.logger.debug('dataChannel.onClosed')
            this.close()
        })
        dataChannel.onError((e) => {
            this.logger.warn('dataChannel.onError: %s', e)
            this.onError(e)
        })
        dataChannel.onBufferedAmountLow(() => {
            if (this.paused === true) {
                this.paused = false
                this._attemptToFlushMessages()
            }
        })
        dataChannel.onMessage((msg) => {
            this.logger.debug('dataChannel.onmessage: %s', msg)
            if (msg === 'ping') {
                this.pong()
            } else if (msg === 'pong') {
                this.respondedPong = true
                this.rtt = Date.now() - this.rttStart
            } else {
                this.onMessage(msg)
            }
        })
    }

    _openDataChannel(dataChannel) {
        clearInterval(this.connectionTimeoutRef)
        this.dataChannel = dataChannel
        setImmediate(() => this._attemptToFlushMessages())
        this.onOpen()
    }

    _attemptToFlushMessages() {
        while (this.isOpen() && !this.messageQueue.empty()) {
            const queueItem = this.messageQueue.peek()
            if (queueItem.getMessage().length > this.dataChannel.maxMessageSize()) {
                this.messageQueue.pop()
                console.error(this.selfId, 'Dropping message due to message size', queueItem.getMessage().length, 'exceeding the limit of ', this.dataChannel.maxMessageSize())
            } else if (queueItem.isFailed()) {
                this.messageQueue.pop()
            } else {
                try {
                    if (this.dataChannel.bufferedAmount() < this.bufferHighThreshold && !this.paused) {
                        this.dataChannel.sendMessage(queueItem.getMessage())
                        this.messageQueue.pop()
                        queueItem.delivered()
                    } else {
                        this.paused = true
                        return
                    }
                } catch (e) {
                    queueItem.incrementTries({
                        error: e.toString(),
                        'connection.iceConnectionState': this.lastGatheringState,
                        'connection.connectionState': this.lastState,
                        message: queueItem.getMessage()
                    })
                    if (queueItem.isFailed()) {
                        const infoText = queueItem.getInfos().map((i) => JSON.stringify(i)).join('\n\t')
                        this.logger.warn('Failed to send message after %d tries due to\n\t%s',
                            QueueItem.MAX_TRIES,
                            infoText)
                    } else if (this.flushTimeoutRef === null) {
                        this.flushTimeoutRef = setTimeout(() => {
                            this.flushTimeoutRef = null
                            this._attemptToFlushMessages()
                        }, 100)
                    }
                    return
                }
            }
        }
    }
}
