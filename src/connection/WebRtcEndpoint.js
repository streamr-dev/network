const { EventEmitter } = require('events')

const nodeDataChannel = require('node-datachannel')

const getLogger = require('../helpers/logger')

const { PeerInfo } = require('./PeerInfo')
const Connection = require('./Connection')

const events = Object.freeze({
    PEER_CONNECTED: 'streamr:peer:connect',
    PEER_DISCONNECTED: 'streamr:peer:disconnect',
    MESSAGE_RECEIVED: 'streamr:message-received'
})

class WebRtcError extends Error {
    constructor(msg) {
        super(msg)
        // exclude this constructor from stack trace
        Error.captureStackTrace(this, WebRtcError)
    }
}

class WebRtcEndpoint extends EventEmitter {
    constructor(id, stunUrls, rtcSignaller, metricsContext, pingIntervalInMs = 5 * 1000, newConnectionTimeout = 5000) {
        super()
        this.id = id
        this.stunUrls = stunUrls
        this.rtcSignaller = rtcSignaller
        this.connections = {}
        this.newConnectionTimeout = newConnectionTimeout
        this.pingIntervalInMs = pingIntervalInMs
        this.pingTimeoutRef = setTimeout(() => this._pingConnections(), this.pingIntervalInMs)
        this.logger = getLogger(`streamr:WebRtcEndpoint:${id}`)

        rtcSignaller.setOfferListener(async ({ routerId, originatorInfo, description }) => {
            const { peerId } = originatorInfo
            this.connect(peerId, routerId)
            const connection = this.connections[peerId]
            if (connection) {
                connection.setPeerInfo(PeerInfo.fromObject(originatorInfo))
                await connection.setRemoteDescription(description, 'offer')
            }
        })

        rtcSignaller.setAnswerListener(async ({ routerId, originatorInfo, description }) => {
            const { peerId } = originatorInfo
            const connection = this.connections[peerId]
            if (connection) {
                connection.setPeerInfo(PeerInfo.fromObject(originatorInfo))
                await connection.setRemoteDescription(description, 'answer')
            } else {
                this.logger.warn('Unexpected rtcAnswer from %s: %s', originatorInfo, description)
            }
        })

        rtcSignaller.setRemoteCandidateListener(async ({ originatorInfo, candidate, mid }) => {
            const { peerId } = originatorInfo
            const connection = this.connections[peerId]
            if (connection) {
                await connection.addRemoteCandidate(candidate, mid)
            } else {
                this.logger.warn('Unexpected remoteCandidate from %s: [%s, %s]', originatorInfo, candidate, mid)
            }
        })

        rtcSignaller.setConnectListener(async ({ originatorInfo, targetNode, routerId }) => {
            const { peerId } = originatorInfo
            this.connect(peerId, routerId, false)
        })

        rtcSignaller.setErrorListener(({ targetNode, errorCode }) => {
            const error = new WebRtcError(`RTC error ${errorCode} while attempting to signal with ${targetNode}`)
            this.emit(`errored:${targetNode}`, error)
        })

        this.metrics = metricsContext.create('WebRtcEndpoint')
            .addRecordedMetric('inSpeed')
            .addRecordedMetric('outSpeed')
            .addRecordedMetric('msgSpeed')
            .addRecordedMetric('msgInSpeed')
            .addRecordedMetric('msgOutSpeed')
            .addRecordedMetric('open')
            .addRecordedMetric('close')
            .addRecordedMetric('sendFailed')
            .addQueriedMetric('connections', () => Object.keys(this.connections).length)
            .addQueriedMetric('pendingConnections', () => {
                return Object.values(this.connections).filter((c) => !c.isOpen()).length
            })
            .addQueriedMetric('totalWebSocketBuffer', () => {
                return Object.values(this.connections).reduce((total, c) => total + c.getBufferedAmount(), 0)
            })
            .addQueriedMetric('messageQueueSize', () => {
                return Object.values(this.connections).reduce((total, c) => total + c.getQueueSize(), 0)
            })
    }

