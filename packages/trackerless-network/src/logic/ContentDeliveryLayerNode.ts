import {
    ConnectionLocker,
    DhtAddress,
    ITransport,
    ListeningRpcCommunicator,
    PeerDescriptor,
    toNodeId
} from '@streamr/dht'
import { Logger, StreamPartID, addManagedEventListener } from '@streamr/utils'
import { EventEmitter } from 'eventemitter3'
import {
    CloseTemporaryConnection,
    LeaveStreamPartNotice,
    MessageID,
    MessageRef,
    StreamMessage,
    TemporaryConnectionRequest,
    TemporaryConnectionResponse
} from '../../generated/packages/trackerless-network/protos/NetworkRpc'
import { ContentDeliveryRpcClient } from '../../generated/packages/trackerless-network/protos/NetworkRpc.client'
import { ContentDeliveryRpcLocal } from './ContentDeliveryRpcLocal'
import { ContentDeliveryRpcRemote } from './ContentDeliveryRpcRemote'
import { DiscoveryLayerNode } from './DiscoveryLayerNode'
import { DuplicateMessageDetector } from './DuplicateMessageDetector'
import { NodeList } from './NodeList'
import { Inspector } from './inspect/Inspector'
import { Handshaker } from './neighbor-discovery/Handshaker'
import { NeighborFinder } from './neighbor-discovery/NeighborFinder'
import { NeighborUpdateManager } from './neighbor-discovery/NeighborUpdateManager'
import { Propagation } from './propagation/Propagation'
import { ProxyConnectionRpcLocal } from './proxy/ProxyConnectionRpcLocal'
import { TemporaryConnectionRpcLocal } from './temporary-connection/TemporaryConnectionRpcLocal'
import { markAndCheckDuplicate } from './utils'
import { ContentDeliveryLayerNeighborInfo } from '../types'

export interface Events {
    message: (message: StreamMessage) => void
    neighborConnected: (nodeId: DhtAddress) => void
    entryPointLeaveDetected: () => void
}

export interface StrictContentDeliveryLayerNodeOptions {
    streamPartId: StreamPartID
    discoveryLayerNode: DiscoveryLayerNode
    transport: ITransport
    connectionLocker: ConnectionLocker
    localPeerDescriptor: PeerDescriptor
    nodeViewSize: number
    nearbyNodeView: NodeList
    randomNodeView: NodeList
    leftNodeView: NodeList
    rightNodeView: NodeList
    neighbors: NodeList
    handshaker: Handshaker
    neighborFinder: NeighborFinder
    neighborUpdateManager: NeighborUpdateManager
    propagation: Propagation
    rpcCommunicator: ListeningRpcCommunicator
    neighborTargetCount: number
    inspector: Inspector
    temporaryConnectionRpcLocal: TemporaryConnectionRpcLocal
    isLocalNodeEntryPoint: () => boolean

    proxyConnectionRpcLocal?: ProxyConnectionRpcLocal
    rpcRequestTimeout?: number
}

const RANDOM_NODE_VIEW_SIZE = 20

const logger = new Logger(module)

export class ContentDeliveryLayerNode extends EventEmitter<Events> {
    private started = false
    private readonly duplicateDetectors: Map<string, DuplicateMessageDetector>
    private options: StrictContentDeliveryLayerNodeOptions
    private readonly contentDeliveryRpcLocal: ContentDeliveryRpcLocal
    private abortController: AbortController = new AbortController()
    private messagesPropagated = 0

