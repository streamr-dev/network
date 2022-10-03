import { EventEmitter } from 'events'
import { DhtNode, PeerID, PeerDescriptor, DhtPeer, RoutingRpcCommunicator, ITransport, ConnectionLocker } from '@streamr/dht'
import {
    DataMessage,
    HandshakeRequest,
    HandshakeResponse,
    InterleaveNotice,
    LeaveNotice,
    MessageRef,
    NeighborUpdate
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
import { Handshaker } from './Handshaker'

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
    private readonly PEER_VIEW_SIZE = 25
    private readonly randomGraphId: string // StreamPartID
    private readonly layer1: DhtNode
    private readonly contactPool: PeerList
    private readonly targetNeighbors: PeerList = new PeerList(4)
    private rpcCommunicator: RoutingRpcCommunicator | null = null
    private readonly P2PTransport: ITransport
    private readonly connectionLocker: ConnectionLocker
    private readonly duplicateDetector: DuplicateMessageDetector
    private findNeighborsIntervalRef: NodeJS.Timeout | null = null
    private neighborUpdateIntervalRef: NodeJS.Timeout | null = null
    private handshaker?: Handshaker

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
        this.layer1.on('newContact', (peerDescriptor, closestTen) => this.newContact(peerDescriptor, closestTen))
        this.layer1.on('contactRemoved', (peerDescriptor, closestTen) => this.removedContact(peerDescriptor, closestTen))
        this.handshaker = new Handshaker({
            ownPeerDescriptor: this.layer1.getPeerDescriptor(),
            randomGraphId: this.randomGraphId,
            contactPool: this.contactPool,
            targetNeighbors: this.targetNeighbors,
            connectionLocker: this.connectionLocker,
            protoRpcClient: toProtoRpcClient(new NetworkRpcClient(this.rpcCommunicator!.getRpcClientTransport()))

        })
        this.registerDefaultServerMethods()
        const candidates = this.getNewNeighborCandidates()
        if (candidates.length) {
            this.newContact(candidates[0], candidates)
        }
        this.findNeighbors([]).catch(() => {})
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
        this.layer1.off('newContact', (peerDescriptor, closestTen) => this.newContact(peerDescriptor, closestTen))
        this.layer1.off('contactRemoved', (peerDescriptor, closestTen) => this.removedContact(peerDescriptor, closestTen))
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

    private async findNeighbors(excluded: string[]): Promise<void> {
        logger.trace(`Finding new neighbors...`)
        let newExcludes: string[]
        // Handshake with two contacts if there is room
        if (this.targetNeighbors.size() < this.N - 2) {
            newExcludes = await this.handshaker!.findParallelTargetsAndHandshake(excluded)
        } else {
            newExcludes = await this.handshaker!.findNewTargetAndHandshake(excluded)
        }

        if ((this.targetNeighbors.size() + this.handshaker!.getOngoingHandshakes().size) < this.N) {
            this.findNeighborsIntervalRef = setTimeout(() => {
                this.findNeighbors(newExcludes).catch(() => {})
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
        this.contactPool.replaceAll(closestTen.map((descriptor) =>
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

    getTargetNeighborStringIds(): string[] {
        return this.targetNeighbors.getStringIds()
    }

    getContactPoolIds(): string[] {
        return this.contactPool.getStringIds()
    }

    private markAndCheckDuplicate(currentMessageRef: MessageRef, previousMessageRef?: MessageRef): boolean {
        const previousNumberPair = previousMessageRef ?
            new NumberPair(Number(previousMessageRef!.timestamp), previousMessageRef!.sequenceNumber)
            : null
        const currentNumberPair = new NumberPair(Number(currentMessageRef.timestamp), currentMessageRef.sequenceNumber)
        return this.duplicateDetector.markAndCheck(previousNumberPair, currentNumberPair)
    }

    getOwnStringId(): string {
        return PeerID.fromValue(this.layer1.getPeerDescriptor().peerId).toKey()
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
        const requester = new RemoteRandomGraphNode(
            request.senderDescriptor!,
            request.randomGraphId,
            toProtoRpcClient(new NetworkRpcClient(this.rpcCommunicator!.getRpcClientTransport()))
        )

        // Add checking for connection handshakes
        if (this.targetNeighbors.size() >= this.N && request.neighbors.length <= this.N - 2) {
            return this.handshaker!.interleavingResponse(request, requester)
        } else if (this.targetNeighbors.size() === this.N && request.neighbors.length > this.N - 2) {
            return this.handshaker!.unacceptedResponse(request)
        } else if (this.targetNeighbors.size() < this.N && request.neighbors.length < this.N) {
            return this.handshaker!.acceptedResponse(request, requester)
        }

        return this.handshaker!.unacceptedResponse(request)
    }

    // INetworkRpc server method
    async sendData(message: DataMessage, _context: ServerCallContext): Promise<Empty> {
        if (this.markAndCheckDuplicate(message.messageRef!, message.previousMessageRef)) {
            const { previousPeer } = message
            message["previousPeer"] = PeerID.fromValue(this.layer1.getPeerDescriptor().peerId).toKey()
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
                toProtoRpcClient(new NetworkRpcClient(this.rpcCommunicator!.getRpcClientTransport()))
            )
            this.handshaker!.interleaveHandshake(newContact).catch(() => {})
        }
        return Empty
    }

    // INetworkRpc server method
    async neighborUpdate(message: NeighborUpdate, _context: ServerCallContext): Promise<NeighborUpdate> {
        if (this.targetNeighbors.hasPeerWithStringId(message.senderId)) {
            this.targetNeighbors.getNeighborByStringId(message.senderId)!.setLocalNeighbors(message.neighborDescriptors)
            if (
                this.targetNeighbors.size() === 3
                && message.neighborDescriptors.length < this.N
                && this.handshaker!.getOngoingHandshakes().size === 0
            ) {
                setImmediate(async () => {
                    const found = message.neighborDescriptors
                        .map((desc) => PeerID.fromValue(desc.peerId).toKey() as string)
                        .find((stringId) => stringId !== this.getOwnStringId() && !this.targetNeighbors.getStringIds().includes(stringId))

                    if (found) {
                        const targetPeerDescriptor = message.neighborDescriptors.find(
                            (descriptor) => PeerID.fromValue(descriptor.peerId).toKey() === found
                        )
                        const targetNeighbor = new RemoteRandomGraphNode(
                            targetPeerDescriptor!,
                            this.randomGraphId,
                            toProtoRpcClient(new NetworkRpcClient(this.rpcCommunicator!.getRpcClientTransport()))
                        )
                        await this.handshaker!.handshakeWithTarget(targetNeighbor)
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
