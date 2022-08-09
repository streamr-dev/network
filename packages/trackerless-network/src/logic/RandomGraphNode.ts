import { EventEmitter } from 'events'
import { DhtNode, DhtNodeEvent, PeerID, PeerDescriptor, DhtPeer, RoutingRpcCommunicator, ITransport } from '@streamr/dht'
import {
    DataMessage,
    HandshakeRequest,
    HandshakeResponse,
    InterleaveNotice,
    LeaveNotice,
    MessageRef
} from '../proto/packages/trackerless-network/protos/NetworkRpc'
import { NodeNeighbors } from './NodeNeighbors'
import { NetworkRpcClient } from '../proto/packages/trackerless-network/protos/NetworkRpc.client'
import { RemoteRandomGraphNode } from './RemoteRandomGraphNode'
import { INetworkRpc } from '../proto/packages/trackerless-network/protos/NetworkRpc.server'
import { Empty } from '../proto/google/protobuf/empty'
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { DuplicateMessageDetector, NumberPair } from './DuplicateMessageDetector'

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
}

export class RandomGraphNode extends EventEmitter implements INetworkRpc {
    private stopped = false
    private started = false
    private readonly N = 4
    private readonly PEER_VIEW_SIZE = 10
    private readonly randomGraphId: string // StreamPartID
    private readonly layer1: DhtNode
    private readonly contactPool: NodeNeighbors
    private readonly targetNeighbors: NodeNeighbors = new NodeNeighbors(4)
    private readonly acceptedNeighbors: NodeNeighbors = new NodeNeighbors(4)
    private readonly ongoingHandshakes: Set<string> = new Set()
    private rpcCommunicator: RoutingRpcCommunicator | null = null
    private readonly P2PTransport: ITransport
    private readonly duplicateDetector: DuplicateMessageDetector
    private findNeighborsIntervalRef: NodeJS.Timeout | null = null

    constructor(params: RandomGraphNodeParams) {
        super()
        this.randomGraphId = params.randomGraphId
        this.layer1 = params.layer1
        this.P2PTransport = params.P2PTransport

        this.contactPool = new NodeNeighbors(this.PEER_VIEW_SIZE)
        this.targetNeighbors = new NodeNeighbors(this.N)
        this.acceptedNeighbors = new NodeNeighbors(this.N)
        this.duplicateDetector = new DuplicateMessageDetector(10000)
    }

    start(): void {

        this.started = true

        this.rpcCommunicator = new RoutingRpcCommunicator(`layer2-${ this.randomGraphId }`, this.P2PTransport)
        this.layer1.on(DhtNodeEvent.NEW_CONTACT, (peerDescriptor, closestTen) => this.newContact(peerDescriptor, closestTen))
        this.layer1.on(DhtNodeEvent.CONTACT_REMOVED, (peerDescriptor, closestTen) => this.removedContact(peerDescriptor, closestTen))
        this.registerDefaultServerMethods()
        const candidates = this.getNewNeighborCandidates()
        if (candidates.length) {
            this.newContact(candidates[0], candidates)
        }
        this.findNeighbors().catch(() => {})
    }