    constructor(options: StrictContentDeliveryLayerNodeOptions) {
        super()
        this.options = options
        this.duplicateDetectors = new Map()
        this.contentDeliveryRpcLocal = new ContentDeliveryRpcLocal({
            localPeerDescriptor: this.options.localPeerDescriptor,
            streamPartId: this.options.streamPartId,
            rpcCommunicator: this.options.rpcCommunicator,
            markAndCheckDuplicate: (msg: MessageID, prev?: MessageRef) =>
                markAndCheckDuplicate(this.duplicateDetectors, msg, prev),
            broadcast: (message: StreamMessage, previousNode?: DhtAddress) => this.broadcast(message, previousNode),
            onLeaveNotice: (remoteNodeId: DhtAddress, sourceIsStreamEntryPoint: boolean) => {
                if (this.abortController.signal.aborted) {
                    return
                }
                const contact =
                    this.options.nearbyNodeView.get(remoteNodeId) ??
                    this.options.randomNodeView.get(remoteNodeId) ??
                    this.options.neighbors.get(remoteNodeId) ??
                    this.options.proxyConnectionRpcLocal?.getConnection(remoteNodeId)?.remote
                // TODO: check integrity of notifier?
                if (contact) {
                    this.options.discoveryLayerNode.removeContact(remoteNodeId)
                    this.options.neighbors.remove(remoteNodeId)
                    this.options.nearbyNodeView.remove(remoteNodeId)
                    this.options.randomNodeView.remove(remoteNodeId)
                    this.options.leftNodeView.remove(remoteNodeId)
                    this.options.rightNodeView.remove(remoteNodeId)
                    this.options.neighborFinder.start([remoteNodeId])
                    this.options.proxyConnectionRpcLocal?.removeConnection(remoteNodeId)
                }
                if (sourceIsStreamEntryPoint) {
                    this.emit('entryPointLeaveDetected')
                }
            },
            markForInspection: (remoteNodeId: DhtAddress, messageId: MessageID) =>
                this.options.inspector.markMessage(remoteNodeId, messageId)
        })
    }

    async start(): Promise<void> {
        this.started = true
        this.registerDefaultServerMethods()
        addManagedEventListener(
            this.options.discoveryLayerNode,
            'nearbyContactAdded',
            () => this.onNearbyContactAdded(),
            this.abortController.signal
        )
        addManagedEventListener(
            this.options.discoveryLayerNode,
            'nearbyContactRemoved',
            () => this.onNearbyContactRemoved(),
            this.abortController.signal
        )
        addManagedEventListener(
            this.options.discoveryLayerNode,
            'randomContactAdded',
            () => this.onRandomContactAdded(),
            this.abortController.signal
        )
        addManagedEventListener(
            this.options.discoveryLayerNode,
            'randomContactRemoved',
            () => this.onRandomContactRemoved(),
            this.abortController.signal
        )
        addManagedEventListener(
            this.options.discoveryLayerNode,
            'ringContactAdded',
            () => this.onRingContactsUpdated(),
            this.abortController.signal
        )
        addManagedEventListener(
            this.options.discoveryLayerNode,
            'ringContactRemoved',
            () => this.onRingContactsUpdated(),
            this.abortController.signal
        )
        addManagedEventListener(
            this.options.transport,
            'disconnected',
            (peerDescriptor: PeerDescriptor) => this.onNodeDisconnected(peerDescriptor),
            this.abortController.signal
        )
        addManagedEventListener(
            this.options.neighbors,
            'nodeAdded',
            (id, remote) => {
                this.options.propagation.onNeighborJoined(id)
                this.options.connectionLocker.weakLockConnection(
                    toNodeId(remote.getPeerDescriptor()),
                    this.options.streamPartId
                )
                this.emit('neighborConnected', id)
            },
            this.abortController.signal
        )
        addManagedEventListener(
            this.options.neighbors,
            'nodeRemoved',
            (_id, remote) => {
                this.options.connectionLocker.weakUnlockConnection(
                    toNodeId(remote.getPeerDescriptor()),
                    this.options.streamPartId
                )
            },
            this.abortController.signal
        )
        if (this.options.proxyConnectionRpcLocal !== undefined) {
            addManagedEventListener(
                this.options.proxyConnectionRpcLocal,
                'newConnection',
                (id: DhtAddress) => this.options.propagation.onNeighborJoined(id),
                this.abortController.signal
            )
        }
        this.options.neighborFinder.start()
        await this.options.neighborUpdateManager.start()
    }

