import { EventEmitter } from 'eventemitter3'
import {
    PeerDescriptor,
    ListeningRpcCommunicator,
    ITransport,
    ConnectionLocker,
    DhtAddress,
    getNodeIdFromPeerDescriptor
} from '@streamr/dht'
import {
    StreamMessage,
    LeaveStreamPartNotice,
    MessageRef,
    TemporaryConnectionRequest,
    TemporaryConnectionResponse,
    MessageID,
    CloseTemporaryConnection,
} from '../proto/packages/trackerless-network/protos/NetworkRpc'
import { NodeList } from './NodeList'
import { ContentDeliveryRpcClient } from '../proto/packages/trackerless-network/protos/NetworkRpc.client'
import { ContentDeliveryRpcRemote } from './ContentDeliveryRpcRemote'
import { DuplicateMessageDetector } from './DuplicateMessageDetector'
import { Logger, addManagedEventListener } from '@streamr/utils'
import { Handshaker } from './neighbor-discovery/Handshaker'
import { Propagation } from './propagation/Propagation'
import { NeighborFinder } from './neighbor-discovery/NeighborFinder'
import { NeighborUpdateManager } from './neighbor-discovery/NeighborUpdateManager'
import { ContentDeliveryRpcLocal } from './ContentDeliveryRpcLocal'
import { ProxyConnectionRpcLocal } from './proxy/ProxyConnectionRpcLocal'
import { Inspector } from './inspect/Inspector'
import { TemporaryConnectionRpcLocal } from './temporary-connection/TemporaryConnectionRpcLocal'
import { markAndCheckDuplicate } from './utils'
import { Layer1Node } from './Layer1Node'
import { StreamPartID } from '@streamr/protocol'

export interface Events {
    message: (message: StreamMessage) => void
    neighborConnected: (nodeId: DhtAddress) => void
    storedNodeLeaveDetected: () => void
}

export interface StrictContentDeliveryLayerNodeConfig {
    streamPartId: StreamPartID
    layer1Node: Layer1Node
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
    private config: StrictContentDeliveryLayerNodeConfig
    private readonly contentDeliveryRpcLocal: ContentDeliveryRpcLocal
    private abortController: AbortController = new AbortController()

    constructor(config: StrictContentDeliveryLayerNodeConfig) {
        super()
        this.config = config
        this.duplicateDetectors = new Map()
        this.contentDeliveryRpcLocal = new ContentDeliveryRpcLocal({
            localPeerDescriptor: this.config.localPeerDescriptor,
            streamPartId: this.config.streamPartId,
            rpcCommunicator: this.config.rpcCommunicator,
            markAndCheckDuplicate: (msg: MessageID, prev?: MessageRef) => markAndCheckDuplicate(this.duplicateDetectors, msg, prev),
            broadcast: (message: StreamMessage, previousNode?: DhtAddress) => this.broadcast(message, previousNode),
            onLeaveNotice: (sourceId: DhtAddress, sourceIsStreamEntryPoint: boolean) => {
                if (this.abortController.signal.aborted) {
                    return
                }
                const contact = this.config.nearbyNodeView.get(sourceId)
                || this.config.randomNodeView.get(sourceId)
                || this.config.neighbors.get(sourceId)
                || this.config.proxyConnectionRpcLocal?.getConnection(sourceId)?.remote
                // TODO: check integrity of notifier?
                if (contact) {
                    this.config.layer1Node.removeContact(sourceId)
                    this.config.neighbors.remove(sourceId)
                    this.config.nearbyNodeView.remove(sourceId)
                    this.config.randomNodeView.remove(sourceId)
                    this.config.leftNodeView.remove(sourceId)
                    this.config.rightNodeView.remove(sourceId)
                    this.config.neighborFinder.start([sourceId])
                    this.config.proxyConnectionRpcLocal?.removeConnection(sourceId)
                }
                if (sourceIsStreamEntryPoint) {
                    this.emit('storedNodeLeaveDetected')
                }
            },
            markForInspection: (senderId: DhtAddress, messageId: MessageID) => this.config.inspector.markMessage(senderId, messageId)
        })
    }

