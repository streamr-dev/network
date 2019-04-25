const { Readable, Transform } = require('stream')
const ResendLastRequest = require('../messages/ResendLastRequest')
const ResendFromRequest = require('../messages/ResendFromRequest')
const ResendRangeRequest = require('../messages/ResendRangeRequest')
const ResendResponseResent = require('../../src/messages/ResendResponseResent')
const ResendResponseResending = require('../../src/messages/ResendResponseResending')
const ResendResponseNoResend = require('../../src/messages/ResendResponseNoResend')
const UnicastMessage = require('../../src/messages/UnicastMessage')
const NodeToNode = require('../protocol/NodeToNode')
const { MessageID, MessageReference } = require('../../src/identifiers')

function toUnicastMessage(request) {
    return new Transform({
        objectMode: true,
        transform: (streamData, _, done) => {
            const {
                timestamp,
                sequenceNo,
                publisherId,
                msgChainId,
                previousTimestamp,
                previousSequenceNo,
                data,
                signature,
                signatureType,
            } = streamData
            done(null, new UnicastMessage(
                new MessageID(request.getStreamId(), timestamp, sequenceNo, publisherId, msgChainId),
                previousTimestamp != null ? new MessageReference(previousTimestamp, previousSequenceNo) : null,
                data,
                signature,
                signatureType,
                request.getSubId()
            ))
        }
    })
}

/**
 * Resend strategy that uses fetches streaming data from (local) storage.
 * Often used at L1.
 */
class StorageResendStrategy {
    constructor(storage) {
        if (storage == null) {
            throw new Error('storage not given')
        }
        this.storage = storage
    }

    getResendResponseStream(request) {
        const { id, partition } = request.getStreamId()

        if (request instanceof ResendLastRequest) {
            return this.storage.requestLast(
                id,
                partition,
                request.getNumberLast()
            ).pipe(toUnicastMessage(request))
        }
        if (request instanceof ResendFromRequest) {
            const fromMsgRef = request.getFromMsgRef()
            return this.storage.requestFrom(
                id,
                partition,
                fromMsgRef.timestamp,
                fromMsgRef.sequenceNo,
                request.getPublisherId()
            ).pipe(toUnicastMessage(request))
        }
        if (request instanceof ResendRangeRequest) {
            const fromMsgRef = request.getFromMsgRef()
            const toMsgRef = request.getToMsgRef()
            return this.storage.requestRange(
                id,
                partition,
                fromMsgRef.timestamp,
                fromMsgRef.sequenceNo,
                toMsgRef.timestamp,
                toMsgRef.sequenceNo,
                request.getPublisherId()
            ).pipe(toUnicastMessage(request))
        }
        throw new Error(`unknown resend request ${request}`)
    }
}

/**
 * Resend strategy that forwards resend request to neighbor nodes and then acts
 * as a proxy in between.
 * Often used at L2.
 */
class AskNeighborsResendStrategy {
    constructor(nodeToNode, getNeighbors, maxTries = 3, timeout = 20 * 1000) {
        this.nodeToNode = nodeToNode
        this.getNeighbors = getNeighbors
        this.maxTries = maxTries
        this.timeout = timeout
        this.pending = {}

        this.nodeToNode.on(NodeToNode.events.UNICAST_RECEIVED, (unicastMessage) => {
            const subId = unicastMessage.getSubId()
            const source = unicastMessage.getSource()

            if (this.pending[subId]) {
                if (this.pending[subId].currentNeighbor === source) {
                    this.pending[subId].responseStream.push(unicastMessage)
                    this._reSetTimeout(subId)
                } else {
                    console.error(`received unicast from non-current neighbor ${source}`)
                }
            } else {
                console.error(`received unicast for unknown subId ${subId}`)
            }
        })
        this.nodeToNode.on(NodeToNode.events.RESEND_RESPONSE, (response) => {
            const subId = response.getSubId()
            const source = response.getSource()
            if (this.pending[subId]) {
                if (this.pending[subId].currentNeighbor === source) {
                    if (response instanceof ResendResponseResent) {
                        this._endStream(subId)
                    } else if (response instanceof ResendResponseNoResend) {
                        this._askNextNeighbor(subId)
                    } else if (response instanceof ResendResponseResending) {
                        this._reSetTimeout(subId)
                    } else {
                        throw new Error(`unexpected response type ${response}`)
                    }
                } else {
                    console.error(`received resend response from non-current neighbor ${source}`)
                }
            } else {
                console.error(`received resend response for unknown subId ${subId}`)
            }
        })
        this.nodeToNode.on(NodeToNode.events.NODE_DISCONNECTED, (nodeId) => {
            Object.entries(this.pending).forEach(([subId, { currentNeighbor }]) => {
                if (currentNeighbor === nodeId) {
                    this._askNextNeighbor(subId)
                }
            })
        })
    }

    getResendResponseStream(request) {
        const responseStream = new Readable({
            objectMode: true,
            read() {}
        })

        // L2 only works on local requests
        if (request.getSource() === null) {
            this.pending[request.getSubId()] = {
                responseStream,
                request,
                neighborsAsked: new Set(),
                currentNeighbor: null,
                timeoutRef: null
            }
            this._askNextNeighbor(request.getSubId())
        } else {
            responseStream.push(null)
        }

        return responseStream
    }

    stop() {
        Object.keys(this.pending).forEach(this._endStream.bind(this))
    }

    _askNextNeighbor(subId) {
        const { request, neighborsAsked, timeoutRef } = this.pending[subId]

        clearTimeout(timeoutRef)

        if (neighborsAsked.size >= this.maxTries) {
            this._endStream(subId)
            return
        }

        const candidates = this.getNeighbors(request.getStreamId()).filter((x) => !neighborsAsked.has(x))
        if (candidates.length === 0) {
            this._endStream(subId)
            return
        }

        const neighborId = candidates[0]
        neighborsAsked.add(neighborId)

        this.nodeToNode.send(neighborId, request).then(() => {
            this.pending[subId].currentNeighbor = neighborId
            this._reSetTimeout(subId)
        }, () => {
            this._askNextNeighbor(subId)
        })
    }

    _endStream(subId) {
        const { responseStream, timeoutRef } = this.pending[subId]
        clearTimeout(timeoutRef)
        responseStream.push(null)
        delete this.pending[subId]
    }

    _reSetTimeout(subId) {
        clearTimeout(this.pending[subId].timeoutRef)
        this.pending[subId].timeoutRef = setTimeout(() => this._askNextNeighbor(subId), this.timeout)
    }
}

module.exports = {
    AskNeighborsResendStrategy,
    StorageResendStrategy
}
