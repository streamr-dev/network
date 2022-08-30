import { EventEmitter } from 'events'
import { DhtNode, PeerID, PeerDescriptor, DhtPeer, RoutingRpcCommunicator, ITransport, ConnectionLocker } from '@streamr/dht'
import {
    DataMessage,
    HandshakeRequest,
    HandshakeResponse,
    InterleaveNotice,
    LeaveNotice,
    MessageRef, NeighborUpdate
} from '../proto/packages/trackerless-network/protos/NetworkRpc'
import { PeerList } from './PeerList'
import { NetworkRpcClient } from '../proto/packages/trackerless-network/protos/NetworkRpc.client'
import { RemoteRandomGraphNode } from './RemoteRandomGraphNode'
import { INetworkRpc } from '../proto/packages/trackerless-network/protos/NetworkRpc.server'
import { Empty } from '../proto/google/protobuf/empty'
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { DuplicateMessageDetector, NumberPair } from '@streamr/utils'
import { Logger } from '@streamr/utils'

export enum Event {
    MESSAGE = 'streamr:layer2:random-graph-node:onmessage'
}

export interface RandomGraphNode {
    on(event: Event.MESSAGE, listener: (message: DataMessage) => any): this
}

export interface RandomGraphNodeParams {
    randomGraphId: string
    layer1: DhtNode
    P2PTransport: ITransport
    connectionLocker: ConnectionLocker
}

const logger = new Logger(module)

export class RandomGraphNode extends EventEmitter implements INetworkRpc {
    private stopped = false
    private started = false
    private readonly N = 4
    private readonly PEER_VIEW_SIZE = 10
    private readonly randomGraphId: string // StreamPartID
    private readonly layer1: DhtNode
    private readonly contactPool: PeerList
    private readonly targetNeighbors: PeerList = new PeerList(4)
    private readonly ongoingHandshakes: Set<string> = new Set()
    private rpcCommunicator: RoutingRpcCommunicator | null = null
    private readonly P2PTransport: ITransport
    private readonly connectionLocker: ConnectionLocker
    private readonly duplicateDetector: DuplicateMessageDetector
    private findNeighborsIntervalRef: NodeJS.Timeout | null = null
    private neighborUpdateIntervalRef: NodeJS.Timeout | null = null

    constructor(params: RandomGraphNodeParams) {
        super()
        this.randomGraphId = params.randomGraphId
        this.layer1 = params.layer1
        this.P2PTransport = params.P2PTransport
        this.connectionLocker = params.connectionLocker

        this.contactPool = new PeerList(this.PEER_VIEW_SIZE)
        this.targetNeighbors = new PeerList(this.N)
        this.duplicateDetector = new DuplicateMessageDetector(10000)
    }

    start(): void {

        this.started = true

        this.rpcCommunicator = new RoutingRpcCommunicator(`layer2-${ this.randomGraphId }`, this.P2PTransport)
        this.layer1.on('NEW_CONTACT', (peerDescriptor, closestTen) => this.newContact(peerDescriptor, closestTen))
        this.layer1.on('CONTACT_REMOVED', (peerDescriptor, closestTen) => this.removedContact(peerDescriptor, closestTen))
        this.registerDefaultServerMethods()
        const candidates = this.getNewNeighborCandidates()
        if (candidates.length) {
            this.newContact(candidates[0], candidates)
        }
        this.findNeighbors().catch(() => {})
        this.neighborUpdateIntervalRef = setTimeout(async () => {
            await this.updateNeighborInfo()
        }, 20)
    }

    stop(): void {
        if (!this.started) {
            return
        }
        this.stopped = true
        this.targetNeighbors.values().map((remote) => remote.leaveNotice(this.layer1.getPeerDescriptor()))
        this.rpcCommunicator!.stop()
        this.removeAllListeners()
        this.layer1.off('NEW_CONTACT', (peerDescriptor, closestTen) => this.newContact(peerDescriptor, closestTen))
        this.layer1.off('CONTACT_REMOVED', (peerDescriptor, closestTen) => this.removedContact(peerDescriptor, closestTen))
        this.contactPool.clear()
        this.targetNeighbors.clear()
        if (this.findNeighborsIntervalRef) {
            clearInterval(this.findNeighborsIntervalRef)
        }
        if (this.neighborUpdateIntervalRef) {
            clearTimeout(this.neighborUpdateIntervalRef)
        }
    }

