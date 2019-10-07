const { Readable, Transform } = require('stream')

const { MessageLayer, ControlLayer } = require('streamr-client-protocol')

const NodeToNode = require('../protocol/NodeToNode')
const TrackerNode = require('../protocol/TrackerNode')
const { StreamIdAndPartition } = require('../../src/identifiers')

const { StreamMessage } = MessageLayer

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
            done(null, ControlLayer.UnicastMessage.create(
                request.subId,
                StreamMessage.create(
                    [request.streamId, request.streamPartition, timestamp, sequenceNo, publisherId, msgChainId],
                    previousTimestamp != null ? [previousTimestamp, previousSequenceNo] : null,
                    StreamMessage.CONTENT_TYPES.MESSAGE,
                    StreamMessage.ENCRYPTION_TYPES.NONE,
                    data,
                    signatureType,
                    signature
                )
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
        if (request.type === ControlLayer.ResendLastRequest.TYPE) {
            return this.storage.requestLast(
                request.streamId,
                request.streamPartition,
                request.numberLast
            ).pipe(toUnicastMessage(request))
        }
        if (request.type === ControlLayer.ResendFromRequest.TYPE) {
            return this.storage.requestFrom(
                request.streamId,
                request.streamPartition,
                request.fromMsgRef.timestamp,
                request.fromMsgRef.sequenceNumber,
                request.publisherId,
                request.msgChainId
            ).pipe(toUnicastMessage(request))
        }
        if (request.type === ControlLayer.ResendRangeRequest.TYPE) {
            return this.storage.requestRange(
                request.streamId,
                request.streamPartition,
                request.fromMsgRef.timestamp,
                request.fromMsgRef.sequenceNumber,
                request.toMsgRef.timestamp,
                request.toMsgRef.sequenceNumber,
                request.publisherId,
                request.msgChainId
            ).pipe(toUnicastMessage(request))
        }
        throw new Error(`unknown resend request ${request}`)
    }
}

/**
 * Internal class for managing the lifecycle of proxied resend requests. Useful
 * for both L2 and L3.
 *
 * Operates on a one-neighbor-at-a-time basis until
 *  1) a neighbor is able to fulfill request,
 *  2) it runs out of neighbors to try,
 *  3) limit maxTries is hit,
 *  4) method cancel is invoked.
 *
 *  Given a neighbor it will forward resend request to it. It will then
 *  interpret incoming unicast / resend response messages from that neighbor
 *  and push to responseStream appropriately. It also handles timeout if
 *  neighbor doesn't respond in a timely manner.
 */
class ProxiedResend {
    constructor(request, responseStream, nodeToNode, getNeighbors, maxTries, timeout, onDoneCb) {
        this.request = request
        this.responseStream = responseStream
        this.nodeToNode = nodeToNode
        this.getNeighbors = getNeighbors
        this.maxTries = maxTries
        this.timeout = timeout
        this.onDoneCb = onDoneCb
        this.neighborsAsked = new Set()
        this.currentNeighbor = null
        this.timeoutRef = null

        // Below are important for function identity in _detachEventHandlers
        this._onUnicast = this._onUnicast.bind(this)
        this._onResendResponse = this._onResendResponse.bind(this)
        this._onNodeDisconnect = this._onNodeDisconnect.bind(this)
    }

    commence() {
        this._attachEventHandlers()
        this._askNextNeighbor()
    }

    cancel() {
        this._endStream()
    }

    _attachEventHandlers() {
        this.nodeToNode.on(NodeToNode.events.UNICAST_RECEIVED, this._onUnicast)
        this.nodeToNode.on(NodeToNode.events.RESEND_RESPONSE, this._onResendResponse)
        this.nodeToNode.on(NodeToNode.events.NODE_DISCONNECTED, this._onNodeDisconnect)
    }

    _detachEventHandlers() {
        this.nodeToNode.removeListener(NodeToNode.events.UNICAST_RECEIVED, this._onUnicast)
        this.nodeToNode.removeListener(NodeToNode.events.RESEND_RESPONSE, this._onResendResponse)
        this.nodeToNode.removeListener(NodeToNode.events.NODE_DISCONNECTED, this._onNodeDisconnect)
    }

