import { DhtPeer } from './DhtPeer'
import KBucket from 'k-bucket'
import PQueue from 'p-queue'
import { EventEmitter } from 'eventemitter3'
import { SortedContactList } from './SortedContactList'
import { RoutingRpcCommunicator } from '../transport/RoutingRpcCommunicator'
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { PeerID } from '../helpers/PeerID'
import {
    ClosestPeersRequest,
    ClosestPeersResponse,
    ConnectivityResponseMessage,
    Message,
    NodeType,
    PeerDescriptor,
    PingRequest,
    PingResponse,
    RouteMessageAck,
    RouteMessageWrapper
} from '../proto/DhtRpc'
import { DuplicateDetector } from './DuplicateDetector'
import * as Err from '../helpers/errors'
import { ITransport, TransportEvents } from '../transport/ITransport'
import { ConnectionManager, ConnectionManagerConfig } from '../connection/ConnectionManager'
import { DhtRpcServiceClient } from '../proto/DhtRpc.client'
import { Logger } from '@streamr/utils'
import { v4 } from 'uuid'
import { IDhtRpcService } from '../proto/DhtRpc.server'
import { toProtoRpcClient } from '@streamr/proto-rpc'
import { waitForEvent3 } from '../helpers/waitForEvent3'

export interface RouteMessageParams {
    message: Uint8Array
    destinationPeer: PeerDescriptor
    sourcePeer: PeerDescriptor
    serviceId: string
    previousPeer?: PeerDescriptor
    messageId?: string
}

export interface DhtNodeEvents {
    newContact: (peerDescriptor: PeerDescriptor, closestPeers: PeerDescriptor[]) => void
    contactRemoved: (peerDescriptor: PeerDescriptor, closestPeers: PeerDescriptor[]) => void
    joinCompleted: () => void
    newKbucketContact: (peerDescriptor: PeerDescriptor, closestPeers: PeerDescriptor[]) => void
    kbucketContactRemoved: (peerDescriptor: PeerDescriptor) => void
    newOpenInternetContact: (peerDescriptor: PeerDescriptor, closestPeers: PeerDescriptor[]) => void
    openInternetContactRemoved: (peerDescriptor: PeerDescriptor, closestPeers: PeerDescriptor[]) => void
}

export class DhtNodeConfig {
    transportLayer?: ITransport
    peerDescriptor?: PeerDescriptor
    entryPoints?: PeerDescriptor[]
    webSocketHost?: string
    webSocketPort?: number
    peerIdString?: string
    nodeName?: string

    serviceId = 'layer0'
    parallelism = 3
    maxNeighborListSize = 100
    numberOfNodesPerKBucket = 1
    joinNoProgressLimit = 4
    routeMessageTimeout = 4000
    dhtJoinTimeout = 60000

    constructor(conf: Partial<DhtNodeConfig>) {
        // assign given non-undefined config vars over defaults
        let k: keyof typeof conf
        for (k in conf) {
            if (conf[k] === undefined) {
                delete conf[k]
            }
        }
        Object.assign(this, conf)
    }
}

const logger = new Logger(module)

export type Events = TransportEvents & DhtNodeEvents

export class DhtNode extends EventEmitter<Events> implements ITransport, IDhtRpcService {
    private readonly config: DhtNodeConfig
    private readonly routerDuplicateDetector: DuplicateDetector = new DuplicateDetector()
    private readonly ongoingClosestPeersRequests: Set<string> = new Set()

    // noProgressCounter is Increased on every getClosestPeers round in which no new nodes 
    // with an id closer to target id were found.
    // When joinNoProgressLimit is reached, the join process will terminate. If a closer node is found
    // before reaching joinNoProgressLimit, this counter gets reset to 0.

    private noProgressCounter = 0
    private joinTimeoutRef?: NodeJS.Timeout
    private ongoingJoinOperation = false

    private bucket?: KBucket<DhtPeer>
    private neighborList?: SortedContactList<DhtPeer>
    private openInternetPeers?: SortedContactList<DhtPeer>
    private rpcCommunicator?: RoutingRpcCommunicator
    private transportLayer?: ITransport
    private ownPeerDescriptor?: PeerDescriptor