    async start(): Promise<void> {
        this.started = true
        this.registerDefaultServerMethods()
        addManagedEventListener<any, any>(
            this.config.layer1Node as any,
            'nearbyContactAdded', 
            () => this.onNearbyContactAdded(),
            this.abortController.signal
        )
        addManagedEventListener<any, any>(
            this.config.layer1Node as any,
            'nearbyContactRemoved',
            () => this.onNearbyContactRemoved(),
            this.abortController.signal
        )
        addManagedEventListener<any, any>(
            this.config.layer1Node as any,
            'randomContactAdded',
            () => this.onRandomContactAdded(),
            this.abortController.signal
        )
        addManagedEventListener<any, any>(
            this.config.layer1Node as any,
            'randomContactRemoved',
            () => this.onRandomContactRemoved(),
            this.abortController.signal
        )
        addManagedEventListener<any, any>(
            this.config.layer1Node as any,
            'ringContactAdded',
            () => this.onRingContactsUpdated(),
            this.abortController.signal
        )
        addManagedEventListener<any, any>(
            this.config.layer1Node as any,
            'ringContactRemoved',
            () => this.onRingContactsUpdated(),
            this.abortController.signal
        )
        addManagedEventListener<any, any>(
            this.config.transport as any,
            'disconnected',
            (peerDescriptor: PeerDescriptor) => this.onNodeDisconnected(peerDescriptor),
            this.abortController.signal
        )
        addManagedEventListener(
            this.config.neighbors,
            'nodeAdded',
            (id, remote) => {
                this.config.propagation.onNeighborJoined(id)
                this.config.connectionLocker.weakLockConnection(
                    getNodeIdFromPeerDescriptor(remote.getPeerDescriptor()),
                    this.config.streamPartId
                )
                this.emit('neighborConnected', id)
            },
            this.abortController.signal
        )
        addManagedEventListener(
            this.config.neighbors,
            'nodeRemoved',
            (_id, remote) => {
                this.config.connectionLocker.weakUnlockConnection(
                    getNodeIdFromPeerDescriptor(remote.getPeerDescriptor()),
                    this.config.streamPartId
                )
            },
            this.abortController.signal
        )
        if (this.config.proxyConnectionRpcLocal !== undefined) {
            addManagedEventListener(
                this.config.proxyConnectionRpcLocal,
                'newConnection',
                (id: DhtAddress) => this.config.propagation.onNeighborJoined(id),
                this.abortController.signal
            )
        }
        this.config.neighborFinder.start()
        await this.config.neighborUpdateManager.start()
    }

    private registerDefaultServerMethods(): void {
        this.config.rpcCommunicator.registerRpcNotification(StreamMessage, 'sendStreamMessage',
            (msg: StreamMessage, context) => this.contentDeliveryRpcLocal.sendStreamMessage(msg, context))
        this.config.rpcCommunicator.registerRpcNotification(LeaveStreamPartNotice, 'leaveStreamPartNotice',
            (req: LeaveStreamPartNotice, context) => this.contentDeliveryRpcLocal.leaveStreamPartNotice(req, context))
        this.config.rpcCommunicator.registerRpcMethod(TemporaryConnectionRequest, TemporaryConnectionResponse, 'openConnection',
            (req: TemporaryConnectionRequest, context) => this.config.temporaryConnectionRpcLocal.openConnection(req, context))
        this.config.rpcCommunicator.registerRpcNotification(CloseTemporaryConnection, 'closeConnection',
            (req: TemporaryConnectionRequest, context) => this.config.temporaryConnectionRpcLocal.closeConnection(req, context))
    }

    private onRingContactsUpdated(): void {
        logger.trace('onRingContactsUpdated')
        if (this.isStopped()) {
            return
        }
        const contacts = this.config.layer1Node.getRingContacts()
        this.config.leftNodeView.replaceAll(contacts.left.map((peer) => 
            new ContentDeliveryRpcRemote(
                this.config.localPeerDescriptor,
                peer,
                this.config.rpcCommunicator,
                ContentDeliveryRpcClient,
                this.config.rpcRequestTimeout
            )
        ))
        this.config.rightNodeView.replaceAll(contacts.right.map((peer) =>
            new ContentDeliveryRpcRemote(
                this.config.localPeerDescriptor,
                peer,
                this.config.rpcCommunicator,
                ContentDeliveryRpcClient,
                this.config.rpcRequestTimeout
            )
        ))
    }

    private onNearbyContactAdded(): void {
        logger.trace(`New nearby contact found`)
        if (this.isStopped()) {
            return
        }
        const closestContacts = this.config.layer1Node.getClosestContacts()
        this.updateNearbyNodeView(closestContacts)
        if (this.config.neighbors.size() < this.config.neighborTargetCount) {
            this.config.neighborFinder.start()
        }
    }

    private onNearbyContactRemoved(): void {
        logger.trace(`Nearby contact removed`)
        if (this.isStopped()) {
            return
        }
        const closestContacts = this.config.layer1Node.getClosestContacts()
        this.updateNearbyNodeView(closestContacts)
    }

    private updateNearbyNodeView(nodes: PeerDescriptor[]) {
        this.config.nearbyNodeView.replaceAll(Array.from(nodes).map((descriptor) =>
            new ContentDeliveryRpcRemote(
                this.config.localPeerDescriptor,
                descriptor,
                this.config.rpcCommunicator,
                ContentDeliveryRpcClient,
                this.config.rpcRequestTimeout
            )
        ))
        for (const descriptor of this.config.layer1Node.getNeighbors()) {
            if (this.config.nearbyNodeView.size() >= this.config.nodeViewSize) {
                break
            }
            this.config.nearbyNodeView.add(
                new ContentDeliveryRpcRemote(
                    this.config.localPeerDescriptor,
                    descriptor,
                    this.config.rpcCommunicator,
                    ContentDeliveryRpcClient,
                    this.config.rpcRequestTimeout
                )
            )
        }
    }

