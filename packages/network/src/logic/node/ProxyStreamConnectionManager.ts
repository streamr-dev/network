import { TrackerManager } from './TrackerManager'
import { StreamManager } from './StreamManager'
import { NodeToNode } from '../../protocol/NodeToNode'
import { Event, Node, NodeId } from './Node'
import {
    PublishStreamConnectionRequest,
    PublishStreamConnectionResponse,
    SPID,
    UnsubscribeRequest
} from 'streamr-client-protocol'
import { promiseTimeout } from '../../helpers/PromiseTools'
import { Logger } from '../../helpers/logger/LoggerNode'
const logger = new Logger(module)

export interface ProxyStreamConnectionManagerOptions {
    trackerManager: TrackerManager,
    streamManager: StreamManager,
    nodeToNode: NodeToNode,
    node: Node,
    nodeConnectTimeout: number,
    acceptProxyConnections: boolean
}

const DEFAULT_RECONNECTION_TIMEOUT = 10 * 1000

export class ProxyStreamConnectionManager {
    private readonly trackerManager: TrackerManager
    private readonly streamManager: StreamManager
    private readonly nodeToNode: NodeToNode
    private readonly node: Node
    private readonly nodeConnectTimeout: number
    private readonly attemptedPublishOnlyStreamConnections: Record<string, Record<NodeId, NodeJS.Timeout>>
    private readonly acceptProxyConnections: boolean
    private readonly reattemptIntervals: Record<string, Record<NodeId, NodeJS.Timeout>>

    constructor(opts: ProxyStreamConnectionManagerOptions) {
        this.trackerManager = opts.trackerManager
        this.streamManager = opts.streamManager
        this.nodeToNode = opts.nodeToNode
        this.node = opts.node
        this.nodeConnectTimeout = opts.nodeConnectTimeout
        this.acceptProxyConnections = opts.acceptProxyConnections
        this.attemptedPublishOnlyStreamConnections = {}
        this.reattemptIntervals = {}
    }

    addAttemptedPublishOnlyStreamConnection(spid: SPID, nodeId: NodeId): void {
        if (!this.attemptedPublishOnlyStreamConnections[spid.key]) {
            this.attemptedPublishOnlyStreamConnections[spid.key] = {}
        }
        this.attemptedPublishOnlyStreamConnections[spid.key][nodeId] = setTimeout(() => {
            delete this.attemptedPublishOnlyStreamConnections[spid.key][nodeId]
            if (Object.keys(this.attemptedPublishOnlyStreamConnections[spid.key]).length === 0) {
                delete this.attemptedPublishOnlyStreamConnections[spid.key]
            }
        }, this.nodeConnectTimeout * 2)
    }

    clearAttemptedPublishOnlyStreamConnection(spid: SPID, nodeId: NodeId): void {
        if (this.attemptedPublishOnlyStreamConnections[spid.key] && this.attemptedPublishOnlyStreamConnections[spid.key][nodeId]) {
            clearTimeout(this.attemptedPublishOnlyStreamConnections[spid.key][nodeId])
            delete this.attemptedPublishOnlyStreamConnections[spid.key][nodeId]
            if (Object.keys(this.attemptedPublishOnlyStreamConnections[spid.key]).length === 0) {
                delete this.attemptedPublishOnlyStreamConnections[spid.key]
            }
        }
    }

    checkIfAttemptedPublishOnlyConnectionExists(spid: SPID, nodeId: NodeId): boolean {
        if (!this.attemptedPublishOnlyStreamConnections[spid.key]) {
            return false
        } else if (!this.attemptedPublishOnlyStreamConnections[spid.key][nodeId]) {
            return false
        }
        return true
    }