    private outgoingClosestPeersRequestsCounter = 0

    private cleanUpHandleForConnectionManager?: ConnectionManager
    private started = false
    private stopped = false

    constructor(conf: Partial<DhtNodeConfig>) {
        super()
        this.config = new DhtNodeConfig(conf)
    }

    public async start(): Promise<void> {
        if (this.started || this.stopped) {
            return
        }
        logger.info(`Starting new Streamr Network DHT Node with serviceId ${this.config.serviceId}`)
        this.started = true
        // If transportLayer is given, do not create a ConnectionManager
        if (this.config.transportLayer) {
            this.transportLayer = this.config.transportLayer
            this.ownPeerDescriptor = this.transportLayer.getPeerDescriptor()
        } else {
            const connectionManagerConfig: ConnectionManagerConfig = {
                transportLayer: this,
                entryPoints: this.config.entryPoints
            }
            // If own PeerDescriptor is given in config, create a ConnectionManager with ws server
            if (this.config.peerDescriptor && this.config.peerDescriptor.websocket) {
                connectionManagerConfig.webSocketHost = this.config.peerDescriptor.websocket.ip
                connectionManagerConfig.webSocketPort = this.config.peerDescriptor.websocket.port
            } else {
                // If webSocketPort is given, create ws server using it, webSocketHost can be undefined
                if (this.config.webSocketPort) {
                    connectionManagerConfig.webSocketHost = this.config.webSocketHost
                    connectionManagerConfig.webSocketPort = this.config.webSocketPort
                }
            }

            const connectionManager = new ConnectionManager(connectionManagerConfig)
            await connectionManager.start(this.generatePeerDescriptorCallBack)
            this.cleanUpHandleForConnectionManager = connectionManager
            this.transportLayer = connectionManager
        }

        this.rpcCommunicator = new RoutingRpcCommunicator(this.config.serviceId, this.transportLayer)

        this.bindDefaultServerMethods()
        this.initKBucket(this.ownPeerId!)
    }

    private generatePeerDescriptorCallBack = (connectivityResponse: ConnectivityResponseMessage) => {
        if (this.config.peerDescriptor) {
            this.ownPeerDescriptor = this.config.peerDescriptor
        } else {
            this.ownPeerDescriptor = DhtNode.createPeerDescriptor(connectivityResponse, this.config.peerIdString)
        }

        return this.ownPeerDescriptor
    }

    private get ownPeerId(): PeerID | undefined {
        if (!this.ownPeerDescriptor) {
            return undefined
        } else {
            return PeerID.fromValue(this.ownPeerDescriptor!.peerId)
        }
    }

    public static createPeerDescriptor = (msg?: ConnectivityResponseMessage, peerIdString?: string): PeerDescriptor => {

        let peerId: Uint8Array

        if (msg) {
            peerId = peerIdString ? PeerID.fromString(peerIdString).value : PeerID.fromIp(msg.ip).value
        } else {
            peerId = PeerID.fromString(peerIdString!).value
        }

        const ret: PeerDescriptor = { peerId: peerId, type: NodeType.NODEJS }

        if (msg && msg.websocket) {
            ret.websocket = { ip: msg.websocket!.ip, port: msg.websocket!.port }
            ret.openInternet = true
        }

        return ret
    }