    stop(): void {
        if (!this.started) {
            return
        }
        this.stopped = true
        this.targetNeighbors.values().map((remote) => remote.leaveNotice(this.layer1.getPeerDescriptor()))
        this.rpcCommunicator!.stop()
        this.removeAllListeners()
        this.layer1.off(DhtNodeEvent.NEW_CONTACT, (peerDescriptor, closestTen) => this.newContact(peerDescriptor, closestTen))
        this.layer1.off(DhtNodeEvent.CONTACT_REMOVED, (peerDescriptor, closestTen) => this.removedContact(peerDescriptor, closestTen))
        this.contactPool.clear()
        this.targetNeighbors.clear()
        if (this.findNeighborsIntervalRef) {
            clearInterval(this.findNeighborsIntervalRef)
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

    private newContact(_newContact: PeerDescriptor, closestTen: PeerDescriptor[]): void {
        if (this.stopped) {
            return
        }
        // const toReplace: string[] = []
        this.contactPool.replaceAll(closestTen.map((descriptor) =>
            new RemoteRandomGraphNode(descriptor, this.randomGraphId, new NetworkRpcClient(this.rpcCommunicator!.getRpcClientTransport()))))
        // this.targetNeighbors.getStringIds().forEach((neighbor) => {
        //     if (!this.contactPool.hasNeighborWithStringId(neighbor)) {
        //         toReplace.push(neighbor)
        //     }
        // })
        // this.replaceNeighbors(toReplace).catch((_err) => {})
    }

    private removedContact(removedContact: PeerDescriptor, closestTen: PeerDescriptor[]): void {
        if (this.stopped) {
            return
        }
        // const toReplace: string[] = []
        // if (this.targetNeighbors.hasNeighbor(removedContact)) {
        //     toReplace.push(PeerID.fromValue(removedContact.peerId).toMapKey())
        // }
        this.contactPool.replaceAll(closestTen.map((descriptor) =>
            new RemoteRandomGraphNode(descriptor, this.randomGraphId, new NetworkRpcClient(this.rpcCommunicator!.getRpcClientTransport()))))
        // this.targetNeighbors.getStringIds().forEach((neighbor) => {
        //     if (!this.contactPool.hasNeighborWithStringId(neighbor)) {
        //         toReplace.push(neighbor)
        //     }
        // })
        // this.replaceNeighbors(toReplace).catch((_err) => {})
    }

    private async replaceNeighbors(stringIds: string[]): Promise<void> {
        if (this.stopped) {
            return
        }
        stringIds.forEach((replace) => {
            const toReplace = this.targetNeighbors.getNeighborWithId(replace)
            if (toReplace) {
                this.targetNeighbors.remove(toReplace.getPeerDescriptor())
            }
        })
        const promises: Promise<void>[] = []
        // Fill up neighbors to N
        for (let i = this.targetNeighbors.size(); i < this.N; i++) {
            if (this.targetNeighbors.size() >= this.contactPool.size()
                || this.contactPool.size() < i) {
                break
            }
            const promise = this.addRandomContactToNeighbors()
            promises.push(promise)
        }
        await Promise.all(promises)
    }

    private getNewNeighborCandidates(): PeerDescriptor[] {
        return this.layer1.getNeighborList().getClosestContacts(this.PEER_VIEW_SIZE).map((contact: DhtPeer) => {
            return contact.getPeerDescriptor()
        })
    }

    private async addRandomContactToNeighbors(): Promise<void> {
        if (this.stopped) {
            return
        }
        const newNeighbor = this.contactPool.getRandom()
        if (newNeighbor) {
            const stringId = PeerID.fromValue(newNeighbor.getPeerDescriptor().peerId).toMapKey()
            if (!this.targetNeighbors.hasNeighborWithStringId(stringId)) {
                // Negotiate Layer 2 connection here if success add as neighbor
                this.targetNeighbors.add(newNeighbor)
                const accepted = await newNeighbor.handshake(
                    this.layer1.getPeerDescriptor(),
                    this.targetNeighbors.getStringIds(),
                    this.contactPool.getStringIds()
                )
                if (!accepted) {
                    this.targetNeighbors.remove(newNeighbor.getPeerDescriptor())
                    this.addRandomContactToNeighbors().catch(() => {})
                }
            }
        }
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

        this.rpcCommunicator!.registerRpcNotification(DataMessage, 'sendData', this.sendData)
        this.rpcCommunicator!.registerRpcNotification(LeaveNotice, 'leaveNotice', this.leaveNotice)
        this.rpcCommunicator!.registerRpcNotification(InterleaveNotice, 'interleaveNotice', this.interleaveNotice)
        this.rpcCommunicator!.registerRpcMethod(HandshakeRequest, HandshakeResponse, 'handshake', this.handshake)
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
            }
            this.targetNeighbors.add(newRemotePeer)
            const res: HandshakeResponse = {
                requestId: request.requestId,
                accepted: true,
                interleaveTarget: furthestPeerDescriptor
            }
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
            }
        }
        return Empty
    }

    async interleaveNotice(message: InterleaveNotice, _context: ServerCallContext): Promise<Empty> {
        if (message.randomGraphId === this.randomGraphId) {
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
            ).catch(() => {})
        }
        return Empty
    }
}
