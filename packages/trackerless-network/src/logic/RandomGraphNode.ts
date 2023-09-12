import { EventEmitter } from 'eventemitter3'
import {
    DhtNode,
    PeerDescriptor,
    DhtPeer,
    ListeningRpcCommunicator,
    ITransport,
    ConnectionLocker
} from '@streamr/dht'
import {
    StreamMessage,
    LeaveStreamNotice,
    MessageRef,
    StreamMessageType,
    GroupKeyRequest,
    TemporaryConnectionRequest,
    TemporaryConnectionResponse,
    MessageID,
} from '../proto/packages/trackerless-network/protos/NetworkRpc'
import { NodeList } from './NodeList'
import { NetworkRpcClient } from '../proto/packages/trackerless-network/protos/NetworkRpc.client'
import { RemoteRandomGraphNode } from './RemoteRandomGraphNode'
import { INetworkRpc } from '../proto/packages/trackerless-network/protos/NetworkRpc.server'
import { DuplicateMessageDetector } from './DuplicateMessageDetector'
import { Logger, addManagedEventListener, binaryToHex, toEthereumAddress } from '@streamr/utils'
import { toProtoRpcClient } from '@streamr/proto-rpc'
import { IHandshaker } from './neighbor-discovery/Handshaker'
import { Propagation } from './propagation/Propagation'
import { INeighborFinder } from './neighbor-discovery/NeighborFinder'
import { INeighborUpdateManager } from './neighbor-discovery/NeighborUpdateManager'
import { StreamNodeServer } from './StreamNodeServer'
import { IStreamNode } from './IStreamNode'
import { ProxyStreamConnectionServer } from './proxy/ProxyStreamConnectionServer'
import { IInspector } from './inspect/Inspector'
import { TemporaryConnectionRpcServer } from './temporary-connection/TemporaryConnectionRpcServer'
import { markAndCheckDuplicate } from './utils'
import { NodeID, getNodeIdFromPeerDescriptor } from '../identifiers'

export interface Events {
    message: (message: StreamMessage) => void
    targetNeighborConnected: (nodeId: NodeID) => void
}

export interface StrictRandomGraphNodeConfig {
    randomGraphId: string
    layer1: DhtNode
    P2PTransport: ITransport
    connectionLocker: ConnectionLocker
    ownPeerDescriptor: PeerDescriptor
    nodeViewSize: number
    nearbyNodeView: NodeList
    randomNodeView: NodeList
    targetNeighbors: NodeList
    handshaker: IHandshaker
    neighborFinder: INeighborFinder
    neighborUpdateManager: INeighborUpdateManager
    propagation: Propagation
    rpcCommunicator: ListeningRpcCommunicator
    numOfTargetNeighbors: number
    maxNumberOfContacts: number
    minPropagationTargets: number
    name: string
    acceptProxyConnections: boolean
    neighborUpdateInterval: number
    inspector: IInspector
    temporaryConnectionServer: TemporaryConnectionRpcServer
    proxyConnectionServer?: ProxyStreamConnectionServer
}

const logger = new Logger(module)

export class RandomGraphNode extends EventEmitter<Events> implements IStreamNode {
    private stopped = false
    private started = false
    private readonly duplicateDetectors: Map<string, DuplicateMessageDetector>
    private config: StrictRandomGraphNodeConfig
    private readonly server: INetworkRpc
    private abortController: AbortController = new AbortController()

    constructor(config: StrictRandomGraphNodeConfig) {
        super()
        this.config = config
        this.duplicateDetectors = new Map()
        this.server = new StreamNodeServer({
            ownPeerDescriptor: this.config.ownPeerDescriptor,
            randomGraphId: this.config.randomGraphId,
            rpcCommunicator: this.config.rpcCommunicator,
            markAndCheckDuplicate: (msg: MessageID, prev?: MessageRef) => markAndCheckDuplicate(this.duplicateDetectors, msg, prev),
            broadcast: (message: StreamMessage, previousNode?: NodeID) => this.broadcast(message, previousNode),
            onLeaveNotice: (notice: LeaveStreamNotice) => {
                const senderId = binaryToHex(notice.senderId) as NodeID
                const contact = this.config.nearbyNodeView.getNeighborById(senderId)
                || this.config.randomNodeView.getNeighborById(senderId)
                || this.config.targetNeighbors.getNeighborById(senderId)
                || this.config.proxyConnectionServer?.getConnection(senderId )?.remote
                // TODO: check integrity of notifier?
                if (contact) {
                    this.config.layer1.removeContact(contact.getPeerDescriptor(), true)
                    this.config.targetNeighbors.remove(contact.getPeerDescriptor())
                    this.config.nearbyNodeView.remove(contact.getPeerDescriptor())
                    this.config.connectionLocker.unlockConnection(contact.getPeerDescriptor(), this.config.randomGraphId)
                    this.config.neighborFinder.start([senderId])
                    this.config.proxyConnectionServer?.removeConnection(senderId)
                }
            },
            markForInspection: (senderId: NodeID, messageId: MessageID) => this.config.inspector.markMessage(senderId, messageId)
        })
    }