    private initKBucket(selfId: PeerID): void {
        this.bucket = new KBucket({
            localNodeId: selfId.value,
            numberOfNodesPerKBucket: this.config.numberOfNodesPerKBucket
        })

        this.bucket.on('ping', async (oldContacts, newContact) => {
            // Here the node should call ping() on all old contacts. If one of them fails it should be removed
            // and replaced with the newContact
            for (const contact of oldContacts) {
                if (this.stopped) {
                    break
                }
                const alive = await contact.ping(this.ownPeerDescriptor!)
                if (!alive) {
                    logger.trace(`Removing ${contact.peerId.value.toString()} due to being inactive, `
                        + `replacing old contact with ${newContact.peerId.value.toString()}`)
                    this.removeContact(contact.getPeerDescriptor(), true)
                    this.addNewContact(newContact.getPeerDescriptor())
                    break
                }
            }
        })
        this.bucket.on('removed', (contact: DhtPeer) => {
            this.cleanUpHandleForConnectionManager?.unlockConnection(contact.getPeerDescriptor(), this.config.serviceId)
            logger.trace(`Removed contact ${contact.peerId.value.toString()}`)
            this.emit(
                'kbucketContactRemoved',
                contact.getPeerDescriptor()
            )
        })
        this.bucket.on('added', async (contact: DhtPeer) => {
            if (!this.stopped && !contact.peerId.equals(this.ownPeerId!)) {
                if (await contact.ping(this.ownPeerDescriptor!)) {
                    this.cleanUpHandleForConnectionManager?.lockConnection(contact.getPeerDescriptor(), this.config.serviceId)
                    logger.trace(`Added new contact ${contact.peerId.value.toString()}`)
                    this.emit(
                        'newKbucketContact',
                        contact.getPeerDescriptor(),
                        this.neighborList!.getClosestContacts(10).map((peer) => peer.getPeerDescriptor())
                    )
                } else {
                    this.removeContact(contact.getPeerDescriptor())
                    this.addClosestContactToBucket()
                }
            }
        })
        this.bucket.on('updated', (_oldContact: DhtPeer, _newContact: DhtPeer) => {
            // TODO: Update contact info to the connection manager and reconnect
        })
        this.neighborList = new SortedContactList(selfId, this.config.maxNeighborListSize)
        this.neighborList.on('contactRemoved', (peerDescriptor: PeerDescriptor, activeContacts: PeerDescriptor[]) =>
            this.emit('contactRemoved', peerDescriptor, activeContacts)
        )
        this.neighborList.on('newContact', (peerDescriptor: PeerDescriptor, activeContacts: PeerDescriptor[]) =>
            this.emit('newContact', peerDescriptor, activeContacts)
        )
        this.openInternetPeers = new SortedContactList(selfId, this.config.maxNeighborListSize / 2)
        this.openInternetPeers.on('contactRemoved', (peerDescriptor: PeerDescriptor, activeContacts: PeerDescriptor[]) =>
            this.emit('openInternetContactRemoved', peerDescriptor, activeContacts)
        )
        this.openInternetPeers.on('newContact', (peerDescriptor: PeerDescriptor, activeContacts: PeerDescriptor[]) =>
            this.emit('newOpenInternetContact', peerDescriptor, activeContacts)
        )
    }

    public getNeighborList(): SortedContactList<DhtPeer> {
        return this.neighborList!
    }

    public getNodeId(): PeerID {
        return this.ownPeerId!
    }

    public onGetClosestPeers(caller: PeerDescriptor): DhtPeer[] {
        if (!this.started || this.stopped) {
            return []
        }
        logger.trace(`processing getClosestPeersRequest`)
        const ret = this.bucket!.closest(caller.peerId, 5)
        this.addNewContact(caller, true)
        //this.neighborList!.setContacted(PeerID.fromValue(caller.peerId))
        return ret
    }

    public async onRoutedMessage(routedMessage: RouteMessageWrapper): Promise<void> {
        if (!this.started || this.stopped || this.routerDuplicateDetector.isMostLikelyDuplicate(routedMessage.requestId)) {
            return
        }
        logger.trace(`Processing received routeMessage ${routedMessage.requestId}`)
        this.addNewContact(routedMessage.sourcePeer!, true)
        this.routerDuplicateDetector.add(routedMessage.requestId)
        const message = Message.fromBinary(routedMessage.message)
        if (this.ownPeerId!.equals(PeerID.fromValue(routedMessage.destinationPeer!.peerId))) {
            logger.trace(`RouteMessage ${routedMessage.requestId} successfully arrived to destination`)
            this.emit('data', message, routedMessage.sourcePeer!)
        } else {
            await this.doRouteMessage({
                message: routedMessage.message,
                previousPeer: routedMessage.previousPeer as PeerDescriptor,
                destinationPeer: routedMessage.destinationPeer as PeerDescriptor,
                sourcePeer: routedMessage.sourcePeer as PeerDescriptor,
                serviceId: message.serviceId,
                messageId: routedMessage.requestId
            })
        }
    }

