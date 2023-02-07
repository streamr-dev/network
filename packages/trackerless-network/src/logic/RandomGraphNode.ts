import { EventEmitter } from 'events'
import { DhtNode, PeerID, PeerDescriptor, DhtPeer, ListeningRpcCommunicator, ITransport, ConnectionLocker } from '@streamr/dht'
import {
    StreamMessage,
    StreamHandshakeRequest,
    StreamHandshakeResponse,
    InterleaveNotice,
    LeaveStreamNotice,
    MessageRef,
    NeighborUpdate
} from '../proto/packages/trackerless-network/protos/NetworkRpc'
import { PeerList, Event as PeerListEvent } from './PeerList'
import { NetworkRpcClient } from '../proto/packages/trackerless-network/protos/NetworkRpc.client'
import { RemoteRandomGraphNode } from './RemoteRandomGraphNode'
import { INetworkRpc } from '../proto/packages/trackerless-network/protos/NetworkRpc.server'
import { Empty } from '../proto/google/protobuf/empty'
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { DuplicateMessageDetector, NumberPair, scheduleAtInterval } from '@streamr/utils'
import { Logger } from '@streamr/utils'
import { toProtoRpcClient } from '@streamr/proto-rpc'
import { Handshaker } from './Handshaker'
import { Propagation } from './propagation/Propagation'

export enum Event {
    MESSAGE = 'streamr:layer2:random-graph-node:onmessage'
}

export interface RandomGraphNode {
    on(event: Event.MESSAGE, listener: (message: StreamMessage) => any): this
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

export class RandomGraphNode extends EventEmitter implements INetworkRpc {
    private stopped = false
    private started = false
    private readonly N = 4
    private readonly PEER_VIEW_SIZE = 20
    private readonly randomGraphId: string // StreamPartID
    private readonly layer1: DhtNode
    public readonly nearbyContactPool: PeerList
    private readonly randomContactPool: PeerList
    private readonly targetNeighbors: PeerList
    private rpcCommunicator: ListeningRpcCommunicator | null = null
    private readonly P2PTransport: ITransport
    private readonly connectionLocker: ConnectionLocker
    private readonly duplicateDetector: DuplicateMessageDetector
    private findNeighborsIntervalRef: NodeJS.Timeout | null = null
    private handshaker?: Handshaker
    private ownPeerDescriptor: PeerDescriptor
    private readonly abortController: AbortController
    private readonly propagation: Propagation
    private config: RandomGraphNodeParams

    constructor(config: RandomGraphNodeParams) {
        super()
        this.config = config
        this.randomGraphId = config.randomGraphId
        this.layer1 = config.layer1
        this.P2PTransport = config.P2PTransport
        this.connectionLocker = config.connectionLocker
        this.duplicateDetector = new DuplicateMessageDetector(10000)
        this.ownPeerDescriptor = config.ownPeerDescriptor
        const peerId = PeerID.fromValue(this.ownPeerDescriptor.kademliaId)
        this.nearbyContactPool = new PeerList(peerId, this.PEER_VIEW_SIZE)
        this.randomContactPool = new PeerList(peerId, this.PEER_VIEW_SIZE)
        this.targetNeighbors = new PeerList(peerId, this.PEER_VIEW_SIZE)
        this.propagation = new Propagation({
            minPropagationTargets: 1,
            randomGraphId: this.randomGraphId,
            sendToNeighbor: async (neighborId: string, msg: StreamMessage): Promise<void> => {
                const remote = this.targetNeighbors.getNeighborWithId(neighborId)
                if (remote) {
                    await remote.sendData(this.ownPeerDescriptor, msg)
                } else {
                    throw new Error('Propagation target not found')
                }
            }
        })
        this.abortController = new AbortController()
    }

