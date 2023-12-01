import { EventEmitter } from 'eventemitter3'
import {
    PeerDescriptor,
    ListeningRpcCommunicator,
    ITransport,
    ConnectionLocker
} from '@streamr/dht'
import {
    StreamMessage,
    LeaveStreamPartNotice,
    MessageRef,
    TemporaryConnectionRequest,
    TemporaryConnectionResponse,
    MessageID,
} from '../proto/packages/trackerless-network/protos/NetworkRpc'
import { NodeList } from './NodeList'
import { DeliveryRpcClient } from '../proto/packages/trackerless-network/protos/NetworkRpc.client'
import { DeliveryRpcRemote } from './DeliveryRpcRemote'
import { IDeliveryRpc } from '../proto/packages/trackerless-network/protos/NetworkRpc.server'
import { DuplicateMessageDetector } from './DuplicateMessageDetector'
import { Logger, addManagedEventListener } from '@streamr/utils'
import { toProtoRpcClient } from '@streamr/proto-rpc'
import { Handshaker } from './neighbor-discovery/Handshaker'
import { Propagation } from './propagation/Propagation'
import { NeighborFinder } from './neighbor-discovery/NeighborFinder'
import { NeighborUpdateManager } from './neighbor-discovery/NeighborUpdateManager'
import { DeliveryRpcLocal } from './DeliveryRpcLocal'
import { ProxyConnectionRpcLocal } from './proxy/ProxyConnectionRpcLocal'
import { Inspector } from './inspect/Inspector'
import { TemporaryConnectionRpcLocal } from './temporary-connection/TemporaryConnectionRpcLocal'
import { markAndCheckDuplicate } from './utils'
import { NodeID, getNodeIdFromPeerDescriptor } from '../identifiers'
import { Layer1Node } from './Layer1Node'
import { StreamPartID } from '@streamr/protocol'