    private onRandomContactAdded(): void {
        if (this.isStopped()) {
            return
        }
        const randomContacts = this.config.layer1Node.getRandomContacts(RANDOM_NODE_VIEW_SIZE)
        this.config.randomNodeView.replaceAll(randomContacts.map((descriptor) =>
            new ContentDeliveryRpcRemote(
                this.config.localPeerDescriptor,
                descriptor,
                this.config.rpcCommunicator,
                ContentDeliveryRpcClient,
                this.config.rpcRequestTimeout
            )
        ))
        if (this.config.neighbors.size() < this.config.neighborTargetCount) {
            this.config.neighborFinder.start()
        }
    }

    private onRandomContactRemoved(): void {
        logger.trace(`New random contact removed`)
        if (this.isStopped()) {
            return
        }
        const randomContacts = this.config.layer1Node.getRandomContacts(RANDOM_NODE_VIEW_SIZE)
        this.config.randomNodeView.replaceAll(randomContacts.map((descriptor) =>
            new ContentDeliveryRpcRemote(
                this.config.localPeerDescriptor,
                descriptor,
                this.config.rpcCommunicator,
                ContentDeliveryRpcClient,
                this.config.rpcRequestTimeout
            )
        ))
    }

    private onNodeDisconnected(peerDescriptor: PeerDescriptor): void {
        const nodeId = getNodeIdFromPeerDescriptor(peerDescriptor)
        if (this.config.neighbors.has(nodeId)) {
            this.config.neighbors.remove(nodeId)
            this.config.neighborFinder.start([nodeId])
            this.config.temporaryConnectionRpcLocal.removeNode(nodeId)
        }
    }

    hasProxyConnection(nodeId: DhtAddress): boolean {
        if (this.config.proxyConnectionRpcLocal) {
            return this.config.proxyConnectionRpcLocal.hasConnection(nodeId)
        }
        return false
    }

    stop(): void {
        if (!this.started) {
            return
        }
        this.abortController.abort()
        this.config.proxyConnectionRpcLocal?.stop()
        this.config.neighbors.getAll().map((remote) => {
            remote.leaveStreamPartNotice(this.config.streamPartId, this.config.isLocalNodeEntryPoint())
            this.config.connectionLocker.weakUnlockConnection(
                getNodeIdFromPeerDescriptor(remote.getPeerDescriptor()),
                this.config.streamPartId
            )
        })
        this.config.rpcCommunicator.destroy()
        this.removeAllListeners()
        this.config.nearbyNodeView.stop()
        this.config.neighbors.stop()
        this.config.randomNodeView.stop()
        this.config.neighborFinder.stop()
        this.config.neighborUpdateManager.stop()
        this.config.inspector.stop()
    }

    broadcast(msg: StreamMessage, previousNode?: DhtAddress): void {
        if (!previousNode) {
            markAndCheckDuplicate(this.duplicateDetectors, msg.messageId!, msg.previousMessageRef)
        }
        this.emit('message', msg)
        const skipBackPropagation = previousNode !== undefined && !this.config.temporaryConnectionRpcLocal.hasNode(previousNode)
        this.config.propagation.feedUnseenMessage(msg, this.getPropagationTargets(msg), skipBackPropagation ? previousNode : null)
    }

    inspect(peerDescriptor: PeerDescriptor): Promise<boolean> {
        return this.config.inspector.inspect(peerDescriptor)
    }

    private getPropagationTargets(msg: StreamMessage): DhtAddress[] {
        let propagationTargets = this.config.neighbors.getIds()
        if (this.config.proxyConnectionRpcLocal) {
            propagationTargets = propagationTargets.concat(this.config.proxyConnectionRpcLocal.getPropagationTargets(msg))
        }
        propagationTargets = propagationTargets.concat(this.config.temporaryConnectionRpcLocal.getNodes().getIds())
        return propagationTargets
    }

    getOwnNodeId(): DhtAddress {
        return getNodeIdFromPeerDescriptor(this.config.localPeerDescriptor)
    }

    getOutgoingHandshakeCount(): number {
        return this.config.handshaker.getOngoingHandshakes().size
    }

    getNeighbors(): PeerDescriptor[] {
        if (!this.started && this.isStopped()) {
            return []
        }
        return this.config.neighbors.getAll().map((n) => n.getPeerDescriptor())
    }

    getNearbyNodeView(): NodeList {
        return this.config.nearbyNodeView
    }

    private isStopped() {
        return this.abortController.signal.aborted
    }
}