    public send(msg: Message, targetPeerDescriptor: PeerDescriptor): void {
        if (!this.started || this.stopped) {
            return
        }
        const params: RouteMessageParams = {
            message: Message.toBinary(msg),
            messageId: v4(),
            destinationPeer: targetPeerDescriptor,
            serviceId: msg.serviceId ? msg.serviceId : 'layer0',
            sourcePeer: this.ownPeerDescriptor!
        }
        this.doRouteMessage(params).catch((err) => {
            logger.warn(`Failed to send (routeMessage: ${this.config.serviceId}) to ${targetPeerDescriptor.peerId.toString()}: ${err}`)
        })
    }

    public async doRouteMessage(params: RouteMessageParams): Promise<void> {
        if (!this.started
            || this.stopped
            || this.ownPeerId!.equals(PeerID.fromValue(params.destinationPeer!.peerId))) {
            return
        }
        logger.trace(`Routing message ${params.messageId}`)
        let successAcks = 0
        const queue = new PQueue({ concurrency: this.config.parallelism, timeout: this.config.routeMessageTimeout })
        const routingTargets = this.getRoutingCandidates(params.destinationPeer, params.sourcePeer, params.previousPeer)
        const targetPeerDescriptors = routingTargets.map((target) => target.getPeerDescriptor())
        if (this.cleanUpHandleForConnectionManager) {
            targetPeerDescriptors.map((peerDescriptor) => {
                this.cleanUpHandleForConnectionManager!.lockConnection(peerDescriptor, this.config.serviceId + '::RouteMessage')
            })
        }
        const initialLength = routingTargets.length
        while (successAcks < this.config.parallelism && successAcks < initialLength && routingTargets.length > 0) {
            if (this.stopped) {
                break
            }
            const next = routingTargets.shift()
            queue.add(
                (async () => {
                    const success = await next!.routeMessage({
                        ...params,
                        previousPeer: this.getPeerDescriptor()
                    })
                    if (success) {
                        successAcks += 1
                    }

                })
            )
        }
        await queue.onIdle()
        queue.removeAllListeners()
        if (this.cleanUpHandleForConnectionManager) {
            targetPeerDescriptors.map((peerDescriptor) => {
                this.cleanUpHandleForConnectionManager!.unlockConnection(peerDescriptor, this.config.serviceId + '::RouteMessage')
            })
        }
        // Only throw if originator
        if (successAcks === 0 && this.ownPeerId!.equals(PeerID.fromValue(params.sourcePeer!.peerId))) {
            throw new Err.CouldNotRoute(
                `Routing message to peer: ${PeerID.fromValue(params.destinationPeer!.peerId).toKey()}`
                + ` from ${this.ownPeerId!.toKey()} failed.`
            )
        }
    }

    private getRoutingCandidates(destinationPeer: PeerDescriptor, sourcePeer: PeerDescriptor, previousPeer?: PeerDescriptor): DhtPeer[] {

        const routingSortedContacts = new SortedContactList(PeerID.fromValue(destinationPeer.peerId), 6, true)

        const closestFromKBucket = this.bucket!.closest(destinationPeer.peerId, this.config.parallelism).filter((dhtPeer: DhtPeer) =>
            this.routeCheck(dhtPeer.getPeerDescriptor(), sourcePeer, destinationPeer, previousPeer)
        )
        routingSortedContacts.addContacts(closestFromKBucket)
        if (this.cleanUpHandleForConnectionManager) {
            const closestConnections = this.cleanUpHandleForConnectionManager.getAllConnectionPeerDescriptors()
                .filter((peerDescriptor) => this.routeCheck(peerDescriptor, sourcePeer, destinationPeer, previousPeer))
                .map((peerDescriptor) =>
                    new DhtPeer(peerDescriptor, toProtoRpcClient(new DhtRpcServiceClient(this.rpcCommunicator!.getRpcClientTransport())))
                )
            routingSortedContacts.addContacts(closestConnections)
        }
        return routingSortedContacts.getAllContacts().map((contact) => contact as DhtPeer)
    }

