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
import { Logger } from '@streamr/utils'
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
    targetNeighborConnected: (stringId: NodeID) => void
    nearbyContactPoolIdAdded: () => void
}

export interface StrictRandomGraphNodeConfig {
    randomGraphId: string
    layer1: DhtNode
    P2PTransport: ITransport
    connectionLocker: ConnectionLocker
    ownPeerDescriptor: PeerDescriptor
    peerViewSize: number
    nearbyContactPool: NodeList
    randomContactPool: NodeList
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

    constructor(config: StrictRandomGraphNodeConfig) {
        super()
        this.config = config
        this.duplicateDetectors = new Map()
        this.server = new StreamNodeServer({
            ownPeerDescriptor: this.config.ownPeerDescriptor,
            randomGraphId: this.config.randomGraphId,
            rpcCommunicator: this.config.rpcCommunicator,
            markAndCheckDuplicate: (msg: MessageID, prev?: MessageRef) => markAndCheckDuplicate(this.duplicateDetectors, msg, prev),
            broadcast: (message: StreamMessage, previousPeer?: NodeID) => this.broadcast(message, previousPeer),
            onLeaveNotice: (notice: LeaveStreamNotice) => {
                const senderId = notice.senderId as NodeID
                const contact = this.config.nearbyContactPool.getNeighborById(senderId)
                || this.config.randomContactPool.getNeighborById(senderId)
                || this.config.targetNeighbors.getNeighborById(senderId)
                || this.config.proxyConnectionServer?.getConnection(senderId as NodeID)?.remote
                // TODO: check integrity of notifier?
                if (contact) {
                    this.config.layer1.removeContact(contact.getPeerDescriptor(), true)
                    this.config.targetNeighbors.remove(contact.getPeerDescriptor())
                    this.config.nearbyContactPool.remove(contact.getPeerDescriptor())
                    this.config.connectionLocker.unlockConnection(contact.getPeerDescriptor(), this.config.randomGraphId)
                    this.config.neighborFinder.start([senderId])
                    this.config.proxyConnectionServer?.removeConnection(senderId as NodeID)
                }
            },
            markForInspection: (senderId: NodeID, messageId: MessageID) => this.config.inspector.markMessage(senderId, messageId)
        })
    }