    private registerDefaultServerMethods(): void {
        this.options.rpcCommunicator.registerRpcNotification(
            StreamMessage,
            'sendStreamMessage',
            (msg: StreamMessage, context) => this.contentDeliveryRpcLocal.sendStreamMessage(msg, context)
        )
        this.options.rpcCommunicator.registerRpcNotification(
            LeaveStreamPartNotice,
            'leaveStreamPartNotice',
            (req: LeaveStreamPartNotice, context) => this.contentDeliveryRpcLocal.leaveStreamPartNotice(req, context)
        )
        this.options.rpcCommunicator.registerRpcMethod(
            TemporaryConnectionRequest,
            TemporaryConnectionResponse,
            'openConnection',
            (req: TemporaryConnectionRequest, context) =>
                this.options.temporaryConnectionRpcLocal.openConnection(req, context)
        )
        this.options.rpcCommunicator.registerRpcNotification(
            CloseTemporaryConnection,
            'closeConnection',
            (req: TemporaryConnectionRequest, context) =>
                this.options.temporaryConnectionRpcLocal.closeConnection(req, context)
        )
    }

    private onRingContactsUpdated(): void {
        logger.trace('onRingContactsUpdated')
        if (this.isStopped()) {
            return
        }
        const contacts = this.options.discoveryLayerNode.getRingContacts()
        this.options.leftNodeView.replaceAll(
            contacts.left.map(
                (peer) =>
                    new ContentDeliveryRpcRemote(
                        this.options.localPeerDescriptor,
                        peer,
                        this.options.rpcCommunicator,
                        ContentDeliveryRpcClient,
                        this.options.rpcRequestTimeout
                    )
            )
        )
        this.options.rightNodeView.replaceAll(
            contacts.right.map(
                (peer) =>
                    new ContentDeliveryRpcRemote(
                        this.options.localPeerDescriptor,
                        peer,
                        this.options.rpcCommunicator,
                        ContentDeliveryRpcClient,
                        this.options.rpcRequestTimeout
                    )
            )
        )
    }

    private onNearbyContactAdded(): void {
        logger.trace(`New nearby contact found`)
        if (this.isStopped()) {
            return
        }
        const closestContacts = this.options.discoveryLayerNode.getClosestContacts()
        this.updateNearbyNodeView(closestContacts)
        if (this.options.neighbors.size() < this.options.neighborTargetCount) {
            this.options.neighborFinder.start()
        }
    }

    private onNearbyContactRemoved(): void {
        logger.trace(`Nearby contact removed`)
        if (this.isStopped()) {
            return
        }
        const closestContacts = this.options.discoveryLayerNode.getClosestContacts()
        this.updateNearbyNodeView(closestContacts)
    }

    private updateNearbyNodeView(nodes: PeerDescriptor[]) {
        this.options.nearbyNodeView.replaceAll(
            Array.from(nodes).map(
                (descriptor) =>
                    new ContentDeliveryRpcRemote(
                        this.options.localPeerDescriptor,
                        descriptor,
                        this.options.rpcCommunicator,
                        ContentDeliveryRpcClient,
                        this.options.rpcRequestTimeout
                    )
            )
        )
        for (const descriptor of this.options.discoveryLayerNode.getNeighbors()) {
            if (this.options.nearbyNodeView.size() >= this.options.nodeViewSize) {
                break
            }
            this.options.nearbyNodeView.add(
                new ContentDeliveryRpcRemote(
                    this.options.localPeerDescriptor,
                    descriptor,
                    this.options.rpcCommunicator,
                    ContentDeliveryRpcClient,
                    this.options.rpcRequestTimeout
                )
            )
        }
    }

    private onRandomContactAdded(): void {
        if (this.isStopped()) {
            return
        }
        const randomContacts = this.options.discoveryLayerNode.getRandomContacts(RANDOM_NODE_VIEW_SIZE)
        this.options.randomNodeView.replaceAll(
            randomContacts.map(
                (descriptor) =>
                    new ContentDeliveryRpcRemote(
                        this.options.localPeerDescriptor,
                        descriptor,
                        this.options.rpcCommunicator,
                        ContentDeliveryRpcClient,
                        this.options.rpcRequestTimeout
                    )
            )
        )
        if (this.options.neighbors.size() < this.options.neighborTargetCount) {
            this.options.neighborFinder.start()
        }
    }

    private onRandomContactRemoved(): void {
        logger.trace(`New random contact removed`)
        if (this.isStopped()) {
            return
        }
        const randomContacts = this.options.discoveryLayerNode.getRandomContacts(RANDOM_NODE_VIEW_SIZE)
        this.options.randomNodeView.replaceAll(
            randomContacts.map(
                (descriptor) =>
                    new ContentDeliveryRpcRemote(
                        this.options.localPeerDescriptor,
                        descriptor,
                        this.options.rpcCommunicator,
                        ContentDeliveryRpcClient,
                        this.options.rpcRequestTimeout
                    )
            )
        )
    }