    public canRoute(routedMessage: RouteMessageWrapper): boolean {
        if (!this.started || this.stopped) {
            return false
        }
        if (this.ownPeerId!.equals(PeerID.fromValue(routedMessage.destinationPeer!.peerId))) {
            return true
        }
        if (this.routerDuplicateDetector.isMostLikelyDuplicate(routedMessage.requestId)) {
            logger.trace(`Message ${routedMessage.requestId} is not routable due to being a duplicate`)
            return false
        }
        const closestPeers = this.getRoutingCandidates(routedMessage.destinationPeer!, routedMessage.sourcePeer!, routedMessage.previousPeer)
        const notRoutableCount = this.notRoutableCount(
            closestPeers,
            routedMessage.sourcePeer!,
            routedMessage.destinationPeer!,
            routedMessage.previousPeer
        )
        return (closestPeers.length - notRoutableCount) > 0
    }

    private notRoutableCount(peers: DhtPeer[], sourcePeer: PeerDescriptor, destinationPeer: PeerDescriptor, previousPeer?: PeerDescriptor): number {
        return peers.reduce((acc: number, curr: DhtPeer) => {
            if (!this.routeCheck(curr.getPeerDescriptor(), sourcePeer, destinationPeer, previousPeer)) {
                return acc + 1
            }
            return acc
        }, 0)
    }

    private routeCheck(
        peerToRoute: PeerDescriptor,
        originatorPeer: PeerDescriptor,
        destinationPeer: PeerDescriptor,
        previousPeer?: PeerDescriptor
    ): boolean {
        const peerIdToRoute = PeerID.fromValue(peerToRoute.peerId)
        const originatorPeerId = PeerID.fromValue(originatorPeer.peerId)

        const previousPeerChecks = previousPeer ?
            !PeerID.fromValue(previousPeer.peerId).equals(peerIdToRoute)
                && KBucket.distance(previousPeer.peerId, destinationPeer.peerId) > KBucket.distance(peerToRoute.peerId, destinationPeer.peerId)
            : true
        return !peerIdToRoute.equals(this.ownPeerId!)
            && !peerIdToRoute.equals(originatorPeerId)
            && previousPeerChecks
    }

    private async getClosestPeersFromContact(contact: DhtPeer): Promise<PeerDescriptor[]> {
        if (!this.started || this.stopped) {
            return []
        }
        logger.trace(`Getting closest peers from contact: ${contact.peerId.toKey()}`)
        this.outgoingClosestPeersRequestsCounter++
        this.neighborList!.setContacted(contact.peerId)
        const returnedContacts = await contact.getClosestPeers(this.ownPeerDescriptor!)
        this.neighborList!.setActive(contact.peerId)
        return returnedContacts
    }

    private onClosestPeersRequestSucceeded(peerId: PeerID, contacts: PeerDescriptor[]) {
        if (this.ongoingClosestPeersRequests.has(peerId.toKey())) {
            this.ongoingClosestPeersRequests.delete(peerId.toKey())
            const dhtPeers = contacts.map((peer) => {
                return new DhtPeer(peer, toProtoRpcClient(new DhtRpcServiceClient(this.rpcCommunicator!.getRpcClientTransport())))
            })

            const oldClosestContact = this.neighborList!.getClosestContactId()

            dhtPeers.forEach((contact) => this.addNewContact(contact.getPeerDescriptor(), false))

            if (this.neighborList!.getClosestContactId().equals(oldClosestContact)) {
                this.noProgressCounter++
            } else {
                this.noProgressCounter = 0
            }

            if (this.ongoingJoinOperation && this.isJoinCompleted()) {
                this.emit('joinCompleted')
                this.ongoingJoinOperation = false
            } else {
                this.findMoreContacts()
            }
        }
    }