    start(): void {
        this.started = true
        this.rpcCommunicator = new ListeningRpcCommunicator(`layer2-${this.randomGraphId}`, this.P2PTransport)
        this.layer1.on('newContact', (peerDescriptor, closestPeers) => this.newContact(peerDescriptor, closestPeers))
        this.layer1.on('contactRemoved', (peerDescriptor, closestPeers) => this.removedContact(peerDescriptor, closestPeers))
        this.layer1.on('newRandomContact', (peerDescriptor, randomPeers) => this.newRandomContact(peerDescriptor, randomPeers))
        this.layer1.on('randomContactRemoved', (peerDescriptor, randomPeers) => this.removedRandomContact(peerDescriptor, randomPeers))
        this.P2PTransport.on('disconnected', (peerDescriptor: PeerDescriptor) => this.onPeerDisconnected(peerDescriptor))
        this.targetNeighbors.on(PeerListEvent.PEER_ADDED, (id, _remote) => {
            this.propagation.onNeighborJoined(id)
        })
        this.handshaker = new Handshaker({
            ownPeerDescriptor: this.layer1.getPeerDescriptor(),
            randomGraphId: this.randomGraphId,
            nearbyContactPool: this.nearbyContactPool!,
            randomContactPool: this.randomContactPool!,
            targetNeighbors: this.targetNeighbors!,
            connectionLocker: this.connectionLocker,
            protoRpcClient: toProtoRpcClient(new NetworkRpcClient(this.rpcCommunicator!.getRpcClientTransport())),
            nodeName: this.config.nodeName,
            N: this.N
        })
        this.registerDefaultServerMethods()
        const candidates = this.getNewNeighborCandidates()
        if (candidates.length) {
            this.newContact(candidates[0], candidates)
        } else {
            logger.debug('layer1 had no closest contacts in the beginning')
        }
        this.findNeighbors([]).catch((e) => {
            logger.error('findNeighbors failed ' + e)
        })
        setImmediate(async () => {
            await scheduleAtInterval(this.updateNeighborInfo.bind(this), 10000, false, this.abortController.signal)
        })
    }

    private registerDefaultServerMethods(): void {
        this.handshake = this.handshake.bind(this)
        this.sendData = this.sendData.bind(this)
        this.interleaveNotice = this.interleaveNotice.bind(this)
        this.leaveStreamNotice = this.leaveStreamNotice.bind(this)
        this.neighborUpdate = this.neighborUpdate.bind(this)

        this.rpcCommunicator!.registerRpcNotification(StreamMessage, 'sendData', this.sendData)
        this.rpcCommunicator!.registerRpcNotification(LeaveStreamNotice, 'leaveStreamNotice', this.leaveStreamNotice)
        this.rpcCommunicator!.registerRpcNotification(InterleaveNotice, 'interleaveNotice', this.interleaveNotice)
        this.rpcCommunicator!.registerRpcMethod(StreamHandshakeRequest, StreamHandshakeResponse, 'handshake', this.handshake)
        this.rpcCommunicator!.registerRpcMethod(NeighborUpdate, NeighborUpdate, 'neighborUpdate', this.neighborUpdate)
    }

    stop(): void {
        if (!this.started) {
            return
        }
        this.stopped = true
        this.abortController.abort()
        this.targetNeighbors!.values().map((remote) => remote.leaveStreamNotice(this.layer1.getPeerDescriptor()))
        this.rpcCommunicator!.stop()
        this.removeAllListeners()
        this.layer1.off('newContact', (peerDescriptor, closestTen) => this.newContact(peerDescriptor, closestTen))
        this.layer1.off('contactRemoved', (peerDescriptor, closestTen) => this.removedContact(peerDescriptor, closestTen))
        this.layer1.off('newRandomContact', (peerDescriptor, randomPeers) => this.newRandomContact(peerDescriptor, randomPeers))
        this.layer1.off('randomContactRemoved', (peerDescriptor, randomPeers) => this.removedRandomContact(peerDescriptor, randomPeers))
        this.P2PTransport.off('disconnected', (peerDescriptor: PeerDescriptor) => this.onPeerDisconnected(peerDescriptor))
        this.nearbyContactPool!.clear()
        this.targetNeighbors!.clear()
        if (this.findNeighborsIntervalRef) {
            clearTimeout(this.findNeighborsIntervalRef)
        }
    }

    broadcast(msg: StreamMessage, previousPeer?: string): void {
        if (!previousPeer) {
            this.markAndCheckDuplicate(msg.messageRef!, msg.previousMessageRef)
        }
        this.emit(Event.MESSAGE, msg)
        this.propagation.feedUnseenMessage(msg, this.targetNeighbors!.getStringIds(), previousPeer || null)
    }