    async start(): Promise<void> {
        this.started = true
        this.registerDefaultServerMethods()
        addManagedEventListener(
            this.config.layer1,
            'newContact',
            (peerDescriptor: PeerDescriptor, closestPeers: PeerDescriptor[]) => this.newContact(peerDescriptor, closestPeers),
            this.abortController.signal
        )
        addManagedEventListener(
            this.config.layer1,
            'contactRemoved',
            (peerDescriptor: PeerDescriptor, closestPeers: PeerDescriptor[]) => this.removedContact(peerDescriptor, closestPeers),
            this.abortController.signal
        )
        addManagedEventListener(
            this.config.layer1,
            'newRandomContact',
            (peerDescriptor: PeerDescriptor, randomPeers: PeerDescriptor[]) => this.newRandomContact(peerDescriptor, randomPeers),
            this.abortController.signal
        )   
        addManagedEventListener(
            this.config.layer1,
            'randomContactRemoved',
            (peerDescriptor: PeerDescriptor, randomPeers: PeerDescriptor[]) => this.removedRandomContact(peerDescriptor, randomPeers),
            this.abortController.signal
        )   
        addManagedEventListener<any, any>(
            this.config.P2PTransport as any,
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
        if (this.config.proxyConnectionServer !== undefined) {
            addManagedEventListener(
                this.config.proxyConnectionServer,
                'newConnection',
                (id: NodeID) => this.config.propagation.onNeighborJoined(id),
                this.abortController.signal
            )
        }
        const candidates = this.getNeighborCandidatesFromLayer1()
        if (candidates.length > 0) {
            this.newContact(candidates[0], candidates)
        }
        this.config.neighborFinder.start()
        await this.config.neighborUpdateManager.start()
    }

    private registerDefaultServerMethods(): void {
        this.config.rpcCommunicator.registerRpcNotification(StreamMessage, 'sendData',
            (msg: StreamMessage, context) => this.server.sendData(msg, context))
        this.config.rpcCommunicator.registerRpcNotification(LeaveStreamNotice, 'leaveStreamNotice',
            (req: LeaveStreamNotice, context) => this.server.leaveStreamNotice(req, context))
        this.config.rpcCommunicator.registerRpcMethod(TemporaryConnectionRequest, TemporaryConnectionResponse, 'openConnection',
            (req: TemporaryConnectionRequest, context) => this.config.temporaryConnectionServer.openConnection(req, context))
    }

    private newContact(_newContact: PeerDescriptor, closestNodes: PeerDescriptor[]): void {
        logger.trace(`New nearby contact found`)
        if (this.stopped) {
            return
        }
        this.updateNearbyNodeView(closestNodes)
        if (this.config.targetNeighbors.size() < this.config.numOfTargetNeighbors) {
            this.config.neighborFinder.start()
        }
    }

    private removedContact(_removedContact: PeerDescriptor, closestNodes: PeerDescriptor[]): void {
        logger.trace(`Nearby contact removed`)
        if (this.stopped) {
            return
        }
        this.updateNearbyNodeView(closestNodes)
    }

    private updateNearbyNodeView(nodes: PeerDescriptor[]) {
        this.config.nearbyNodeView.replaceAll(Array.from(nodes).map((descriptor) =>
            new RemoteRandomGraphNode(
                descriptor,
                this.config.randomGraphId,
                toProtoRpcClient(new NetworkRpcClient(this.config.rpcCommunicator.getRpcClientTransport()))
            )
        ))
        for (const descriptor of this.config.layer1.getKBucketPeers()) {
            if (this.config.nearbyNodeView.size() < this.config.nodeViewSize) {
                break
            }
            this.config.nearbyNodeView.add(
                new RemoteRandomGraphNode(
                    descriptor,
                    this.config.randomGraphId,
                    toProtoRpcClient(new NetworkRpcClient(this.config.rpcCommunicator.getRpcClientTransport()))
                )
            )
        }
    }

    private newRandomContact(_newDescriptor: PeerDescriptor, randomNodes: PeerDescriptor[]): void {
        if (this.stopped) {
            return
        }
        this.config.randomNodeView.replaceAll(randomNodes.map((descriptor) =>
            new RemoteRandomGraphNode(
                descriptor,
                this.config.randomGraphId,
                toProtoRpcClient(new NetworkRpcClient(this.config.rpcCommunicator.getRpcClientTransport()))
            )
        ))
        if (this.config.targetNeighbors.size() < this.config.numOfTargetNeighbors) {
            this.config.neighborFinder.start()
        }
    }

    private removedRandomContact(_removedDescriptor: PeerDescriptor, randomNodes: PeerDescriptor[]): void {
        logger.trace(`New nearby contact found`)
        if (this.stopped) {
            return
        }
        this.config.randomNodeView.replaceAll(randomNodes.map((descriptor) =>
            new RemoteRandomGraphNode(
                descriptor,
                this.config.randomGraphId,
                toProtoRpcClient(new NetworkRpcClient(this.config.rpcCommunicator.getRpcClientTransport()))
            )
        ))
    }

    private onNodeDisconnected(peerDescriptor: PeerDescriptor): void {
        if (this.config.targetNeighbors.hasNode(peerDescriptor)) {
            this.config.targetNeighbors.remove(peerDescriptor)
            this.config.connectionLocker.unlockConnection(peerDescriptor, this.config.randomGraphId)
            this.config.neighborFinder.start([getNodeIdFromPeerDescriptor(peerDescriptor)])
            this.config.temporaryConnectionServer.removeNode(peerDescriptor)
        }
    }

    private getNeighborCandidatesFromLayer1(): PeerDescriptor[] {
        const uniqueNodes = new Set<PeerDescriptor>()
        this.config.layer1.getNeighborList().getClosestContacts(this.config.nodeViewSize).forEach((contact: DhtPeer) => {
            uniqueNodes.add(contact.getPeerDescriptor())
        })
        this.config.layer1.getKBucketPeers().forEach((peer: PeerDescriptor) => {
            uniqueNodes.add(peer)
        })
        return Array.from(uniqueNodes)
    }

    public hasProxyConnection(nodeId: NodeID): boolean {
        if (this.config.proxyConnectionServer) {
            return this.config.proxyConnectionServer.hasConnection(nodeId)
        }
        return false
    }

    stop(): void {
        if (!this.started) {
            return
        }
        this.stopped = true
        this.abortController.abort()
        this.config.proxyConnectionServer?.stop()
        this.config.targetNeighbors.getNodes().map((remote) => remote.leaveStreamNotice(this.config.ownPeerDescriptor))
        this.config.rpcCommunicator.stop()
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
        if (this.config.proxyConnectionServer) {
            const proxyTargets = (msg.messageType === StreamMessageType.GROUP_KEY_REQUEST)
                ? this.config.proxyConnectionServer.getNodeIdsForUserId(
                    toEthereumAddress(binaryToHex(GroupKeyRequest.fromBinary(msg.content).recipientId, true))
                )
                : this.config.proxyConnectionServer.getSubscribers()
            propagationTargets = propagationTargets.concat(proxyTargets)
        }

        propagationTargets = propagationTargets.filter((target) => !this.config.inspector.isInspected(target ))
        propagationTargets = propagationTargets.concat(this.config.temporaryConnectionServer.getNodes().getIds())
        return propagationTargets
    }

    getOwnNodeId(): NodeID {
        return getNodeIdFromPeerDescriptor(this.config.ownPeerDescriptor)
    }

    getNumberOfOutgoingHandshakes(): number {
        return this.config.handshaker.getOngoingHandshakes().size
    }

    getTargetNeighborIds(): NodeID[] {
        if (!this.started && this.stopped) {
            return []
        }
        return this.config.targetNeighbors.getIds()
    }

    getNearbyNodeView(): NodeList {
        return this.config.nearbyNodeView
    }
}