    broadcast(msg: DataMessage, previousPeer?: string): void {
        if (!previousPeer) {
            this.markAndCheckDuplicate(msg.messageRef!, msg.previousMessageRef)
        }
        this.targetNeighbors.getStringIds().map((remote) => {
            if (previousPeer !== remote) {
                this.targetNeighbors.getNeighborWithId(remote)!.sendData(this.layer1.getPeerDescriptor(), msg)
            }
        })
    }

    private async findNeighbors(excluded?: string[]): Promise<void> {
        logger.trace(`Finding new neighbors...`)
        const excludedIds = excluded ? excluded : []

        // Handshake with two contacts if there is room
        if (this.targetNeighbors.size() < this.N - 2) {
            const exclude = excludedIds.concat(this.targetNeighbors.getStringIds())
            const targetNeighbors = this.contactPool.getClosestAndFurthest(exclude)
            targetNeighbors.forEach((contact) => this.ongoingHandshakes.add(PeerID.fromValue(contact.getPeerDescriptor().peerId).toMapKey()))

            const promises = [...targetNeighbors.values()].map(async (target: RemoteRandomGraphNode, i) => {
                const otherPeer = i === 0 ? targetNeighbors[1] : targetNeighbors[0]
                const res = await target.handshake(
                    this.layer1.getPeerDescriptor(),
                    this.targetNeighbors.getStringIds(),
                    this.contactPool.getStringIds(),
                    targetNeighbors.length > 1 ? PeerID.fromValue(otherPeer.getPeerDescriptor().peerId).toMapKey() : undefined
                )
                if (res.interleaveTarget) {
                    const interleaveTarget = new RemoteRandomGraphNode(
                        res.interleaveTarget,
                        this.randomGraphId,
                        new NetworkRpcClient(this.rpcCommunicator!.getRpcClientTransport())
                    )
                    await interleaveTarget.handshake(
                        this.layer1!.getPeerDescriptor(),
                        this.targetNeighbors.getStringIds(),
                        this.contactPool.getStringIds(),
                        undefined,
                        true
                    )
                    this.connectionLocker.lockConnection(interleaveTarget.getPeerDescriptor(), this.randomGraphId)
                } else if (res.accepted) {
                    this.connectionLocker.lockConnection(target.getPeerDescriptor(), this.randomGraphId)
                }

                this.targetNeighbors.add(targetNeighbors[i])
                this.ongoingHandshakes.delete(PeerID.fromValue(target.getPeerDescriptor().peerId).toMapKey())
                return res
            })
            const results = await Promise.allSettled(promises)
            results.map((res, i) => {
                if (res.status !== 'fulfilled') {
                    excludedIds.push(PeerID.fromValue(targetNeighbors[i].getPeerDescriptor().peerId).toMapKey())
                }
            })
        } else {
            const exclude = excludedIds.concat(this.targetNeighbors.getStringIds())
            const targetNeighbor = this.contactPool.getClosest(exclude)
            if (targetNeighbor) {
                const targetId = PeerID.fromValue(targetNeighbor.getPeerDescriptor().peerId).toMapKey()
                this.ongoingHandshakes.add(targetId)
                const res = await targetNeighbor?.handshake(
                    this.layer1!.getPeerDescriptor(),
                    this.targetNeighbors.getStringIds(),
                    this.contactPool.getStringIds()
                )
                if (res.accepted) {
                    this.targetNeighbors.add(targetNeighbor)
                    this.connectionLocker.lockConnection(targetNeighbor.getPeerDescriptor(), this.randomGraphId)
                } else {
                    excludedIds.push(targetId)
                }
                this.ongoingHandshakes.delete(targetId)
            }
        }

        if ((this.targetNeighbors.size() + this.ongoingHandshakes.size) < this.N) {
            this.findNeighborsIntervalRef = setTimeout(() => {
                this.findNeighbors(excludedIds).catch(() => {})
            }, 250)
        }
    }

    private async updateNeighborInfo(): Promise<void> {
        logger.trace(`Updating neighbor info to peers`)
        const neighborDescriptors = this.targetNeighbors.values().map((neighbor) => neighbor.getPeerDescriptor())

        await Promise.allSettled(this.targetNeighbors.values().map((neighbor) => {
            neighbor.updateNeighbors(this.layer1.getPeerDescriptor(), neighborDescriptors)
        }))
        this.neighborUpdateIntervalRef = setTimeout(async () => {
            await this.updateNeighborInfo()
        }, 10000)

    }