    _onUnicast(unicastMessage, source) {
        const { subId } = unicastMessage
        if (this.request.subId === subId && this.currentNeighbor === source) {
            this.responseStream.push(unicastMessage)
            this._resetTimeout()
        }
    }

    _onResendResponse(response, source) {
        const { subId } = response

        if (this.request.subId === subId && this.currentNeighbor === source) {
            if (response.type === ControlLayer.ResendResponseResent.TYPE) {
                this._endStream()
            } else if (response.type === ControlLayer.ResendResponseNoResend.TYPE) {
                this._askNextNeighbor()
            } else if (response.type === ControlLayer.ResendResponseResending.TYPE) {
                this._resetTimeout()
            } else {
                throw new Error(`unexpected response type ${response}`)
            }
        }
    }

    _onNodeDisconnect(nodeId) {
        if (this.currentNeighbor === nodeId) {
            this._askNextNeighbor()
        }
    }

    _askNextNeighbor() {
        clearTimeout(this.timeoutRef)

        if (this.neighborsAsked.size >= this.maxTries) {
            this._endStream()
            return
        }

        const candidates = this.getNeighbors(
            new StreamIdAndPartition(this.request.streamId, this.request.streamPartition)
        ).filter((x) => !this.neighborsAsked.has(x))
        if (candidates.length === 0) {
            this._endStream()
            return
        }

        const neighborId = candidates[0]
        this.neighborsAsked.add(neighborId)

        this.nodeToNode.send(neighborId, this.request).then(() => {
            this.currentNeighbor = neighborId
            this._resetTimeout()
        }, () => {
            this._askNextNeighbor()
        })
    }

    _endStream() {
        clearTimeout(this.timeoutRef)
        this.responseStream.push(null)
        this._detachEventHandlers()
        this.onDoneCb()
    }

    _resetTimeout() {
        clearTimeout(this.timeoutRef)
        this.timeoutRef = setTimeout(this._askNextNeighbor.bind(this), this.timeout)
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
        this.pending = new Set()
    }

    getResendResponseStream(request, source = null) {
        const responseStream = new Readable({
            objectMode: true,
            read() {}
        })

        // L2 only works on local requests
        if (source === null) {
            const proxiedResend = new ProxiedResend(
                request,
                responseStream,
                this.nodeToNode,
                this.getNeighbors,
                this.maxTries,
                this.timeout,
                () => this.pending.delete(proxiedResend)
            )
            this.pending.add(proxiedResend)
            proxiedResend.commence()
        } else {
            responseStream.push(null)
        }

        return responseStream
    }

    stop() {
        this.pending.forEach((proxiedResend) => proxiedResend.cancel())
    }
}

/**
 * Internal class used by StorageNodeResendStrategy (L3) to keep track of
 * resend requests that are pending (STORAGE_NODES) response from tracker.
 * Also handles timeouts if tracker response not received in a timely manner.
 */
class PendingTrackerResponseBookkeeper {
    constructor(timeout) {
        this.timeout = timeout
        this.pending = {} // streamId => subId => { request, responseStream, timeoutRef }
    }

    addEntry(request, responseStream) {
        const streamIdAndPartition = new StreamIdAndPartition(request.streamId, request.streamPartition)
        const { subId } = request

        if (!this.pending[streamIdAndPartition]) {
            this.pending[streamIdAndPartition] = {}
        }
        this.pending[streamIdAndPartition][subId] = {
            responseStream,
            request,
            timeoutRef: setTimeout(() => {
                try {
                    delete this.pending[streamIdAndPartition][subId]
                    if (Object.entries(this.pending[streamIdAndPartition]).length === 0) {
                        delete this.pending[streamIdAndPartition]
                    }
                    responseStream.push(null)
                } catch (err) {
                    console.error(`HOTFIX error ${err}, request: ${request.serialize()}, from: ${source}`)
                }
            }, this.timeout)
        }
    }

