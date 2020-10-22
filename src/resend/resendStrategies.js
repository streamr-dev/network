const { Readable, Transform } = require('stream')

const { ControlLayer } = require('streamr-client-protocol')

const NodeToNode = require('../protocol/NodeToNode')
const TrackerNode = require('../protocol/TrackerNode')
const { StreamIdAndPartition } = require('../identifiers')
const logger = require('../helpers/logger')('streamr:resendStrategies')

function toUnicastMessage(request) {
    return new Transform({
        objectMode: true,
        transform: (streamMessage, _, done) => {
            done(null, new ControlLayer.UnicastMessage({
                requestId: request.requestId,
                streamMessage
            }))
        }
    })
}

/**
 * Resend strategy that uses fetches streaming data from local storage.
 */
class LocalResendStrategy {
    constructor(storage) {
        if (storage == null) {
            throw new Error('storage not given')
        }
        this.storage = storage
    }

    getResendResponseStream(request) {
        let sourceStream
        if (request.type === ControlLayer.ControlMessage.TYPES.ResendLastRequest) {
            sourceStream = this.storage.requestLast(
                request.streamId,
                request.streamPartition,
                request.numberLast
            )
        } else if (request.type === ControlLayer.ControlMessage.TYPES.ResendFromRequest) {
            sourceStream = this.storage.requestFrom(
                request.streamId,
                request.streamPartition,
                request.fromMsgRef.timestamp,
                request.fromMsgRef.sequenceNumber,
                request.publisherId,
                request.msgChainId
            )
        } else if (request.type === ControlLayer.ControlMessage.TYPES.ResendRangeRequest) {
            sourceStream = this.storage.requestRange(
                request.streamId,
                request.streamPartition,
                request.fromMsgRef.timestamp,
                request.fromMsgRef.sequenceNumber,
                request.toMsgRef.timestamp,
                request.toMsgRef.sequenceNumber,
                request.publisherId,
                request.msgChainId
            )
        } else {
            throw new Error(`unknown resend request ${request}`)
        }

        const destinationStream = toUnicastMessage(request)
        destinationStream.on('close', () => {
            if (destinationStream.destroyed) {
                sourceStream.destroy()
            }
        })
        return sourceStream.pipe(destinationStream)
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
        const { requestId } = unicastMessage
        if (this.request.requestId === requestId && this.currentNeighbor === source) {
            this.responseStream.push(unicastMessage)
            this._resetTimeout()
        }
    }

    _onResendResponse(response, source) {
        const { requestId } = response

        if (this.request.requestId === requestId && this.currentNeighbor === source) {
            if (response.type === ControlLayer.ControlMessage.TYPES.ResendResponseResent) {
                this._endStream()
            } else if (response.type === ControlLayer.ControlMessage.TYPES.ResendResponseNoResend) {
                this._askNextNeighbor()
            } else if (response.type === ControlLayer.ControlMessage.TYPES.ResendResponseResending) {
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
            return true
        }, () => {
            this._askNextNeighbor()
        }).catch((e) => {
            logger.error(`Failed to _askNextNeighbor: ${neighborId}, error ${e}`)
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
 * Internal class used by StorageNodeResendStrategy (L3) to keep track of
 * resend requests that are pending (STORAGE_NODES) response from tracker.
 * Also handles timeouts if tracker response not received in a timely manner.
 */
class PendingTrackerResponseBookkeeper {
    constructor(timeout) {
        this.timeout = timeout
        this.pending = {} // streamId =>=> [{ request, responseStream, timeoutRef }]
    }

    addEntry(request, responseStream) {
        const streamIdAndPartition = new StreamIdAndPartition(request.streamId, request.streamPartition)

        if (!this.pending[streamIdAndPartition]) {
            this.pending[streamIdAndPartition] = new Set()
        }
        const entry = {
            responseStream,
            request,
            timeoutRef: setTimeout(() => {
                this.pending[streamIdAndPartition].delete(entry)
                if (this.pending[streamIdAndPartition].size === 0) {
                    delete this.pending[streamIdAndPartition]
                }
                responseStream.push(null)
            }, this.timeout)
        }
        this.pending[streamIdAndPartition].add(entry)
    }

    popEntries(streamIdAndPartition) {
        if (this._hasEntries(streamIdAndPartition)) {
            const entries = [...this.pending[streamIdAndPartition]]
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
            entries.forEach(({ responseStream, timeoutRef }) => {
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
 * to (one of) them, and then acts as a proxy/relay in between.
 */
class ForeignResendStrategy {
    constructor(trackerNode, nodeToNode, getTracker, isSubscribedTo, timeout = 20 * 1000) {
        this.trackerNode = trackerNode
        this.nodeToNode = nodeToNode
        this.getTracker = getTracker
        this.isSubscribedTo = isSubscribedTo
        this.timeout = timeout
        this.pendingTrackerResponse = new PendingTrackerResponseBookkeeper(timeout)
        this.pendingResends = {} // storageNode => [...proxiedResend]

        this.trackerNode.on(TrackerNode.events.STORAGE_NODES_RESPONSE_RECEIVED, async (storageNodesResponse) => {
            const streamId = new StreamIdAndPartition(storageNodesResponse.streamId, storageNodesResponse.streamPartition)
            const storageNodeAddresses = storageNodesResponse.nodeAddresses

            const entries = this.pendingTrackerResponse.popEntries(streamId)
            if (entries.length === 0) {
                return
            }

            let storageNode = null
            while (storageNode === null && storageNodeAddresses.length > 0) {
                const address = storageNodeAddresses.shift()
                try {
                    // eslint-disable-next-line require-atomic-updates, no-await-in-loop
                    storageNode = await this.nodeToNode.connectToNode(address)
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
        const tracker = this.getTracker(streamIdAndPartition.key())
        if (tracker == null) {
            responseStream.push(null)
        } else {
            this.trackerNode.sendStorageNodesRequest(tracker, streamIdAndPartition).then(
                () => this.pendingTrackerResponse.addEntry(request, responseStream),
                () => responseStream.push(null)
            ).catch((e) => {
                logger.error(`Failed to _requestStorageNodes, error: ${e}`)
            })
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
    LocalResendStrategy,
    ForeignResendStrategy
}