    private onNodeDisconnected(peerDescriptor: PeerDescriptor): void {
        const nodeId = toNodeId(peerDescriptor)
        if (this.options.neighbors.has(nodeId)) {
            this.options.neighbors.remove(nodeId)
            this.options.neighborFinder.start([nodeId])
            this.options.temporaryConnectionRpcLocal.removeNode(nodeId)
        }
    }

    hasProxyConnection(nodeId: DhtAddress): boolean {
        if (this.options.proxyConnectionRpcLocal) {
            return this.options.proxyConnectionRpcLocal.hasConnection(nodeId)
        }
        return false
    }

    stop(): void {
        if (!this.started) {
            return
        }
        this.abortController.abort()
        this.options.proxyConnectionRpcLocal?.stop()
        this.options.neighbors.getAll().map((remote) => {
            remote.leaveStreamPartNotice(this.options.streamPartId, this.options.isLocalNodeEntryPoint())
            this.options.connectionLocker.weakUnlockConnection(
                toNodeId(remote.getPeerDescriptor()),
                this.options.streamPartId
            )
        })
        this.options.rpcCommunicator.destroy()
        this.removeAllListeners()
        this.options.nearbyNodeView.stop()
        this.options.neighbors.stop()
        this.options.randomNodeView.stop()
        this.options.neighborFinder.stop()
        this.options.neighborUpdateManager.stop()
        this.options.inspector.stop()
    }

    broadcast(msg: StreamMessage, previousNode?: DhtAddress): void {
        if (!previousNode) {
            markAndCheckDuplicate(this.duplicateDetectors, msg.messageId!, msg.previousMessageRef)
        }
        this.emit('message', msg)
        const skipBackPropagation =
            previousNode !== undefined && !this.options.temporaryConnectionRpcLocal.hasNode(previousNode)
        this.options.propagation.feedUnseenMessage(
            msg,
            this.getPropagationTargets(msg),
            skipBackPropagation ? previousNode : null
        )
        this.messagesPropagated += 1
    }

    inspect(peerDescriptor: PeerDescriptor): Promise<boolean> {
        return this.options.inspector.inspect(peerDescriptor)
    }

    private getPropagationTargets(msg: StreamMessage): DhtAddress[] {
        let propagationTargets = this.options.neighbors.getIds()
        if (this.options.proxyConnectionRpcLocal) {
            propagationTargets = propagationTargets.concat(
                this.options.proxyConnectionRpcLocal.getPropagationTargets(msg)
            )
        }
        propagationTargets = propagationTargets.concat(this.options.temporaryConnectionRpcLocal.getNodes().getIds())
        return propagationTargets
    }

    getOwnNodeId(): DhtAddress {
        return toNodeId(this.options.localPeerDescriptor)
    }

    getOutgoingHandshakeCount(): number {
        return this.options.handshaker.getOngoingHandshakes().size
    }

    getNeighbors(): PeerDescriptor[] {
        if (!this.started && this.isStopped()) {
            return []
        }
        return this.options.neighbors.getAll().map((n) => n.getPeerDescriptor())
    }

    getInfos(): ContentDeliveryLayerNeighborInfo[] {
        return this.options.neighbors.getAll().map((n) => {
            return {
                peerDescriptor: n.getPeerDescriptor(),
                rtt: n.getRtt()
            }
        })
    }

    getNearbyNodeView(): NodeList {
        return this.options.nearbyNodeView
    }

    public getDiagnosticInfo(): Record<string, unknown> {
        return {
            neighborCount: this.options.neighbors.size(),
            nearbyNodeViewCount: this.options.nearbyNodeView.size(),
            randomNodeViewCount: this.options.randomNodeView.size(),
            leftNodeViewCount: this.options.leftNodeView.size(),
            rightNodeViewCount: this.options.rightNodeView.size(),
            messagesPropagated: this.messagesPropagated
        }
    }

    private isStopped() {
        return this.abortController.signal.aborted
    }
}