    async openOutgoingStreamConnection(spid: SPID, targetNodeId: string): Promise<void> {
        const trackerId = this.trackerManager.getTrackerId(spid)
        const trackerAddress = this.trackerManager.getTrackerAddress(spid)
        try {
            if (!this.streamManager.isSetUp(spid)) {
                this.streamManager.setUpStream(spid, true)
            } else if (this.streamManager.isSetUp(spid) && !this.streamManager.isOneDirectional(spid)) {
                const reason = `Could not open outgoing stream connection ${spid.key}, bidirectional stream already exists`
                logger.warn(reason)
                this.node.emit(Event.PUBLISH_STREAM_REJECTED, targetNodeId, spid, reason)
                return
            } else if (this.streamManager.isSetUp(spid) && this.streamManager.hasOutOnlyConnection(spid, targetNodeId)) {
                const reason = `Could not open outgoing stream connection ${spid.key}, publish only stream connection already exists`
                logger.warn(reason)
                this.node.emit(Event.PUBLISH_STREAM_REJECTED, targetNodeId, spid, reason)
                return
            } else if (this.streamManager.isSetUp(spid) && this.checkIfAttemptedPublishOnlyConnectionExists(spid, targetNodeId)) {
                const reason = `Could not open outgoing stream connection ${spid.key}, an attempted connection already exists`
                logger.warn(reason)
                return
            }
            this.addAttemptedPublishOnlyStreamConnection(spid, targetNodeId)
            await this.openPeerConnection(targetNodeId, trackerId, trackerAddress)
            await this.nodeToNode.requestPublishOnlyStreamConnection(targetNodeId, spid)
        } catch (err) {
            logger.warn(`Failed to create an Outgoing stream connection to ${targetNodeId} for stream ${spid.key}:\n${err}`)
            this.clearAttemptedPublishOnlyStreamConnection(spid, targetNodeId)
            this.removeOneWayStreamConnection(spid, targetNodeId)
            this.node.emit(Event.PUBLISH_STREAM_REJECTED, targetNodeId, spid, err)
        } finally {
            this.trackerManager.disconnectFromSignallingOnlyTracker(trackerId)
        }
    }

    private removeOneWayStreamConnection(spid: SPID, nodeId: NodeId): void {
        this.streamManager.removeNodeFromStream(spid, nodeId)
        if (this.streamManager.isSetUp(spid)
            && this.streamManager.getAllNodesForStream(spid).length === 0
            && !this.attemptedPublishOnlyStreamConnections[spid.key]
            && this.streamManager.isOneDirectional(spid)
        ) {
            this.streamManager.removeStream(spid)
        }
    }

    attemptReconnection(spid: SPID, nodeId: NodeId): void {
        this.startReattemptInterval(nodeId, spid, 100)
    }

    async closeOutgoingStreamConnection(spid: SPID, targetNodeId: NodeId): Promise<void> {
        if (this.streamManager.isSetUp(spid) && this.streamManager.hasOutOnlyConnection(spid, targetNodeId)) {
            await this.nodeToNode.leaveStreamOnNode(targetNodeId, spid)
            this.removeOneWayStreamConnection(spid, targetNodeId)
            this.node.emit(Event.ONE_WAY_CONNECTION_CLOSED, targetNodeId, spid)
            this.stopReattemptInterval(targetNodeId, spid)
        } else {
            logger.warn(`An outgoing stream connection for ${spid.key} on node ${targetNodeId} does not exist`)
        }
    }

    processLeaveRequest(message: UnsubscribeRequest, nodeId: NodeId): void {
        const { streamId, streamPartition } = message
        const spid = new SPID(streamId, streamPartition)
        if (this.streamManager.isSetUp(spid) && this.streamManager.hasInOnlyConnection(spid, nodeId)) {
            this.removeOneWayStreamConnection(spid, nodeId)
            this.node.emit(Event.ONE_WAY_CONNECTION_CLOSED, nodeId, spid)
        }
        if (this.streamManager.isSetUp(spid) && this.streamManager.hasOutOnlyConnection(spid, nodeId)) {
            this.removeOneWayStreamConnection(spid, nodeId)
            this.node.emit(Event.ONE_WAY_CONNECTION_CLOSED, nodeId, spid)
            logger.info(`Proxy node ${nodeId} closed one-way stream connection for ${spid}`)
        }
    }