    private newContact(_newContact: PeerDescriptor, closestTen: PeerDescriptor[]): void {
        logger.trace(`New nearby contact found`)
        if (this.stopped) {
            return
        }
        this.contactPool.replaceAll(closestTen.map((descriptor) =>
            new RemoteRandomGraphNode(descriptor, this.randomGraphId, new NetworkRpcClient(this.rpcCommunicator!.getRpcClientTransport()))))
    }

    private removedContact(_removedContact: PeerDescriptor, closestTen: PeerDescriptor[]): void {
        logger.trace(`Nearby contact removed`)
        if (this.stopped) {
            return
        }
        this.contactPool.replaceAll(closestTen.map((descriptor) =>
            new RemoteRandomGraphNode(descriptor, this.randomGraphId, new NetworkRpcClient(this.rpcCommunicator!.getRpcClientTransport()))))
    }

    private getNewNeighborCandidates(): PeerDescriptor[] {
        return this.layer1.getNeighborList().getClosestContacts(this.PEER_VIEW_SIZE).map((contact: DhtPeer) => {
            return contact.getPeerDescriptor()
        })
    }

    getSelectedNeighborIds(): string[] {
        return this.targetNeighbors.getStringIds()
    }

    getContactPoolIds(): string[] {
        return this.contactPool.getStringIds()
    }

    private markAndCheckDuplicate(currentMessageRef: MessageRef, previousMessageRef?: MessageRef): boolean {
        const previousNumberPair = previousMessageRef ?
            new NumberPair(previousMessageRef!.timestamp, previousMessageRef!.sequenceNumber)
            : null
        const currentNumberPair = new NumberPair(currentMessageRef.timestamp, currentMessageRef.sequenceNumber)
        return this.duplicateDetector.markAndCheck(previousNumberPair, currentNumberPair)
    }

    getOwnStringId(): string {
        return PeerID.fromValue(this.layer1.getPeerDescriptor().peerId).toMapKey()
    }

    registerDefaultServerMethods(): void {
        this.handshake = this.handshake.bind(this)
        this.sendData = this.sendData.bind(this)
        this.interleaveNotice = this.interleaveNotice.bind(this)
        this.leaveNotice = this.leaveNotice.bind(this)
        this.neighborUpdate = this.neighborUpdate.bind(this)

        this.rpcCommunicator!.registerRpcNotification(DataMessage, 'sendData', this.sendData)
        this.rpcCommunicator!.registerRpcNotification(LeaveNotice, 'leaveNotice', this.leaveNotice)
        this.rpcCommunicator!.registerRpcNotification(InterleaveNotice, 'interleaveNotice', this.interleaveNotice)
        this.rpcCommunicator!.registerRpcMethod(HandshakeRequest, HandshakeResponse, 'handshake', this.handshake)
        this.rpcCommunicator!.registerRpcMethod(NeighborUpdate, NeighborUpdate, 'neighborUpdate', this.neighborUpdate)
    }

    // INetworkRpc server method
    async handshake(request: HandshakeRequest, _context: ServerCallContext): Promise<HandshakeResponse> {
        const newRemotePeer = new RemoteRandomGraphNode(
            request.senderDescriptor!,
            request.randomGraphId,
            new NetworkRpcClient(this.rpcCommunicator!.getRpcClientTransport())
        )

        // Add checking for connection handshakes
        if (this.targetNeighbors.size() >= this.N && request.neighbors.length <= this.N - 2) {
            const exclude = request.neighbors
            exclude.push(request.senderId)
            const furthest = this.targetNeighbors.getFurthest(exclude)
            const furthestPeerDescriptor = furthest ? furthest.getPeerDescriptor() : undefined

            if (furthest) {
                furthest.interleaveNotice(this.layer1.getPeerDescriptor(), request.senderDescriptor!)
                this.targetNeighbors.remove(furthest.getPeerDescriptor())
                this.connectionLocker.unlockConnection(furthestPeerDescriptor, this.randomGraphId)
            }
            this.targetNeighbors.add(newRemotePeer)
            const res: HandshakeResponse = {
                requestId: request.requestId,
                accepted: true,
                interleaveTarget: furthestPeerDescriptor
            }
            this.connectionLocker.lockConnection(request.senderDescriptor!, this.randomGraphId)
            return res
        } else if (this.targetNeighbors.size() === this.N && request.neighbors.length > this.N - 2) {
            // Add connection recommendation, requires knowledge of the neighbors of neighbors
            const res: HandshakeResponse = {
                requestId: request.requestId,
                accepted: false
            }
            return res
        } else if (this.targetNeighbors.size() < this.N && request.neighbors.length < this.N) {
            const res: HandshakeResponse = {
                requestId: request.requestId,
                accepted: true
            }
            this.targetNeighbors.add(newRemotePeer)
            this.connectionLocker.lockConnection(request.senderDescriptor!, this.randomGraphId)
            return res
        }

        const res: HandshakeResponse = {
            requestId: request.requestId,
            accepted: false,
        }
        return res
    }