    connect(targetPeerId, routerId, isOffering = this.id < targetPeerId, trackerInstructed = true) {
        if (this.connections[targetPeerId]) {
            return Promise.resolve(targetPeerId)
        }
        const connection = new Connection({
            selfId: this.id,
            targetPeerId,
            routerId,
            isOffering,
            stunUrls: this.stunUrls,
            newConnectionTimeout: this.newConnectionTimeout,
            onLocalDescription: (type, description) => {
                this.rtcSignaller.onLocalDescription(routerId, connection.getPeerId(), type, description)
            },
            onLocalCandidate: (candidate, mid) => {
                this.rtcSignaller.onLocalCandidate(routerId, connection.getPeerId(), candidate, mid)
            },
            onOpen: () => {
                this.emit(events.PEER_CONNECTED, connection.getPeerInfo())
                this.emit(`connected:${connection.getPeerId()}`, connection.getPeerId())
                this.metrics.record('open', 1)
            },
            onMessage: (message) => {
                this.emit(events.MESSAGE_RECEIVED, connection.getPeerInfo(), message)
                this.metrics.record('inSpeed', message.length)
                this.metrics.record('msgSpeed', 1)
                this.metrics.record('msgInSpeed', 1)
            },
            onClose: () => {
                this.emit(events.PEER_DISCONNECTED, connection.getPeerInfo())
                this.emit(`disconnected:${connection.getPeerId()}`, connection.getPeerInfo())
                this.metrics.record('close', 1)
                delete this.connections[targetPeerId]
            },
            onError: (err) => {
                this.emit(events.PEER_DISCONNECTED, connection.getPeerInfo())
                this.emit(`errored:${connection.getPeerId()}`, err)
            }
        })
        this.connections[targetPeerId] = connection
        connection.connect()
        if (trackerInstructed === false && isOffering === true) {
            this.rtcSignaller.onConnectionNeeded(routerId, connection.getPeerId())
        }
        return new Promise((resolve, reject) => {
            this.once(`connected:${connection.getPeerId()}`, resolve)
            this.once(`errored:${connection.getPeerId()}`, reject)
        })
    }

    send(targetPeerId, message) {
        if (!this.connections[targetPeerId]) {
            throw new WebRtcError(`Not connected to ${targetPeerId}.`)
        }
        return this.connections[targetPeerId].send(message).then(
            () => {
                this.metrics.record('outSpeed', message.length)
                this.metrics.record('msgSpeed', 1)
                this.metrics.record('msgOutSpeed', 1)
                return true
            },
            (err) => {
                this.metrics.record('sendFailed', 1)
            }
        )
    }

    close(receiverNodeId, reason) {
        this.logger.debug('Close %s because %s', receiverNodeId, reason)
        const connection = this.connections[receiverNodeId]
        if (connection) {
            connection.close()
        }
    }

    getRtts() {
        const rtts = {}
        Object.entries(this.connections).forEach(([targetPeerId, connection]) => {
            const rtt = connection.getRtt()
            if (rtt !== undefined && rtt !== null) {
                rtts[targetPeerId] = rtt
            }
        })
        return rtts
    }

    getAddress() {
        return this.id
    }

    stop() {
        Object.values(this.connections).forEach((connection) => connection.close())
        clearTimeout(this.pingTimeoutRef)
        this.connections = {}
        this.rtcSignaller.setOfferListener(() => {})
        this.rtcSignaller.setAnswerListener(() => {})
        this.rtcSignaller.setRemoteCandidateListener(() => {})
        this.rtcSignaller.setErrorListener(() => {})
        this.rtcSignaller.setConnectListener(() => {})
        this.removeAllListeners()
        nodeDataChannel.cleanup()
    }

    _pingConnections() {
        const connections = Object.values(this.connections)
        connections.forEach((connection) => connection.ping())
        this.pingTimeoutRef = setTimeout(() => this._pingConnections(), this.pingIntervalInMs)
    }
}

module.exports = {
    events,
    WebRtcEndpoint
}