    async start(): Promise<void> {
        this.started = true
        this.registerDefaultServerMethods()
        this.config.layer1.on('newContact', (peerDescriptor, closestPeers) => this.newContact(peerDescriptor, closestPeers))
        this.config.layer1.on('contactRemoved', (peerDescriptor, closestPeers) => this.removedContact(peerDescriptor, closestPeers))
        this.config.layer1.on('newRandomContact', (peerDescriptor, randomPeers) => this.newRandomContact(peerDescriptor, randomPeers))
        this.config.layer1.on('randomContactRemoved', (peerDescriptor, randomPeers) => this.removedRandomContact(peerDescriptor, randomPeers))
        this.config.P2PTransport.on('disconnected', (peerDescriptor: PeerDescriptor) => this.onPeerDisconnected(peerDescriptor))
        this.config.targetNeighbors.on('nodeAdded', (id, _remote) => {
            this.config.propagation.onNeighborJoined(id)
            this.emit('targetNeighborConnected', id)
        })
        this.config.proxyConnectionServer?.on('newConnection', (id: NodeID) => {
            this.config.propagation.onNeighborJoined(id)
        })
        const candidates = this.getNewNeighborCandidates()
        if (candidates.length > 0) {
            this.newContact(candidates[0], candidates)
        } else {
            logger.debug('layer1 had no closest contacts in the beginning')
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

    private newContact(_newContact: PeerDescriptor, closestTen: PeerDescriptor[]): void {
        logger.trace(`New nearby contact found`)
        if (this.stopped) {
            return
        }
      
        const oldLength = this.config.nearbyContactPool.getStringIds().length
        this.config.nearbyContactPool.replaceAll(closestTen.map((descriptor) =>
            new RemoteRandomGraphNode(
                descriptor,
                this.config.randomGraphId,
                toProtoRpcClient(new NetworkRpcClient(this.config.rpcCommunicator.getRpcClientTransport()))
            )
        ))

        if (oldLength < this.config.nearbyContactPool.getStringIds().length) {
            this.emit('nearbyContactPoolIdAdded')
        }
        
        if (this.config.targetNeighbors.size() < this.config.numOfTargetNeighbors) {
            this.config.neighborFinder.start()
        }
    }

    private removedContact(_removedContact: PeerDescriptor, closestTen: PeerDescriptor[]): void {
        logger.trace(`Nearby contact removed`)
        if (this.stopped) {
            return
        }
        this.config.nearbyContactPool.replaceAll(closestTen.map((descriptor) =>
            new RemoteRandomGraphNode(
                descriptor,
                this.config.randomGraphId,
                toProtoRpcClient(new NetworkRpcClient(this.config.rpcCommunicator.getRpcClientTransport()))
            )
        ))
    }

    private newRandomContact(_newDescriptor: PeerDescriptor, randomPeers: PeerDescriptor[]): void {
        if (this.stopped) {
            return
        }
        this.config.randomContactPool.replaceAll(randomPeers.map((descriptor) =>
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

    private removedRandomContact(_removedDescriptor: PeerDescriptor, randomPeers: PeerDescriptor[]): void {
        logger.trace(`New nearby contact found`)
        if (this.stopped) {
            return
        }
        this.config.randomContactPool!.replaceAll(randomPeers.map((descriptor) =>
            new RemoteRandomGraphNode(
                descriptor,
                this.config.randomGraphId,
                toProtoRpcClient(new NetworkRpcClient(this.config.rpcCommunicator.getRpcClientTransport()))
            )
        ))
    }

    private onPeerDisconnected(peerDescriptor: PeerDescriptor): void {
        if (this.config.targetNeighbors.hasNode(peerDescriptor)) {
            this.config.targetNeighbors.remove(peerDescriptor)
            this.config.connectionLocker.unlockConnection(peerDescriptor, this.config.randomGraphId)
            this.config.neighborFinder.start([getNodeIdFromPeerDescriptor(peerDescriptor)])
            this.config.temporaryConnectionServer.removePeer(peerDescriptor)
        }
    }

    private getNewNeighborCandidates(): PeerDescriptor[] {
        return this.config.layer1.getNeighborList().getClosestContacts(this.config.peerViewSize).map((contact: DhtPeer) => {
            return contact.getPeerDescriptor()
        })
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
        this.config.proxyConnectionServer?.stop()
        this.config.targetNeighbors.getNodes().map((remote) => remote.leaveStreamNotice(this.config.ownPeerDescriptor))
        this.config.rpcCommunicator.stop()
        this.removeAllListeners()
        this.config.layer1.off('newContact', (peerDescriptor, closestTen) => this.newContact(peerDescriptor, closestTen))
        this.config.layer1.off('contactRemoved', (peerDescriptor, closestTen) => this.removedContact(peerDescriptor, closestTen))
        this.config.layer1.off('newRandomContact', (peerDescriptor, randomPeers) => this.newRandomContact(peerDescriptor, randomPeers))
        this.config.layer1.off('randomContactRemoved', (peerDescriptor, randomPeers) => this.removedRandomContact(peerDescriptor, randomPeers))
        this.config.P2PTransport.off('disconnected', (peerDescriptor: PeerDescriptor) => this.onPeerDisconnected(peerDescriptor))
        this.config.nearbyContactPool.stop()
        this.config.targetNeighbors.stop()
        this.config.randomContactPool.stop()
        this.config.neighborFinder.stop()
        this.config.neighborUpdateManager.stop()
        this.config.inspector.stop()
    }

    broadcast(msg: StreamMessage, previousPeer?: NodeID): void {
        if (!previousPeer) {
            markAndCheckDuplicate(this.duplicateDetectors, msg.messageId!, msg.previousMessageRef)
        }
        this.emit('message', msg)
        this.config.propagation.feedUnseenMessage(msg, this.getPropagationTargets(msg), previousPeer ?? null)
    }

    inspect(peerDescriptor: PeerDescriptor): Promise<boolean> {
        return this.config.inspector.inspect(peerDescriptor)
    }

    private getPropagationTargets(msg: StreamMessage): NodeID[] {
        let propagationTargets = this.config.targetNeighbors.getStringIds()
        if (this.config.proxyConnectionServer) {
            const proxyTargets = (msg.messageType === StreamMessageType.GROUP_KEY_REQUEST)
                ? this.config.proxyConnectionServer.getNodeIdsForUserId(GroupKeyRequest.fromBinary(msg.content).recipientId)
                : this.config.proxyConnectionServer.getSubscribers()
            propagationTargets = propagationTargets.concat(proxyTargets)
        }

        propagationTargets = propagationTargets.filter((target) => !this.config.inspector.isInspected(target as NodeID))
        propagationTargets = propagationTargets.concat(this.config.temporaryConnectionServer.getPeers().getStringIds())
        return propagationTargets
    }

    getOwnStringId(): NodeID {
        return getNodeIdFromPeerDescriptor(this.config.ownPeerDescriptor)
    }

    getNumberOfOutgoingHandshakes(): number {
        return this.config.handshaker.getOngoingHandshakes().size
    }

    getTargetNeighborStringIds(): NodeID[] {
        if (!this.started && this.stopped) {
            return []
        }
        return this.config.targetNeighbors.getStringIds()
    }

    getNearbyContactPoolIds(): NodeID[] {
        if (!this.started && this.stopped) {
            return []
        }
        return this.config.nearbyContactPool.getStringIds()
    }

    getRandomContactPoolIds(): NodeID[] {
        if (!this.started && this.stopped) {
            return []
        }
        return this.config.randomContactPool.getStringIds()
    }
}