    // INetworkRpc server method
    async sendData(message: DataMessage, _context: ServerCallContext): Promise<Empty> {
        if (this.markAndCheckDuplicate(message.messageRef!, message.previousMessageRef)) {
            const { previousPeer } = message
            message["previousPeer"] = PeerID.fromValue(this.layer1.getPeerDescriptor().peerId).toMapKey()
            this.emit(Event.MESSAGE, message)
            this.broadcast(message, previousPeer)
        }
        return Empty
    }

    // INetworkRpc server method
    async leaveNotice(message: LeaveNotice, _context: ServerCallContext): Promise<Empty> {
        if (message.randomGraphId === this.randomGraphId) {
            const contact = this.contactPool.getNeighborWithId(message.senderId)
            // TODO: check integrity of notifier?
            if (contact) {
                this.layer1!.removeContact(contact.getPeerDescriptor(), true)
                this.targetNeighbors.remove(contact.getPeerDescriptor())
                this.contactPool.remove(contact.getPeerDescriptor())
                this.connectionLocker.unlockConnection(contact.getPeerDescriptor(), this.randomGraphId)
            }
        }
        return Empty
    }

    async interleaveNotice(message: InterleaveNotice, _context: ServerCallContext): Promise<Empty> {
        if (message.randomGraphId === this.randomGraphId) {
            if (this.targetNeighbors.hasPeerWithStringId(message.senderId)) {
                this.connectionLocker.unlockConnection(
                    this.targetNeighbors.getNeighborWithId(message.senderId)!.getPeerDescriptor(),
                    this.randomGraphId
                )
            }

            const newContact = new RemoteRandomGraphNode(
                message.interleaveTarget!,
                this.randomGraphId,
                new NetworkRpcClient(this.rpcCommunicator!.getRpcClientTransport())
            )
            newContact.handshake(
                this.layer1!.getPeerDescriptor(),
                this.targetNeighbors.getStringIds(),
                this.contactPool.getStringIds(),
                undefined,
                true
            )
                .then(() => this.connectionLocker.lockConnection(newContact.getPeerDescriptor(), this.randomGraphId))
                .catch(() => {})
        }
        return Empty
    }

    async neighborUpdate(message: NeighborUpdate, _context: ServerCallContext): Promise<NeighborUpdate> {
        if (this.targetNeighbors.hasPeerWithStringId(message.senderId)) {
            this.targetNeighbors.getNeighborByStringId(message.senderId)!.setLocalNeighbors(message.neighborDescriptors)
            if (this.targetNeighbors.size() === 3 && message.neighborDescriptors.length < this.N && this.ongoingHandshakes.size === 0) {
                setImmediate(async () => {
                    const found = message.neighborDescriptors
                        .map((desc) => PeerID.fromValue(desc.peerId).toMapKey() as string)
                        .find((stringId) => stringId !== this.getOwnStringId() && !this.targetNeighbors.getStringIds().includes(stringId))

                    if (found) {
                        const targetPeerDescriptor = message.neighborDescriptors.find(
                            (descriptor) => PeerID.fromValue(descriptor.peerId).toMapKey() === found
                        )
                        const targetStringId = PeerID.fromValue(targetPeerDescriptor!.peerId).toMapKey()
                        const targetNeighbor = new RemoteRandomGraphNode(
                            targetPeerDescriptor!,
                            this.randomGraphId,
                            new NetworkRpcClient(this.rpcCommunicator!.getRpcClientTransport())
                        )
                        this.ongoingHandshakes.add(targetStringId)
                        const result = await targetNeighbor.handshake(
                            this.layer1.getPeerDescriptor(),
                            this.targetNeighbors.getStringIds(),
                            this.contactPool.getStringIds()
                        )
                        if (result.accepted) {
                            this.targetNeighbors.add(targetNeighbor)
                        }
                        this.ongoingHandshakes.delete(targetStringId)
                    }
                })
            }
        }
        const response: NeighborUpdate = {
            senderId: this.getOwnStringId(),
            randomGraphId: this.randomGraphId,
            neighborDescriptors: this.targetNeighbors.values().map((neighbor) => neighbor.getPeerDescriptor())
        }
        return response
    }
}