    popEntries(streamIdAndPartition) {
        if (this._hasEntries(streamIdAndPartition)) {
            const entries = Object.values(this.pending[streamIdAndPartition])
            delete this.pending[streamIdAndPartition]
            return entries.map(({ timeoutRef, ...rest }) => {
                clearTimeout(timeoutRef)
                return rest
            })
        }
        return []
    }

    clearAll() {
        Object.values(this.pending).forEach((entries) => {
            Object.values(entries).forEach(({ responseStream, timeoutRef }) => {
                clearTimeout(timeoutRef)
                responseStream.push(null)
            })
        })
        this.pending = {}
    }

    _hasEntries(streamIdAndPartition) {
        return streamIdAndPartition in this.pending
    }
}

/**
 * Resend strategy that asks tracker for storage nodes, forwards resend request
 * to one of them, and then acts as a proxy in between.
 * Often used at L3.
 */
class StorageNodeResendStrategy {
    constructor(trackerNode, nodeToNode, getTracker, isSubscribedTo, timeout = 20 * 1000) {
        this.trackerNode = trackerNode
        this.nodeToNode = nodeToNode
        this.getTracker = getTracker
        this.isSubscribedTo = isSubscribedTo
        this.timeout = timeout
        this.pendingTrackerResponse = new PendingTrackerResponseBookkeeper(timeout)
        this.pendingResends = {} // storageNode => [...proxiedResend]

        this.trackerNode.on(TrackerNode.events.STORAGE_NODES_RECEIVED, async (storageNodesMessage) => {
            const streamId = storageNodesMessage.getStreamId()
            const storageNodeAddresses = storageNodesMessage.getNodeAddresses()

            const entries = this.pendingTrackerResponse.popEntries(streamId)
            if (entries.length === 0) {
                return
            }

            let storageNode = null
            while (storageNode === null && storageNodeAddresses.length > 0) {
                const address = storageNodeAddresses.shift()
                try {
                    storageNode = await this.nodeToNode.connectToNode(address) // eslint-disable-line no-await-in-loop
                } catch (e) {
                    // nop
                }
            }

            if (storageNode === null) {
                entries.forEach(({ responseStream }) => responseStream.push(null))
                return
            }

            if (!this.pendingResends[storageNode]) {
                this.pendingResends[storageNode] = new Set()
            }
            entries.forEach(({ request, responseStream }) => {
                const proxiedResend = new ProxiedResend(
                    request,
                    responseStream,
                    this.nodeToNode,
                    () => [storageNode],
                    1,
                    this.timeout,
                    () => {
                        this.pendingResends[storageNode].delete(proxiedResend)
                        if (this.pendingResends[storageNode].size === 0 && !this.isSubscribedTo(storageNode)) {
                            this.nodeToNode.disconnectFromNode(storageNode)
                            delete this.pendingResends[storageNode]
                        }
                    }
                )
                this.pendingResends[storageNode].add(proxiedResend)
                proxiedResend.commence()
            })
        })
    }

    getResendResponseStream(request, source = null) {
        const responseStream = new Readable({
            objectMode: true,
            read() {}
        })

        // L3 only works on local requests
        if (source === null) {
            this._requestStorageNodes(request, responseStream)
        } else {
            responseStream.push(null)
        }

        return responseStream
    }

    _requestStorageNodes(request, responseStream) {
        const streamIdAndPartition = new StreamIdAndPartition(request.streamId, request.streamPartition)
        const tracker = this.getTracker(streamIdAndPartition)
        if (tracker == null) {
            responseStream.push(null)
        } else {
            this.trackerNode.findStorageNodes(tracker, streamIdAndPartition).then(
                () => this.pendingTrackerResponse.addEntry(request, responseStream),
                () => responseStream.push(null)
            )
        }
    }

    stop() {
        Object.values(this.pendingResends).forEach((proxiedResends) => {
            proxiedResends.forEach((proxiedResend) => proxiedResend.cancel())
        })
        this.pendingTrackerResponse.clearAll()
    }
}

module.exports = {
    AskNeighborsResendStrategy,
    StorageResendStrategy,
    StorageNodeResendStrategy
}
