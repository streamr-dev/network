import { EventEmitter } from 'eventemitter3'
import {
    DhtNode,
    PeerDescriptor,
    DhtPeer,
    ListeningRpcCommunicator,
    ITransport,
    ConnectionLocker,
    keyFromPeerDescriptor
} from '@streamr/dht'
import {
    StreamMessage,
    LeaveStreamNotice,
    MessageRef
} from '../proto/packages/trackerless-network/protos/NetworkRpc'
import { PeerList } from './PeerList'
import { NetworkRpcClient } from '../proto/packages/trackerless-network/protos/NetworkRpc.client'
import { RemoteRandomGraphNode } from './RemoteRandomGraphNode'
import { INetworkRpc } from '../proto/packages/trackerless-network/protos/NetworkRpc.server'
import { Empty } from '../proto/google/protobuf/empty'
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { DuplicateMessageDetector, NumberPair } from '@streamr/utils'
import { Logger } from '@streamr/utils'
import { toProtoRpcClient } from '@streamr/proto-rpc'
import { IHandshaker } from './neighbor-discovery/Handshaker'
import { Propagation } from './propagation/Propagation'
import { INeighborFinder } from './neighbor-discovery/NeighborFinder'
import { INeighborUpdateManager } from './neighbor-discovery/NeighborUpdateManager'
import { PeerIDKey } from '@streamr/dht/dist/src/helpers/PeerID'

export interface Events {
    message: (message: StreamMessage) => void
}

export interface StrictRandomGraphNodeConfig {
    randomGraphId: string
    layer1: DhtNode
    P2PTransport: ITransport
    connectionLocker: ConnectionLocker
    ownPeerDescriptor: PeerDescriptor
    N: number
    peerViewSize: number
    nearbyContactPool: PeerList
    randomContactPool: PeerList
    targetNeighbors: PeerList
    handshaker: IHandshaker
    neighborFinder: INeighborFinder
    neighborUpdateManager: INeighborUpdateManager
    propagation: Propagation
    rpcCommunicator: ListeningRpcCommunicator
    nodeName: string
}

const logger = new Logger(module)

export class RandomGraphNode extends EventEmitter<Events> implements INetworkRpc {
    private stopped = false
    private started = false
    private readonly duplicateDetector: DuplicateMessageDetector
    private readonly abortController: AbortController
    private config: StrictRandomGraphNodeConfig

    constructor(config: StrictRandomGraphNodeConfig) {
        super()
        this.config = config
        this.duplicateDetector = new DuplicateMessageDetector(10000)
        this.abortController = new AbortController()
    }

