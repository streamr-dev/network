import { EventEmitter } from 'eventemitter3'
import {
    DhtNode,
    PeerDescriptor,
    DhtPeer,
    ListeningRpcCommunicator,
    ITransport,
    ConnectionLocker,
    peerIdFromPeerDescriptor,
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
import { Handshaker } from './neighbor-discovery/Handshaker'
import { Propagation } from './propagation/Propagation'
import { NeighborFinder } from './neighbor-discovery/NeighborFinder'
import { NeighborUpdateManager } from './neighbor-discovery/NeighborUpdateManager'
import { PeerIDKey } from '@streamr/dht/dist/src/helpers/PeerID'

export interface Events {
    message: (message: StreamMessage) => void
}

export interface RandomGraphNodeParams {
    randomGraphId: string
    layer1: DhtNode
    P2PTransport: ITransport
    connectionLocker: ConnectionLocker
    ownPeerDescriptor: PeerDescriptor
    nodeName?: string
}

const logger = new Logger(module)

export class RandomGraphNode extends EventEmitter<Events> implements INetworkRpc {
    private stopped = false
    private started = false
    private readonly N = 4
    private readonly PEER_VIEW_SIZE = 20
    public readonly nearbyContactPool: PeerList
    private readonly randomContactPool: PeerList
    private readonly targetNeighbors: PeerList
    private rpcCommunicator?: ListeningRpcCommunicator
    private readonly duplicateDetector: DuplicateMessageDetector
    private handshaker?: Handshaker
    private readonly abortController: AbortController
    private readonly propagation: Propagation
    private config: RandomGraphNodeParams
    private neighborFinder?: NeighborFinder
    private neighborUpdateManager?: NeighborUpdateManager

    constructor(config: RandomGraphNodeParams) {
        super()
        this.config = config
        this.duplicateDetector = new DuplicateMessageDetector(10000)
        const peerId = peerIdFromPeerDescriptor(config.ownPeerDescriptor)
        this.nearbyContactPool = new PeerList(peerId, this.PEER_VIEW_SIZE)
        this.randomContactPool = new PeerList(peerId, this.PEER_VIEW_SIZE)
        this.targetNeighbors = new PeerList(peerId, this.PEER_VIEW_SIZE)
        this.propagation = new Propagation({
            minPropagationTargets: 2,
            randomGraphId: config.randomGraphId,
            sendToNeighbor: async (neighborId: string, msg: StreamMessage): Promise<void> => {
                const remote = this.targetNeighbors.getNeighborWithId(neighborId)
                if (remote) {
                    await remote.sendData(config.ownPeerDescriptor, msg)
                } else {
                    throw new Error('Propagation target not found')
                }
            }
        })
        this.abortController = new AbortController()
    }

    async start(): Promise<void> {
        this.started = true
        this.rpcCommunicator = new ListeningRpcCommunicator(`layer2-${this.config.randomGraphId}`, this.config.P2PTransport)
        this.config.layer1.on('newContact', (peerDescriptor, closestPeers) => this.newContact(peerDescriptor, closestPeers))
        this.config.layer1.on('contactRemoved', (peerDescriptor, closestPeers) => this.removedContact(peerDescriptor, closestPeers))
        this.config.layer1.on('newRandomContact', (peerDescriptor, randomPeers) => this.newRandomContact(peerDescriptor, randomPeers))
        this.config.layer1.on('randomContactRemoved', (peerDescriptor, randomPeers) => this.removedRandomContact(peerDescriptor, randomPeers))
        this.config.P2PTransport.on('disconnected', (peerDescriptor: PeerDescriptor) => this.onPeerDisconnected(peerDescriptor))
        this.targetNeighbors.on('peerAdded', (id, _remote) => {
            this.propagation.onNeighborJoined(id)
        })
        this.handshaker = new Handshaker({
            ownPeerDescriptor: this.config.layer1.getPeerDescriptor(),
            randomGraphId: this.config.randomGraphId,
            nearbyContactPool: this.nearbyContactPool!,
            randomContactPool: this.randomContactPool!,
            targetNeighbors: this.targetNeighbors!,
            connectionLocker: this.config.connectionLocker,
            rpcCommunicator: this.rpcCommunicator!,
            nodeName: this.config.nodeName,
            N: this.N
        })
        this.neighborFinder = new NeighborFinder({
            targetNeighbors: this.targetNeighbors,
            nearbyContactPool: this.nearbyContactPool,
            doFindNeighbors: (excludedIds) => this.handshaker.attemptHandshakesOnContacts(excludedIds),
            N: this.N
        })
        this.neighborUpdateManager = new NeighborUpdateManager({
            targetNeighbors: this.targetNeighbors,
            nearbyContactPool: this.nearbyContactPool,
            ownStringId: this.getOwnStringId(),
            ownPeerDescriptor: this.config.layer1.getPeerDescriptor(),
            neighborFinder: this.neighborFinder,
            randomGraphId: this.config.randomGraphId,
            rpcCommunicator: this.rpcCommunicator
        })
        this.registerDefaultServerMethods()
        const candidates = this.getNewNeighborCandidates()
        if (candidates.length) {
            this.newContact(candidates[0], candidates)
        } else {
            logger.debug('layer1 had no closest contacts in the beginning')
        }
        this.neighborFinder!.start()
        await this.neighborUpdateManager!.start()
    }

    private newContact(_newContact: PeerDescriptor, closestTen: PeerDescriptor[]): void {
        logger.trace(`New nearby contact found`)
        if (this.stopped) {
            return
        }
        this.nearbyContactPool!.replaceAll(closestTen.map((descriptor) =>
            new RemoteRandomGraphNode(
                descriptor,
                this.config.randomGraphId,
                toProtoRpcClient(new NetworkRpcClient(this.rpcCommunicator!.getRpcClientTransport()))
            )
        ))
        if (this.targetNeighbors.size() < this.N) {
            this.neighborFinder!.start()
        }
    }

    private removedContact(_removedContact: PeerDescriptor, closestTen: PeerDescriptor[]): void {
        logger.trace(`Nearby contact removed`)
        if (this.stopped) {
            return
        }
        this.nearbyContactPool!.replaceAll(closestTen.map((descriptor) =>
            new RemoteRandomGraphNode(
                descriptor,
                this.config.randomGraphId,
                toProtoRpcClient(new NetworkRpcClient(this.rpcCommunicator!.getRpcClientTransport()))
            )
        ))
    }

    private newRandomContact(_newDescriptor: PeerDescriptor, randomPeers: PeerDescriptor[]): void {
        if (this.stopped) {
            return
        }
        this.randomContactPool!.replaceAll(randomPeers.map((descriptor) =>
            new RemoteRandomGraphNode(
                descriptor,
                this.config.randomGraphId,
                toProtoRpcClient(new NetworkRpcClient(this.rpcCommunicator!.getRpcClientTransport()))
            )
        ))
        if (this.targetNeighbors.size() < this.N) {
            this.neighborFinder!.start()
        }
    }

    private removedRandomContact(_removedDescriptor: PeerDescriptor, randomPeers: PeerDescriptor[]): void {
        logger.trace(`New nearby contact found`)
        if (this.stopped) {
            return
        }
        this.randomContactPool!.replaceAll(randomPeers.map((descriptor) =>
            new RemoteRandomGraphNode(
                descriptor,
                this.config.randomGraphId,
                toProtoRpcClient(new NetworkRpcClient(this.rpcCommunicator!.getRpcClientTransport()))
            )
        ))
    }

    private onPeerDisconnected(peerDescriptor: PeerDescriptor): void {
        if (this.targetNeighbors!.hasPeer(peerDescriptor)) {
            this.targetNeighbors!.remove(peerDescriptor)
            this.config.connectionLocker.unlockConnection(peerDescriptor, this.config.randomGraphId)
            this.neighborFinder!.start([keyFromPeerDescriptor(peerDescriptor)])
        }
    }

    private registerDefaultServerMethods(): void {
        this.rpcCommunicator!.registerRpcNotification(StreamMessage, 'sendData',
            (msg: StreamMessage, context) => this.sendData(msg, context))
        this.rpcCommunicator!.registerRpcNotification(LeaveStreamNotice, 'leaveStreamNotice',
            (req: LeaveStreamNotice, context) => this.leaveStreamNotice(req, context))
    }

    private getNewNeighborCandidates(): PeerDescriptor[] {
        return this.config.layer1.getNeighborList().getClosestContacts(this.PEER_VIEW_SIZE).map((contact: DhtPeer) => {
            return contact.getPeerDescriptor()
        })
    }

    stop(): void {
        if (!this.started) {
            return
        }
        this.stopped = true
        this.abortController.abort()
        this.targetNeighbors!.values().map((remote) => remote.leaveStreamNotice(this.config.layer1.getPeerDescriptor()))
        this.rpcCommunicator!.stop()
        this.removeAllListeners()
        this.config.layer1.off('newContact', (peerDescriptor, closestTen) => this.newContact(peerDescriptor, closestTen))
        this.config.layer1.off('contactRemoved', (peerDescriptor, closestTen) => this.removedContact(peerDescriptor, closestTen))
        this.config.layer1.off('newRandomContact', (peerDescriptor, randomPeers) => this.newRandomContact(peerDescriptor, randomPeers))
        this.config.layer1.off('randomContactRemoved', (peerDescriptor, randomPeers) => this.removedRandomContact(peerDescriptor, randomPeers))
        this.config.P2PTransport.off('disconnected', (peerDescriptor: PeerDescriptor) => this.onPeerDisconnected(peerDescriptor))
        this.nearbyContactPool!.clear()
        this.targetNeighbors!.clear()
        this.neighborFinder!.stop()
        this.neighborUpdateManager!.stop()
    }

    broadcast(msg: StreamMessage, previousPeer?: string): void {
        if (!previousPeer) {
            this.markAndCheckDuplicate(msg.messageRef!, msg.previousMessageRef)
        }
        this.emit('message', msg)
        this.propagation.feedUnseenMessage(msg, this.targetNeighbors!.getStringIds(), previousPeer || null)
    }

    private markAndCheckDuplicate(currentMessageRef: MessageRef, previousMessageRef?: MessageRef): boolean {
        const previousNumberPair = previousMessageRef ?
            new NumberPair(Number(previousMessageRef!.timestamp), previousMessageRef!.sequenceNumber)
            : null
        const currentNumberPair = new NumberPair(Number(currentMessageRef.timestamp), currentMessageRef.sequenceNumber)
        return this.duplicateDetector.markAndCheck(previousNumberPair, currentNumberPair)
    }

    getOwnStringId(): PeerIDKey {
        return keyFromPeerDescriptor(this.config.layer1.getPeerDescriptor())
    }

    getNumberOfOutgoingHandshakes(): number {
        return this.handshaker!.getOngoingHandshakes().size
    }

    getTargetNeighborStringIds(): string[] {
        if (!this.started && this.stopped) {
            return []
        }
        return this.targetNeighbors!.getStringIds()
    }

    getNearbyContactPoolIds(): string[] {
        if (!this.started && this.stopped) {
            return []
        }
        return this.nearbyContactPool!.getStringIds()
    }

    getRandomContactPoolIds(): string[] {
        if (!this.started && this.stopped) {
            return []
        }
        return this.randomContactPool!.getStringIds()
    }

    // INetworkRpc server method
    async sendData(message: StreamMessage, _context: ServerCallContext): Promise<Empty> {
        if (this.markAndCheckDuplicate(message.messageRef!, message.previousMessageRef)) {
            const { previousPeer } = message
            message["previousPeer"] = keyFromPeerDescriptor(this.config.layer1.getPeerDescriptor())
            this.broadcast(message, previousPeer)
        }
        return Empty
    }

    // INetworkRpc server method
    async leaveStreamNotice(message: LeaveStreamNotice, _context: ServerCallContext): Promise<Empty> {
        if (message.randomGraphId === this.config.randomGraphId) {
            const contact = this.nearbyContactPool!.getNeighborWithId(message.senderId)
                || this.randomContactPool!.getNeighborWithId(message.senderId)
                || this.targetNeighbors!.getNeighborWithId(message.senderId)
            // TODO: check integrity of notifier?
            if (contact) {
                this.config.layer1!.removeContact(contact.getPeerDescriptor(), true)
                this.targetNeighbors!.remove(contact.getPeerDescriptor())
                this.nearbyContactPool!.remove(contact.getPeerDescriptor())
                this.config.connectionLocker.unlockConnection(contact.getPeerDescriptor(), this.config.randomGraphId)
                this.neighborFinder!.start([message.senderId])
            }
        }
        return Empty
    }
}