    private async findNeighbors(excluded: string[]): Promise<void> {
        if (this.stopped) {
            return
        }
        const newExcludes = await this.handshaker!.attemptHandshakesOnContacts(excluded)
        if (this.targetNeighbors!.size() < this.N && newExcludes.length < this.nearbyContactPool!.size()) {
            this.findNeighborsIntervalRef = setTimeout(async () => {
                if (this.findNeighborsIntervalRef) {
                    clearTimeout(this.findNeighborsIntervalRef)
                }
                await this.findNeighbors(newExcludes)
                this.findNeighborsIntervalRef = null
            }, 250)
        } else {
            this.findNeighborsIntervalRef = null
        }
    }

    private async updateNeighborInfo(): Promise<void> {
        logger.trace(`Updating neighbor info to peers`)
        const neighborDescriptors = this.targetNeighbors!.values().map((neighbor) => neighbor.getPeerDescriptor())
        await Promise.allSettled(this.targetNeighbors!.values().map(async (neighbor) => {
            const res = await neighbor.updateNeighbors(this.layer1.getPeerDescriptor(), neighborDescriptors)
            if (res.removeMe) {
                this.targetNeighbors!.remove(neighbor.getPeerDescriptor())
                if (!this.findNeighborsIntervalRef) {
                    this.findNeighbors([PeerID.fromValue(neighbor.getPeerDescriptor().kademliaId).toKey()])
                        .catch(() => {})
                }
            }
        }))
    }

    private newContact(_newContact: PeerDescriptor, closestTen: PeerDescriptor[]): void {
        logger.trace(`New nearby contact found`)
        if (this.stopped) {
            return
        }
        this.nearbyContactPool!.replaceAll(closestTen.map((descriptor) =>
            new RemoteRandomGraphNode(
                descriptor,
                this.randomGraphId,
                toProtoRpcClient(new NetworkRpcClient(this.rpcCommunicator!.getRpcClientTransport()))
            )
        ))
    }

    private removedContact(_removedContact: PeerDescriptor, closestTen: PeerDescriptor[]): void {
        logger.trace(`Nearby contact removed`)
        if (this.stopped) {
            return
        }
        this.nearbyContactPool!.replaceAll(closestTen.map((descriptor) =>
            new RemoteRandomGraphNode(
                descriptor,
                this.randomGraphId,
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
                this.randomGraphId,
                toProtoRpcClient(new NetworkRpcClient(this.rpcCommunicator!.getRpcClientTransport()))
            )
        ))
    }

    private removedRandomContact(_removedDescriptor: PeerDescriptor, randomPeers: PeerDescriptor[]): void {
        logger.trace(`New nearby contact found`)
        if (this.stopped) {
            return
        }
        this.randomContactPool!.replaceAll(randomPeers.map((descriptor) =>
            new RemoteRandomGraphNode(
                descriptor,
                this.randomGraphId,
                toProtoRpcClient(new NetworkRpcClient(this.rpcCommunicator!.getRpcClientTransport()))
            )
        ))
    }

    private getNewNeighborCandidates(): PeerDescriptor[] {
        return this.layer1.getNeighborList().getClosestContacts(this.PEER_VIEW_SIZE).map((contact: DhtPeer) => {
            return contact.getPeerDescriptor()
        })
    }

    private onPeerDisconnected(peerDescriptor: PeerDescriptor): void {
        if (this.targetNeighbors!.hasPeer(peerDescriptor)) {
            this.targetNeighbors!.remove(peerDescriptor)
            this.connectionLocker.unlockConnection(peerDescriptor, this.randomGraphId)
            if (!this.findNeighborsIntervalRef) {
                this.findNeighbors([PeerID.fromValue(peerDescriptor.kademliaId).toKey()]).catch(() => { })
            }
        }
    }

    private markAndCheckDuplicate(currentMessageRef: MessageRef, previousMessageRef?: MessageRef): boolean {
        const previousNumberPair = previousMessageRef ?
            new NumberPair(Number(previousMessageRef!.timestamp), previousMessageRef!.sequenceNumber)
            : null
        const currentNumberPair = new NumberPair(Number(currentMessageRef.timestamp), currentMessageRef.sequenceNumber)
        return this.duplicateDetector.markAndCheck(previousNumberPair, currentNumberPair)
    }

