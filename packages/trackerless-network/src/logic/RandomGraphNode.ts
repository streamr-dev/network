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
import { DeliveryRpcClient } from '../proto/packages/trackerless-network/protos/NetworkRpc.client'
import { DeliveryRpcRemote } from './DeliveryRpcRemote'
import { IDeliveryRpc } from '../proto/packages/trackerless-network/protos/NetworkRpc.server'
import { DuplicateMessageDetector } from './DuplicateMessageDetector'
import { Logger, addManagedEventListener } from '@streamr/utils'
import { Handshaker } from './neighbor-discovery/Handshaker'
import { Propagation } from './propagation/Propagation'
import { NeighborFinder } from './neighbor-discovery/NeighborFinder'
import { NeighborUpdateManager } from './neighbor-discovery/NeighborUpdateManager'
import { DeliveryRpcLocal } from './DeliveryRpcLocal'
import { ProxyConnectionRpcLocal } from './proxy/ProxyConnectionRpcLocal'
import { Inspector } from './inspect/Inspector'
import { TemporaryConnectionRpcLocal } from './temporary-connection/TemporaryConnectionRpcLocal'
import { markAndCheckDuplicate } from './utils'
import { Layer1Node } from './Layer1Node'
import { StreamPartID } from '@streamr/protocol'
import { uniqBy } from 'lodash'

export interface Events {
    message: (message: StreamMessage) => void
    neighborConnected: (nodeId: DhtAddress) => void
    entryPointLeaveDetected: () => void
}

export interface StrictRandomGraphNodeConfig {
    streamPartId: StreamPartID
    layer1Node: Layer1Node
    transport: ITransport
    connectionLocker: ConnectionLocker
    localPeerDescriptor: PeerDescriptor
    nodeViewSize: number
    nearbyNodeView: NodeList
    randomNodeView: NodeList
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

const logger = new Logger(module)

export class RandomGraphNode extends EventEmitter<Events> {

    private started = false
    private readonly duplicateDetectors: Map<string, DuplicateMessageDetector>
    private config: StrictRandomGraphNodeConfig
    private readonly deliveryRpcLocal: IDeliveryRpc
    private abortController: AbortController = new AbortController()