    async processPublishStreamRequest(message: PublishStreamConnectionRequest, nodeId: string): Promise<void> {
        const { streamId, streamPartition } = message
        const spid = new SPID(streamId, streamPartition)

        // More conditions could be added here, ie. a list of acceptable ids or max limit for number of one-way this
        const isAccepted = this.streamManager.isSetUp(spid) && this.acceptProxyConnections
        if (isAccepted) {
            this.streamManager.addInOnlyNeighbor(spid, nodeId)
        }
        return await this.nodeToNode.respondToPublishOnlyStreamConnectionRequest(nodeId, spid, isAccepted)
    }

    processPublishStreamResponse(message: PublishStreamConnectionResponse, nodeId: string): void {
        const { streamId, streamPartition, accepted } = message
        const spid = new SPID(streamId, streamPartition)
        this.clearAttemptedPublishOnlyStreamConnection(spid, nodeId)
        if (accepted) {
            this.streamManager.addOutOnlyNeighbor(spid, nodeId)
            this.node.emit(Event.PUBLISH_STREAM_ACCEPTED, nodeId, spid)
        } else {
            if (this.streamManager.isSetUp(spid)
                && this.streamManager.isOneDirectional(spid)
                && !this.attemptedPublishOnlyStreamConnections[spid.key]
            ) {
                this.streamManager.removeStream(spid)
            }
            this.node.emit(Event.PUBLISH_STREAM_REJECTED, nodeId, spid, `Target node ${nodeId} rejected publish only stream connection ${spid.key}`)
        }
    }

    private startReattemptInterval(targetNodeId: NodeId, spid: SPID, timeout?: number): void {
        if (!this.reattemptIntervals[spid.key]) {
            this.reattemptIntervals[spid.key] = {}
        }
        this.reattemptIntervals[spid.key][targetNodeId] = setTimeout(async () => {
            await this.retryConnection(targetNodeId, spid)
        }, timeout || DEFAULT_RECONNECTION_TIMEOUT)
    }

    private stopReattemptInterval(targetNodeId: NodeId, spid: SPID): void {
        if (this.reattemptIntervals[spid.key] && this.reattemptIntervals[spid.key][targetNodeId]) {
            clearTimeout(this.reattemptIntervals[spid.key][targetNodeId])
            delete this.reattemptIntervals[spid.key][targetNodeId]
        }
        if (this.reattemptIntervals[spid.key] && Object.keys(this.reattemptIntervals[spid.key]).length === 0) {
            delete this.reattemptIntervals[spid.key]
        }
    }

    private async retryConnection(targetNodeId: NodeId, spid: SPID): Promise<void> {
        const trackerId = this.trackerManager.getTrackerId(spid)
        const trackerAddress = this.trackerManager.getTrackerAddress(spid)
        try {
            await this.openPeerConnection(targetNodeId, trackerId, trackerAddress)
            logger.trace(`Successful proxy stream reconnection to ${targetNodeId}`)
            this.stopReattemptInterval(targetNodeId, spid)
        } catch (err) {
            logger.warn(`Proxy stream reconnection attempt to ${targetNodeId} failed with error: ${err}`)
            this.startReattemptInterval(targetNodeId, spid)
        }
    }

    private async openPeerConnection(targetNodeId: NodeId, trackerId: string, trackerAddress: string): Promise<void> {
        await this.trackerManager.connectToSignallingOnlyTracker(trackerId, trackerAddress)
        await promiseTimeout(this.nodeConnectTimeout, this.nodeToNode.connectToNode(targetNodeId, trackerId, false))
    }

    stop(): void {
        Object.keys(this.attemptedPublishOnlyStreamConnections).forEach((stream) => {
            Object.values(this.attemptedPublishOnlyStreamConnections[stream]).forEach((timeout) => {
                clearTimeout(timeout)
            })
            delete this.attemptedPublishOnlyStreamConnections[stream]
        })
        Object.keys(this.reattemptIntervals).forEach((stream) => {
            Object.values(this.reattemptIntervals[stream]).forEach((timeout) => {
                clearTimeout(timeout)
            })
            delete this.reattemptIntervals[stream]
        })
    }
}