    private onClosestPeersRequestFailed(peerId: PeerID, exception: Error) {
        if (this.ongoingClosestPeersRequests.has(peerId.toKey())) {
            this.ongoingClosestPeersRequests.delete(peerId.toKey())
            logger.debug('onClosestPeersRequestFailed: ' + exception)
            this.neighborList!.removeContact(peerId)
            this.findMoreContacts()
        }
    }

    private isJoinCompleted(): boolean {
        return (this.neighborList!.getUncontactedContacts(this.config.parallelism).length < 1
            || this.noProgressCounter >= this.config.joinNoProgressLimit)
    }

    public async joinDht(entryPointDescriptor: PeerDescriptor): Promise<void> {
        if (!this.started || this.stopped || this.ongoingJoinOperation) {
            return
        }

        this.ongoingJoinOperation = true
        this.noProgressCounter = 0

        logger.info(`Joining The Streamr Network via entrypoint ${entryPointDescriptor.peerId.toString()}`)
        const entryPoint = new DhtPeer(entryPointDescriptor, toProtoRpcClient(new DhtRpcServiceClient(this.rpcCommunicator!.getRpcClientTransport())))

        if (this.ownPeerId!.equals(entryPoint.peerId)) {
            return
        }

        this.addNewContact(entryPointDescriptor)
        const closest = this.bucket!.closest(this.ownPeerId!.value, this.config.parallelism)
        this.neighborList!.addContacts(closest)

        this.findMoreContacts()
        try {
            await waitForEvent3<Events>(this, 'joinCompleted', this.config.dhtJoinTimeout)
        } catch (_e) {
            throw (new Err.DhtJoinTimeout('join timed out'))
        }
    }

    private findMoreContacts(): void {
        if (this.ongoingJoinOperation) {
            const uncontacted = this.neighborList!.getUncontactedContacts(this.config.parallelism)
            while (this.ongoingClosestPeersRequests.size < this.config.parallelism && uncontacted.length > 0) {
                const nextPeer = uncontacted.shift()
                this.ongoingClosestPeersRequests.add(nextPeer!.peerId.toKey())
                this.getClosestPeersFromContact(nextPeer!)
                    .then((contacts) => this.onClosestPeersRequestSucceeded(nextPeer!.peerId, contacts))
                    .catch((err) => this.onClosestPeersRequestFailed(nextPeer!.peerId, err))
            }
        }
    }

    public getBucketSize(): number {
        return this.bucket!.count()
    }

    private addNewContact(contact: PeerDescriptor, setActive = false): void {
        if (!this.started || this.stopped
            || (
                !this.bucket!.get(contact.peerId)
                && !this.neighborList!.getContact(PeerID.fromValue(contact.peerId))
            )
        ) {
            logger.trace(`Adding new contact ${contact.peerId.toString()}`)
            const dhtPeer = new DhtPeer(contact, toProtoRpcClient(new DhtRpcServiceClient(this.rpcCommunicator!.getRpcClientTransport())))
            const peerId = PeerID.fromValue(contact.peerId)
            if (!this.neighborList!.hasContact(peerId)) {
                this.neighborList!.addContact(dhtPeer)
            }
            if (contact.openInternet && !this.openInternetPeers!.hasContact(peerId)) {
                this.openInternetPeers!.addContact(dhtPeer)
            }
            if (setActive) {
                this.neighborList!.setActive(peerId)
                this.openInternetPeers!.setActive(peerId)
            }
            this.bucket!.add(dhtPeer)
        }
    }

    removeContact(contact: PeerDescriptor, removeFromOpenInternetPeers = false): void {
        if (!this.started || this.stopped) {
            return
        }
        logger.trace(`Removing contact ${contact.peerId.toString()}`)
        const peerId = PeerID.fromValue(contact.peerId)
        this.bucket!.remove(peerId.value)
        this.neighborList!.removeContact(peerId)
        if (removeFromOpenInternetPeers) {
            this.openInternetPeers!.removeContact(peerId)
        }
    }