    constructor(config: StrictRandomGraphNodeConfig) {
        super()
        this.config = config
        this.duplicateDetectors = new Map()
        this.deliveryRpcLocal = new DeliveryRpcLocal({
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
                || this.config.proxyConnectionRpcLocal?.getConnection(sourceId )?.remote
                // TODO: check integrity of notifier?
                if (contact) {
                    this.config.layer1Node.removeContact(sourceId)
                    this.config.neighbors.remove(sourceId)
                    this.config.nearbyNodeView.remove(sourceId)
                    this.config.connectionLocker.unlockConnection(contact.getPeerDescriptor(), this.config.streamPartId)
                    this.config.neighborFinder.start([sourceId])
                    this.config.proxyConnectionRpcLocal?.removeConnection(sourceId)
                }
                if (sourceIsStreamEntryPoint) {
                    this.emit('entryPointLeaveDetected')
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
            'contactAdded',
            (_peerDescriptor: PeerDescriptor, closestPeers: PeerDescriptor[]) => this.onContactAdded(closestPeers),
            this.abortController.signal
        )
        addManagedEventListener<any, any>(
            this.config.layer1Node as any,
            'contactRemoved',
            (_peerDescriptor: PeerDescriptor, closestPeers: PeerDescriptor[]) => this.onContactRemoved(closestPeers),
            this.abortController.signal
        )
        addManagedEventListener<any, any>(
            this.config.layer1Node as any,
            'randomContactAdded',
            (_peerDescriptor: PeerDescriptor, randomPeers: PeerDescriptor[]) => this.onRandomContactAdded(randomPeers),
            this.abortController.signal
        )   
        addManagedEventListener<any, any>(
            this.config.layer1Node as any,
            'randomContactRemoved',
            (_peerDescriptor: PeerDescriptor, randomPeers: PeerDescriptor[]) => this.onRandomContactRemoved(randomPeers),
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
            (id, _remote) => {
                this.config.propagation.onNeighborJoined(id)
                this.emit('neighborConnected', id)
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
        const candidates = this.getNeighborCandidatesFromLayer1()
        if (candidates.length > 0) {
            this.onContactAdded(candidates)
        }
        this.config.neighborFinder.start()
        await this.config.neighborUpdateManager.start()
    }

    private registerDefaultServerMethods(): void {
        this.config.rpcCommunicator.registerRpcNotification(StreamMessage, 'sendStreamMessage',
            (msg: StreamMessage, context) => this.deliveryRpcLocal.sendStreamMessage(msg, context))
        this.config.rpcCommunicator.registerRpcNotification(LeaveStreamPartNotice, 'leaveStreamPartNotice',
            (req: LeaveStreamPartNotice, context) => this.deliveryRpcLocal.leaveStreamPartNotice(req, context))
        this.config.rpcCommunicator.registerRpcMethod(TemporaryConnectionRequest, TemporaryConnectionResponse, 'openConnection',
            (req: TemporaryConnectionRequest, context) => this.config.temporaryConnectionRpcLocal.openConnection(req, context))
        this.config.rpcCommunicator.registerRpcNotification(CloseTemporaryConnection, 'closeConnection',
            (req: TemporaryConnectionRequest, context) => this.config.temporaryConnectionRpcLocal.closeConnection(req, context))
    }

    private onContactAdded(closestNodes: PeerDescriptor[]): void {
        logger.trace(`New nearby contact found`)
        if (this.isStopped()) {
            return
        }
        this.updateNearbyNodeView(closestNodes)
        if (this.config.neighbors.size() < this.config.neighborTargetCount) {
            this.config.neighborFinder.start()
        }
    }

    private onContactRemoved(closestNodes: PeerDescriptor[]): void {
        logger.trace(`Nearby contact removed`)
        if (this.isStopped()) {
            return
        }
        this.updateNearbyNodeView(closestNodes)
    }

    private updateNearbyNodeView(nodes: PeerDescriptor[]) {
        this.config.nearbyNodeView.replaceAll(Array.from(nodes).map((descriptor) =>
            new DeliveryRpcRemote(
                this.config.localPeerDescriptor,
                descriptor,
                this.config.rpcCommunicator,
                DeliveryRpcClient,
                this.config.rpcRequestTimeout
            )
        ))
        for (const descriptor of this.config.layer1Node.getNeighbors()) {
            if (this.config.nearbyNodeView.size() >= this.config.nodeViewSize) {
                break
            }
            this.config.nearbyNodeView.add(
                new DeliveryRpcRemote(
                    this.config.localPeerDescriptor,
                    descriptor,
                    this.config.rpcCommunicator,
                    DeliveryRpcClient,
                    this.config.rpcRequestTimeout

                )
            )
        }
    }

    private onRandomContactAdded(randomNodes: PeerDescriptor[]): void {
        if (this.isStopped()) {
            return
        }
        this.config.randomNodeView.replaceAll(randomNodes.map((descriptor) =>
            new DeliveryRpcRemote(
                this.config.localPeerDescriptor,
                descriptor,
                this.config.rpcCommunicator,
                DeliveryRpcClient,
                this.config.rpcRequestTimeout
            )
        ))
        if (this.config.neighbors.size() < this.config.neighborTargetCount) {
            this.config.neighborFinder.start()
        }
    }

    private onRandomContactRemoved(randomNodes: PeerDescriptor[]): void {
        logger.trace(`New nearby contact found`)
        if (this.isStopped()) {
            return
        }
        this.config.randomNodeView.replaceAll(randomNodes.map((descriptor) =>
            new DeliveryRpcRemote(
                this.config.localPeerDescriptor,
                descriptor,
                this.config.rpcCommunicator,
                DeliveryRpcClient,
                this.config.rpcRequestTimeout
            )
        ))
    }

    private onNodeDisconnected(peerDescriptor: PeerDescriptor): void {
        const nodeId = getNodeIdFromPeerDescriptor(peerDescriptor)
        if (this.config.neighbors.has(nodeId)) {
            this.config.neighbors.remove(nodeId)
            this.config.connectionLocker.unlockConnection(peerDescriptor, this.config.streamPartId)
            this.config.neighborFinder.start([nodeId])
            this.config.temporaryConnectionRpcLocal.removeNode(nodeId)
        }
    }

    private getNeighborCandidatesFromLayer1(): PeerDescriptor[] {
        const nodes: PeerDescriptor[] = []
        this.config.layer1Node.getClosestContacts(this.config.nodeViewSize).forEach((peer: PeerDescriptor) => {
            nodes.push(peer)
        })
        this.config.layer1Node.getNeighbors().forEach((peer: PeerDescriptor) => {
            nodes.push(peer)
        })
        return uniqBy(nodes, (p) => getNodeIdFromPeerDescriptor(p))
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
        this.config.neighbors.getAll().map(
            (remote) => remote.leaveStreamPartNotice(this.config.streamPartId, this.config.isLocalNodeEntryPoint())
        )
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
