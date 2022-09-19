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
import { jsFormatPeerDescriptor } from '../helpers/common'
import { IDhtRpcService } from '../proto/DhtRpc.server'
import { toProtoRpcClient } from '@streamr/proto-rpc'

export interface RouteMessageParams {
    message: Uint8Array
    destinationPeer: PeerDescriptor
    sourcePeer: PeerDescriptor
    serviceId: string
    previousPeer?: PeerDescriptor
    messageId?: string
}

export interface DhtNodeEvents {
    NEW_CONTACT: (peerDescriptor: PeerDescriptor, closestPeers: PeerDescriptor[]) => void
    CONTACT_REMOVED: (peerDescriptor: PeerDescriptor, closestPeers: PeerDescriptor[]) => void
    JOIN_COMPLETED: () => void
    NEW_KBUCKET_CONTACT: (peerDescriptor: PeerDescriptor, closestPeers: PeerDescriptor[]) => void
    KBUCKET_CONTACT_REMOVED: (peerDescriptor: PeerDescriptor) => void
    NEW_OPEN_INTERNET_CONTACT: (peerDescriptor: PeerDescriptor, closestPeers: PeerDescriptor[]) => void
    OPEN_INTERNET_CONTACT_REMOVED: (peerDescriptor: PeerDescriptor, closestPeers: PeerDescriptor[]) => void
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
    private readonly peers: Map<string, DhtPeer> = new Map()
    private readonly routerDuplicateDetector: DuplicateDetector = new DuplicateDetector()
    private readonly ongoingClosestPeersRequests: Set<string> = new Set()

    private noProgressCounter = 0
    private joinTimeoutRef: NodeJS.Timeout | null = null
    private ongoingJoinOperation = false