    private bindDefaultServerMethods(): void {
        if (!this.started || this.stopped) {
            return
        }
        logger.trace(`Binding default DHT RPC methods`)

        this.getClosestPeers = this.getClosestPeers.bind(this)
        this.ping = this.ping.bind(this)
        this.routeMessage = this.routeMessage.bind(this)

        this.rpcCommunicator!.registerRpcMethod(ClosestPeersRequest, ClosestPeersResponse, 'getClosestPeers', this.getClosestPeers)
        this.rpcCommunicator!.registerRpcMethod(PingRequest, PingResponse, 'ping', this.ping)
        this.rpcCommunicator!.registerRpcMethod(RouteMessageWrapper, RouteMessageAck, 'routeMessage', this.routeMessage)
    }

    public getRpcCommunicator(): RoutingRpcCommunicator {
        return this.rpcCommunicator!
    }

    public getTransport(): ITransport {
        return this.transportLayer!
    }

    public getPeerDescriptor(): PeerDescriptor {
        return this.ownPeerDescriptor!
    }

    public getK(): number {
        return this.config.numberOfNodesPerKBucket
    }

    public getKBucketPeers(): PeerDescriptor[] {
        return this.bucket!.toArray().map((dhtPeer: DhtPeer) => dhtPeer.getPeerDescriptor())
    }

    public getOpenInternetPeerDescriptors(): PeerDescriptor[] {
        return this.openInternetPeers!.getAllContacts().map((contact) => contact.getPeerDescriptor())
    }

    public getNumberOfOutgoingClosestPeersRequests(): number {
        return this.outgoingClosestPeersRequestsCounter
    }

    private addClosestContactToBucket(): void {
        if (!this.started || this.stopped) {
            return
        }
        const closest = this.getClosestActiveContactNotInBucket()
        if (closest) {
            this.addNewContact(closest.getPeerDescriptor())
        }
    }

    private getClosestActiveContactNotInBucket(): DhtPeer | undefined {
        for (const contactId of this.neighborList!.getContactIds()) {
            if (!this.bucket!.get(contactId.value) && this.neighborList!.isActive(contactId)) {
                return this.neighborList!.getContact(contactId).contact
            }
        }
        return undefined
    }

    public getNodeName(): string {
        if (this.config.nodeName) {
            return this.config.nodeName
        } else {
            return 'unnamed node'
        }
    }

    public async stop(): Promise<void> {
        if (!this.started) {
            throw new Err.CouldNotStop('Cannot not stop() before start()')
        }
        if (this.joinTimeoutRef) {
            clearTimeout(this.joinTimeoutRef)
        }
        this.stopped = true
        this.ongoingJoinOperation = false
        this.bucket!.removeAllListeners()
        this.rpcCommunicator?.stop()
        this.removeAllListeners()
        await this.cleanUpHandleForConnectionManager?.stop()
    }

    // IDHTRpcService implementation

    public async getClosestPeers(request: ClosestPeersRequest, _context: ServerCallContext): Promise<ClosestPeersResponse> {
        const closestPeers = this.onGetClosestPeers(request.peerDescriptor!)
        const peerDescriptors = closestPeers.map((dhtPeer: DhtPeer) => dhtPeer.getPeerDescriptor())
        const response = {
            peers: peerDescriptors,
            requestId: request.requestId
        }
        return response
    }

    public async ping(request: PingRequest, _context: ServerCallContext): Promise<PingResponse> {
        const response: PingResponse = {
            requestId: request.requestId
        }
        return response
    }

    public async routeMessage(routed: RouteMessageWrapper, _context: ServerCallContext): Promise<RouteMessageAck> {
        const converted = {
            ...routed,
            destinationPeer: routed.destinationPeer!,
            sourcePeer: routed.sourcePeer!
        }
        const routable = this.canRoute(converted)

        const response: RouteMessageAck = {
            requestId: routed.requestId,
            destinationPeer: routed.sourcePeer,
            sourcePeer: routed.destinationPeer,
            error: routable ? '' : 'Could not forward the message'
        }
        if (routable) {
            setImmediate(async () => {
                try {
                    await this.onRoutedMessage(converted)
                } catch (err) {
                    // no-op
                }
            })
        }
        return response
    }

}