    getOwnStringId(): string {
        return PeerID.fromValue(this.layer1.getPeerDescriptor().kademliaId).toKey()
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
    async handshake(request: StreamHandshakeRequest, _context: ServerCallContext): Promise<StreamHandshakeResponse> {
        const requester = new RemoteRandomGraphNode(
            request.senderDescriptor!,
            request.randomGraphId,
            toProtoRpcClient(new NetworkRpcClient(this.rpcCommunicator!.getRpcClientTransport()))
        )
        return this.handshaker!.handleRequest(request, requester)
    }

    // INetworkRpc server method
    async sendData(message: StreamMessage, _context: ServerCallContext): Promise<Empty> {
        if (this.markAndCheckDuplicate(message.messageRef!, message.previousMessageRef)) {
            const { previousPeer } = message
            message["previousPeer"] = PeerID.fromValue(this.layer1.getPeerDescriptor().kademliaId).toKey()
            this.broadcast(message, previousPeer)
        }
        return Empty
    }

    // INetworkRpc server method
    async leaveStreamNotice(message: LeaveStreamNotice, _context: ServerCallContext): Promise<Empty> {
        if (message.randomGraphId === this.randomGraphId) {
            const contact = this.nearbyContactPool!.getNeighborWithId(message.senderId)
                || this.randomContactPool!.getNeighborWithId(message.senderId)
                || this.targetNeighbors!.getNeighborWithId(message.senderId)
            // TODO: check integrity of notifier?
            if (contact) {
                this.layer1!.removeContact(contact.getPeerDescriptor(), true)
                this.targetNeighbors!.remove(contact.getPeerDescriptor())
                this.nearbyContactPool!.remove(contact.getPeerDescriptor())
                this.connectionLocker.unlockConnection(contact.getPeerDescriptor(), this.randomGraphId)
                if (!this.findNeighborsIntervalRef) {
                    this.findNeighbors([message.senderId]).catch(() => { })
                }
            }
        }
        return Empty
    }

    // INetworkRpc server method
    async interleaveNotice(message: InterleaveNotice, _context: ServerCallContext): Promise<Empty> {
        if (message.randomGraphId === this.randomGraphId) {
            if (this.targetNeighbors!.hasPeerWithStringId(message.senderId)) {
                const senderDescriptor = this.targetNeighbors!.getNeighborWithId(message.senderId)!.getPeerDescriptor()
                this.connectionLocker.unlockConnection(senderDescriptor, this.randomGraphId)
                this.targetNeighbors!.remove(senderDescriptor)
            }

            const newContact = new RemoteRandomGraphNode(
                message.interleaveTarget!,
                this.randomGraphId,
                toProtoRpcClient(new NetworkRpcClient(this.rpcCommunicator!.getRpcClientTransport()))
            )
            this.handshaker!.interleaveHandshake(newContact, message.senderId).catch((e) => {
                logger.error(e)
            })
        }
        return Empty
    }

    // INetworkRpc server method
    async neighborUpdate(message: NeighborUpdate, _context: ServerCallContext): Promise<NeighborUpdate> {
        if (this.targetNeighbors!.hasPeerWithStringId(message.senderId)) {
            const newPeers = message.neighborDescriptors
                .filter((peerDescriptor) => {
                    const stringId = PeerID.fromValue(peerDescriptor.kademliaId).toKey()
                    return stringId !== this.getOwnStringId() && !this.targetNeighbors!.getStringIds().includes(stringId)
                })

            newPeers.forEach((peer) => this.nearbyContactPool!.add(
                new RemoteRandomGraphNode(
                    peer,
                    this.randomGraphId,
                    toProtoRpcClient(new NetworkRpcClient(this.rpcCommunicator!.getRpcClientTransport()))
                ))
            )
            if (this.findNeighborsIntervalRef) {
                this.findNeighbors([]).catch(() => { })
            }
        } else {
            const response: NeighborUpdate = {
                senderId: this.getOwnStringId(),
                randomGraphId: this.randomGraphId,
                neighborDescriptors: this.targetNeighbors!.values().map((neighbor) => neighbor.getPeerDescriptor()),
                removeMe: true
            }
            return response
        }
        const response: NeighborUpdate = {
            senderId: this.getOwnStringId(),
            randomGraphId: this.randomGraphId,
            neighborDescriptors: this.targetNeighbors!.values().map((neighbor) => neighbor.getPeerDescriptor()),
            removeMe: false
        }
        return response
    }
}