export interface Events {
    message: (message: StreamMessage) => void
    targetNeighborConnected: (nodeId: NodeID) => void
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
    targetNeighbors: NodeList
    handshaker: Handshaker
    neighborFinder: NeighborFinder
    neighborUpdateManager: NeighborUpdateManager
    propagation: Propagation
    rpcCommunicator: ListeningRpcCommunicator
    numOfTargetNeighbors: number
    inspector: Inspector
    temporaryConnectionRpcLocal: TemporaryConnectionRpcLocal
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
            broadcast: (message: StreamMessage, previousNode?: NodeID) => this.broadcast(message, previousNode),
            onLeaveNotice: (senderId: NodeID) => {
                const contact = this.config.nearbyNodeView.get(senderId)
                || this.config.randomNodeView.get(senderId)
                || this.config.targetNeighbors.get(senderId)
                || this.config.proxyConnectionRpcLocal?.getConnection(senderId )?.remote
                // TODO: check integrity of notifier?
                if (contact) {
                    this.config.layer1Node.removeContact(contact.getPeerDescriptor())
                    this.config.targetNeighbors.remove(contact.getPeerDescriptor())
                    this.config.nearbyNodeView.remove(contact.getPeerDescriptor())
                    this.config.connectionLocker.unlockConnection(contact.getPeerDescriptor(), this.config.streamPartId)
                    this.config.neighborFinder.start([senderId])
                    this.config.proxyConnectionRpcLocal?.removeConnection(senderId)
                }
            },
            markForInspection: (senderId: NodeID, messageId: MessageID) => this.config.inspector.markMessage(senderId, messageId)
        })
    }

    async start(): Promise<void> {
        this.started = true
        this.registerDefaultServerMethods()
        addManagedEventListener<any, any>(
            this.config.layer1Node as any,
            'newContact',
            (_peerDescriptor: PeerDescriptor, closestPeers: PeerDescriptor[]) => this.newContact(closestPeers),
            this.abortController.signal
        )
        addManagedEventListener<any, any>(
            this.config.layer1Node as any,
            'contactRemoved',
            (_peerDescriptor: PeerDescriptor, closestPeers: PeerDescriptor[]) => this.removedContact(closestPeers),
            this.abortController.signal
        )
        addManagedEventListener<any, any>(
            this.config.layer1Node as any,
            'newRandomContact',
            (_peerDescriptor: PeerDescriptor, randomPeers: PeerDescriptor[]) => this.newRandomContact(randomPeers),
            this.abortController.signal
        )   
        addManagedEventListener<any, any>(
            this.config.layer1Node as any,
            'randomContactRemoved',
            (_peerDescriptor: PeerDescriptor, randomPeers: PeerDescriptor[]) => this.removedRandomContact(randomPeers),
            this.abortController.signal
        )   
        addManagedEventListener<any, any>(
            this.config.transport as any,
            'disconnected',
            (peerDescriptor: PeerDescriptor) => this.onNodeDisconnected(peerDescriptor),
            this.abortController.signal
        )
        addManagedEventListener(
            this.config.targetNeighbors,
            'nodeAdded',
            (id, _remote) => {
                this.config.propagation.onNeighborJoined(id)
                this.emit('targetNeighborConnected', id)
            },
            this.abortController.signal
        )
        if (this.config.proxyConnectionRpcLocal !== undefined) {
            addManagedEventListener(
                this.config.proxyConnectionRpcLocal,
                'newConnection',
                (id: NodeID) => this.config.propagation.onNeighborJoined(id),
                this.abortController.signal
            )
        }
        const candidates = this.getNeighborCandidatesFromLayer1()
        if (candidates.length > 0) {
            this.newContact(candidates)
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
    }

    private newContact(closestNodes: PeerDescriptor[]): void {
        logger.trace(`New nearby contact found`)
        if (this.isStopped()) {
            return
        }
        this.updateNearbyNodeView(closestNodes)
        if (this.config.targetNeighbors.size() < this.config.numOfTargetNeighbors) {
            this.config.neighborFinder.start()
        }
    }

    private removedContact(closestNodes: PeerDescriptor[]): void {
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
                this.config.streamPartId,
                toProtoRpcClient(new DeliveryRpcClient(this.config.rpcCommunicator.getRpcClientTransport())),
                this.config.rpcRequestTimeout
            )
        ))
        for (const descriptor of this.config.layer1Node.getKBucketPeers()) {
            if (this.config.nearbyNodeView.size() >= this.config.nodeViewSize) {
                break
            }
            this.config.nearbyNodeView.add(
                new DeliveryRpcRemote(
                    this.config.localPeerDescriptor,
                    descriptor,
                    this.config.streamPartId,
                    toProtoRpcClient(new DeliveryRpcClient(this.config.rpcCommunicator.getRpcClientTransport())),
                    this.config.rpcRequestTimeout

                )
            )
        }
    }

    private newRandomContact(randomNodes: PeerDescriptor[]): void {
        if (this.isStopped()) {
            return
        }
        this.config.randomNodeView.replaceAll(randomNodes.map((descriptor) =>
            new DeliveryRpcRemote(
                this.config.localPeerDescriptor,
                descriptor,
                this.config.streamPartId,
                toProtoRpcClient(new DeliveryRpcClient(this.config.rpcCommunicator.getRpcClientTransport())),
                this.config.rpcRequestTimeout
            )
        ))
        if (this.config.targetNeighbors.size() < this.config.numOfTargetNeighbors) {
            this.config.neighborFinder.start()
        }
    }

    private removedRandomContact(randomNodes: PeerDescriptor[]): void {
        logger.trace(`New nearby contact found`)
        if (this.isStopped()) {
            return
        }
        this.config.randomNodeView.replaceAll(randomNodes.map((descriptor) =>
            new DeliveryRpcRemote(
                this.config.localPeerDescriptor,
                descriptor,
                this.config.streamPartId,
                toProtoRpcClient(new DeliveryRpcClient(this.config.rpcCommunicator.getRpcClientTransport())),
                this.config.rpcRequestTimeout
            )
        ))
    }

    private onNodeDisconnected(peerDescriptor: PeerDescriptor): void {
        if (this.config.targetNeighbors.hasNode(peerDescriptor)) {
            this.config.targetNeighbors.remove(peerDescriptor)
            this.config.connectionLocker.unlockConnection(peerDescriptor, this.config.streamPartId)
            this.config.neighborFinder.start([getNodeIdFromPeerDescriptor(peerDescriptor)])
            this.config.temporaryConnectionRpcLocal.removeNode(peerDescriptor)
        }
    }

    private getNeighborCandidatesFromLayer1(): PeerDescriptor[] {
        const uniqueNodes = new Set<PeerDescriptor>()
        this.config.layer1Node.getClosestContacts(this.config.nodeViewSize).forEach((peer: PeerDescriptor) => {
            uniqueNodes.add(peer)
        })
        this.config.layer1Node.getKBucketPeers().forEach((peer: PeerDescriptor) => {
            uniqueNodes.add(peer)
        })
        return Array.from(uniqueNodes)
    }

    hasProxyConnection(nodeId: NodeID): boolean {
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
        this.config.targetNeighbors.getAll().map((remote) => remote.leaveStreamPartNotice())
        this.config.rpcCommunicator.destroy()
        this.removeAllListeners()
        this.config.nearbyNodeView.stop()
        this.config.targetNeighbors.stop()
        this.config.randomNodeView.stop()
        this.config.neighborFinder.stop()
        this.config.neighborUpdateManager.stop()
        this.config.inspector.stop()
    }

    broadcast(msg: StreamMessage, previousNode?: NodeID): void {
        if (!previousNode) {
            markAndCheckDuplicate(this.duplicateDetectors, msg.messageId!, msg.previousMessageRef)
        }
        this.emit('message', msg)
        this.config.propagation.feedUnseenMessage(msg, this.getPropagationTargets(msg), previousNode ?? null)
    }

    inspect(peerDescriptor: PeerDescriptor): Promise<boolean> {
        return this.config.inspector.inspect(peerDescriptor)
    }

    private getPropagationTargets(msg: StreamMessage): NodeID[] {
        let propagationTargets = this.config.targetNeighbors.getIds()
        if (this.config.proxyConnectionRpcLocal) {
            propagationTargets = propagationTargets.concat(this.config.proxyConnectionRpcLocal.getPropagationTargets(msg))
        }
        propagationTargets = propagationTargets.filter((target) => !this.config.inspector.isInspected(target ))
        propagationTargets = propagationTargets.concat(this.config.temporaryConnectionRpcLocal.getNodes().getIds())
        return propagationTargets
    }

    getOwnNodeId(): NodeID {
        return getNodeIdFromPeerDescriptor(this.config.localPeerDescriptor)
    }

    getNumberOfOutgoingHandshakes(): number {
        return this.config.handshaker.getOngoingHandshakes().size
    }

    getTargetNeighborIds(): NodeID[] {
        if (!this.started && this.isStopped()) {
            return []
        }
        return this.config.targetNeighbors.getIds()
    }

    getNearbyNodeView(): NodeList {
        return this.config.nearbyNodeView
    }

    private isStopped() {
        return this.abortController.signal.aborted
    }
}