    private bucket?: KBucket<DhtPeer>
    private neighborList?: SortedContactList<DhtPeer>
    private openInternetPeers?: SortedContactList<DhtPeer>
    private rpcCommunicator?: RoutingRpcCommunicator
    private transportLayer?: ITransport
    private ownPeerDescriptor?: PeerDescriptor
    private ownPeerId?: PeerID

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
            this.ownPeerId = PeerID.fromValue(this.ownPeerDescriptor.peerId)
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
        this.ownPeerId = PeerID.fromValue(this.ownPeerDescriptor!.peerId)
        return this.ownPeerDescriptor
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
                'KBUCKET_CONTACT_REMOVED',
                contact.getPeerDescriptor()
            )
        })
        this.bucket.on('added', async (contact: DhtPeer) => {
            if (!contact.peerId.equals(this.ownPeerId!)) {
                if (await contact.ping(this.ownPeerDescriptor!)) {
                    this.cleanUpHandleForConnectionManager?.lockConnection(contact.getPeerDescriptor(), this.config.serviceId)
                    logger.trace(`Added new contact ${contact.peerId.value.toString()}`)
                    this.emit(
                        'NEW_KBUCKET_CONTACT',
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
        this.neighborList.on('CONTACT_REMOVED', (peerDescriptor: PeerDescriptor, activeContacts: PeerDescriptor[]) =>
            this.emit('CONTACT_REMOVED', peerDescriptor, activeContacts)
        )
        this.neighborList.on('NEW_CONTACT', (peerDescriptor: PeerDescriptor, activeContacts: PeerDescriptor[]) =>
            this.emit('NEW_CONTACT', peerDescriptor, activeContacts)
        )
        this.openInternetPeers = new SortedContactList(selfId, this.config.maxNeighborListSize / 2)
        this.openInternetPeers.on('CONTACT_REMOVED', (peerDescriptor: PeerDescriptor, activeContacts: PeerDescriptor[]) =>
            this.emit('OPEN_INTERNET_CONTACT_REMOVED', peerDescriptor, activeContacts)
        )
        this.openInternetPeers.on('NEW_CONTACT', (peerDescriptor: PeerDescriptor, activeContacts: PeerDescriptor[]) =>
            this.emit('NEW_OPEN_INTERNET_CONTACT', peerDescriptor, activeContacts)
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
        if (!this.started || this.stopped || this.routerDuplicateDetector.isMostLikelyDuplicate(routedMessage.nonce)) {
            return
        }
        logger.trace(`Processing received routeMessage ${routedMessage.nonce}`)
        this.addNewContact(routedMessage.sourcePeer!, true)
        this.routerDuplicateDetector.add(routedMessage.nonce)
        const message = Message.fromBinary(routedMessage.message)
        if (this.ownPeerId!.equals(PeerID.fromValue(routedMessage.destinationPeer!.peerId))) {
            logger.trace(`RouteMessage ${routedMessage.nonce} successfully arrived to destination`)
            this.emit('DATA', message, routedMessage.sourcePeer!)
        } else {
            await this.doRouteMessage({
                message: routedMessage.message,
                previousPeer: routedMessage.previousPeer as PeerDescriptor,
                destinationPeer: routedMessage.destinationPeer as PeerDescriptor,
                sourcePeer: routedMessage.sourcePeer as PeerDescriptor,
                serviceId: message.serviceId,
                messageId: routedMessage.nonce
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
            logger.warn(`Failed to send (routeMessage) to ${targetPeerDescriptor.peerId.toString()}: ${err}`)
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
        const closest = this.bucket!.closest(params.destinationPeer.peerId, this.config.parallelism).filter((peer: DhtPeer) =>
            this.routeCheck(peer.getPeerDescriptor(), params.sourcePeer, params.previousPeer)
        )
        const initialLength = closest.length
        while (successAcks < this.config.parallelism && successAcks < initialLength && closest.length > 0) {
            if (this.stopped) {
                break
            }
            const next = closest.shift()
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
        // Only throw if originator
        if (successAcks === 0 && this.ownPeerId!.equals(PeerID.fromValue(params.sourcePeer!.peerId))) {
            throw new Err.CouldNotRoute(
                `Routing message to peer: ${PeerID.fromValue(params.destinationPeer!.peerId).toMapKey()}`
                + ` from ${this.ownPeerId!.toMapKey()} failed.`
            )
        }
    }

    public canRoute(routedMessage: RouteMessageWrapper): boolean {
        if (!this.started || this.stopped) {
            return false
        }
        if (this.ownPeerId!.equals(PeerID.fromValue(routedMessage.destinationPeer!.peerId))) {
            return true
        }
        if (this.routerDuplicateDetector.isMostLikelyDuplicate(routedMessage.nonce)) {
            logger.trace(`Message ${routedMessage.nonce} is not routable due to being a duplicate`)
            return false
        }
        const closestPeers = this.bucket!.closest(routedMessage.destinationPeer!.peerId, this.config.parallelism)
        const notRoutableCount = this.notRoutableCount(closestPeers, routedMessage.sourcePeer!, routedMessage.previousPeer)
        return (closestPeers.length - notRoutableCount) > 0
    }

    private notRoutableCount(peers: DhtPeer[], sourcePeer: PeerDescriptor, previousPeer?: PeerDescriptor): number {
        return peers.reduce((acc: number, curr: DhtPeer) => {
            if (!this.routeCheck(curr.getPeerDescriptor(), sourcePeer, previousPeer)) {
                return acc + 1
            }
            return acc
        }, 0)
    }

    private routeCheck(
        peerToRoute: PeerDescriptor,
        originatorPeer: PeerDescriptor,
        previousPeer?: PeerDescriptor
    ): boolean {
        const peerIdToRoute = PeerID.fromValue(peerToRoute.peerId)
        const originatorPeerId = PeerID.fromValue(originatorPeer.peerId)

        const previousPeerCheck = previousPeer ? !PeerID.fromValue(previousPeer.peerId).equals(peerIdToRoute) : true
        return !peerIdToRoute.equals(this.ownPeerId!)
            && !peerIdToRoute.equals(originatorPeerId)
            && previousPeerCheck
    }

    private async getClosestPeersFromContact(contact: DhtPeer): Promise<PeerDescriptor[]> {
        if (!this.started || this.stopped) {
            return []
        }
        logger.trace(`Getting closest peers from contact: ${contact.peerId.toMapKey()}`)
        this.outgoingClosestPeersRequestsCounter++
        this.neighborList!.setContacted(contact.peerId)
        const returnedContacts = await contact.getClosestPeers(this.ownPeerDescriptor!)
        this.neighborList!.setActive(contact.peerId)
        return returnedContacts
    }

    private onClosestPeersRequestSucceeded(peerId: PeerID, contacts: PeerDescriptor[]) {
        if (this.ongoingClosestPeersRequests.has(peerId.toMapKey())) {
            this.ongoingClosestPeersRequests.delete(peerId.toMapKey())
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
                this.emit('JOIN_COMPLETED')
                this.ongoingJoinOperation = false
            } else {
                this.findMoreContacts()
            }
        }
    }

    private onClosestPeersRequestFailed(peerId: PeerID, exception: Error) {
        if (this.ongoingClosestPeersRequests.has(peerId.toMapKey())) {
            this.ongoingClosestPeersRequests.delete(peerId.toMapKey())
            logger.debug('onClosestPeersRequestFailed: ' + exception)
            this.neighborList!.removeContact(peerId)
            this.findMoreContacts()
        }
    }

    isJoinCompleted(): boolean {
        return (this.neighborList!.getUncontactedContacts(this.config.parallelism).length < 1
            || this.noProgressCounter >= this.config.joinNoProgressLimit)
    }

    joinDht(entryPointDescriptor: PeerDescriptor): Promise<void> {
        if (!this.started || this.stopped || this.ongoingJoinOperation) {
            return new Promise((resolve, _reject) => resolve())
        }

        this.ongoingJoinOperation = true
        this.noProgressCounter = 0

        logger.info(`Joining The Streamr Network via entrypoint ${entryPointDescriptor.peerId.toString()}`)
        const entryPoint = new DhtPeer(entryPointDescriptor, toProtoRpcClient(new DhtRpcServiceClient(this.rpcCommunicator!.getRpcClientTransport())))

        if (this.ownPeerId!.equals(entryPoint.peerId)) {
            return new Promise((resolve, _reject) => resolve())
        }

        this.addNewContact(entryPointDescriptor)
        const closest = this.bucket!.closest(this.ownPeerId!.value, this.config.parallelism)
        this.neighborList!.addContacts(closest)

        this.findMoreContacts()
        return new Promise((resolve, reject) => {
            const resolveFn = () => {
                if (this.joinTimeoutRef) {
                    clearTimeout(this.joinTimeoutRef)
                }
                resolve()
            }
            this.joinTimeoutRef = setTimeout(() => {
                this.off('JOIN_COMPLETED', resolveFn)
                reject('join timed out')
            }, 60000)

            this.once('JOIN_COMPLETED', resolveFn)
        })
    }

    private findMoreContacts(): void {
        if (this.ongoingJoinOperation) {
            const uncontacted = this.neighborList!.getUncontactedContacts(this.config.parallelism)
            while (this.ongoingClosestPeersRequests.size < this.config.parallelism && uncontacted.length > 0) {
                const nextPeer = uncontacted.shift()
                this.ongoingClosestPeersRequests.add(nextPeer!.peerId.toMapKey())
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

    private bindDefaultServerMethods() {
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

    private getClosestActiveContactNotInBucket(): DhtPeer | null {
        for (const contactId of this.neighborList!.getContactIds()) {
            if (!this.bucket!.get(contactId.value) && this.neighborList!.isActive(contactId)) {
                return this.neighborList!.getContact(contactId).contact
            }
        }
        return null
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
        this.rpcCommunicator?.stop()
        this.bucket!.removeAllListeners()
        this.removeAllListeners()
        await this.cleanUpHandleForConnectionManager?.stop()
    }

    // IDHTRpc implementation

    async getClosestPeers(request: ClosestPeersRequest, _context: ServerCallContext): Promise<ClosestPeersResponse> {
        const peerDescriptor = jsFormatPeerDescriptor(request.peerDescriptor!)
        const closestPeers = this.onGetClosestPeers(peerDescriptor)
        const peerDescriptors = closestPeers.map((dhtPeer: DhtPeer) => dhtPeer.getPeerDescriptor())
        const response = {
            peers: peerDescriptors,
            nonce: request.nonce
        }
        return response
    }

    async ping(request: PingRequest, _context: ServerCallContext): Promise<PingResponse> {
        const response: PingResponse = {
            nonce: request.nonce
        }
        return response
    }

    async routeMessage(routed: RouteMessageWrapper, _context: ServerCallContext): Promise<RouteMessageAck> {
        const converted = {
            ...routed,
            destinationPeer: jsFormatPeerDescriptor(routed.destinationPeer!),
            sourcePeer: jsFormatPeerDescriptor(routed.sourcePeer!)
        }
        const routable = this.canRoute(converted)

        const response: RouteMessageAck = {
            nonce: routed.nonce,
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