    async start(): Promise<void> {
        this.started = true
        this.registerDefaultServerMethods()
        this.config.layer1.on('newContact', (peerDescriptor, closestPeers) => this.newContact(peerDescriptor, closestPeers))
        this.config.layer1.on('contactRemoved', (peerDescriptor, closestPeers) => this.removedContact(peerDescriptor, closestPeers))
        this.config.layer1.on('newRandomContact', (peerDescriptor, randomPeers) => this.newRandomContact(peerDescriptor, randomPeers))
        this.config.layer1.on('randomContactRemoved', (peerDescriptor, randomPeers) => this.removedRandomContact(peerDescriptor, randomPeers))
        this.config.P2PTransport.on('disconnected', (peerDescriptor: PeerDescriptor) => this.onPeerDisconnected(peerDescriptor))
        this.config.targetNeighbors.on('peerAdded', (id, _remote) => {
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

    private newContact(_newContact: PeerDescriptor, closestTen: PeerDescriptor[]): void {
        logger.trace(`New nearby contact found`)
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
        if (this.config.targetNeighbors.size() < this.config.N) {
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
        if (this.config.targetNeighbors.size() < this.config.N) {
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
        if (this.config.targetNeighbors.hasPeer(peerDescriptor)) {
            this.config.targetNeighbors.remove(peerDescriptor)
            this.config.connectionLocker.unlockConnection(peerDescriptor, this.config.randomGraphId)
            this.config.neighborFinder.start([keyFromPeerDescriptor(peerDescriptor)])
        }
    }

    private registerDefaultServerMethods(): void {
        this.config.rpcCommunicator.registerRpcNotification(StreamMessage, 'sendData',
            (msg: StreamMessage, context) => this.sendData(msg, context))
        this.config.rpcCommunicator.registerRpcNotification(LeaveStreamNotice, 'leaveStreamNotice',
            (req: LeaveStreamNotice, context) => this.leaveStreamNotice(req, context))
    }

    private getNewNeighborCandidates(): PeerDescriptor[] {
        return this.config.layer1.getNeighborList().getClosestContacts(this.config.peerViewSize).map((contact: DhtPeer) => {
            return contact.getPeerDescriptor()
        })
    }

    stop(): void {
        if (!this.started) {
            return
        }
        this.stopped = true
        this.abortController.abort()
        this.config.targetNeighbors.values().map((remote) => remote.leaveStreamNotice(this.config.ownPeerDescriptor))
        this.config.rpcCommunicator.stop()
        this.removeAllListeners()
        this.config.layer1.off('newContact', (peerDescriptor, closestTen) => this.newContact(peerDescriptor, closestTen))
        this.config.layer1.off('contactRemoved', (peerDescriptor, closestTen) => this.removedContact(peerDescriptor, closestTen))
        this.config.layer1.off('newRandomContact', (peerDescriptor, randomPeers) => this.newRandomContact(peerDescriptor, randomPeers))
        this.config.layer1.off('randomContactRemoved', (peerDescriptor, randomPeers) => this.removedRandomContact(peerDescriptor, randomPeers))
        this.config.P2PTransport.off('disconnected', (peerDescriptor: PeerDescriptor) => this.onPeerDisconnected(peerDescriptor))
        this.config.nearbyContactPool.clear()
        this.config.targetNeighbors.clear()
        this.config.neighborFinder.stop()
        this.config.neighborUpdateManager.stop()
    }

    broadcast(msg: StreamMessage, previousPeer?: string): void {
        if (!previousPeer) {
            this.markAndCheckDuplicate(msg.messageRef!, msg.previousMessageRef)
        }
        this.emit('message', msg)
        this.config.propagation.feedUnseenMessage(msg, this.config.targetNeighbors.getStringIds(), previousPeer || null)
    }

    private markAndCheckDuplicate(currentMessageRef: MessageRef, previousMessageRef?: MessageRef): boolean {
        const previousNumberPair = previousMessageRef ?
            new NumberPair(Number(previousMessageRef!.timestamp), previousMessageRef!.sequenceNumber)
            : null
        const currentNumberPair = new NumberPair(Number(currentMessageRef.timestamp), currentMessageRef.sequenceNumber)
        return this.duplicateDetector.markAndCheck(previousNumberPair, currentNumberPair)
    }

    getOwnStringId(): PeerIDKey {
        return keyFromPeerDescriptor(this.config.ownPeerDescriptor)
    }

    getNumberOfOutgoingHandshakes(): number {
        return this.config.handshaker.getOngoingHandshakes().size
    }

    getTargetNeighborStringIds(): string[] {
        if (!this.started && this.stopped) {
            return []
        }
        return this.config.targetNeighbors.getStringIds()
    }

    getNearbyContactPoolIds(): string[] {
        if (!this.started && this.stopped) {
            return []
        }
        return this.config.nearbyContactPool.getStringIds()
    }

    getRandomContactPoolIds(): string[] {
        if (!this.started && this.stopped) {
            return []
        }
        return this.config.randomContactPool.getStringIds()
    }

    // INetworkRpc server method
    async sendData(message: StreamMessage, _context: ServerCallContext): Promise<Empty> {
        if (this.markAndCheckDuplicate(message.messageRef!, message.previousMessageRef)) {
            const { previousPeer } = message
            message["previousPeer"] = keyFromPeerDescriptor(this.config.ownPeerDescriptor)
            this.broadcast(message, previousPeer)
        }
        return Empty
    }

    // INetworkRpc server method
    async leaveStreamNotice(message: LeaveStreamNotice, _context: ServerCallContext): Promise<Empty> {
        if (message.randomGraphId === this.config.randomGraphId) {
            const contact = this.config.nearbyContactPool.getNeighborWithId(message.senderId)
                || this.config.randomContactPool.getNeighborWithId(message.senderId)
                || this.config.targetNeighbors.getNeighborWithId(message.senderId)
            // TODO: check integrity of notifier?
            if (contact) {
                this.config.layer1.removeContact(contact.getPeerDescriptor(), true)
                this.config.targetNeighbors!.remove(contact.getPeerDescriptor())
                this.config.nearbyContactPool!.remove(contact.getPeerDescriptor())
                this.config.connectionLocker.unlockConnection(contact.getPeerDescriptor(), this.config.randomGraphId)
                this.config.neighborFinder!.start([message.senderId])
            }
        }
        return Empty
    }
}
