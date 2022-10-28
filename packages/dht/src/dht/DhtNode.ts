/* eslint-disable class-methods-use-this */

import { DhtPeer } from './DhtPeer'
import KBucket from 'k-bucket'
import { EventEmitter } from 'eventemitter3'
import { SortedContactList } from './contact/SortedContactList'
import { RoutingRpcCommunicator } from '../transport/RoutingRpcCommunicator'
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { PeerID, PeerIDKey } from '../helpers/PeerID'
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
import { runAndRaceEvents3, waitForEvent3 } from '../helpers/waitForEvent3'
import { RoutingSession, RoutingSessionEvents } from './RoutingSession'
import { RandomContactList } from './contact/RandomContactList'

export interface DhtNodeEvents {
    newContact: (peerDescriptor: PeerDescriptor, closestPeers: PeerDescriptor[]) => void
    contactRemoved: (peerDescriptor: PeerDescriptor, closestPeers: PeerDescriptor[]) => void
    joinCompleted: () => void
    newKbucketContact: (peerDescriptor: PeerDescriptor, closestPeers: PeerDescriptor[]) => void
    kbucketContactRemoved: (peerDescriptor: PeerDescriptor) => void
    newOpenInternetContact: (peerDescriptor: PeerDescriptor, closestPeers: PeerDescriptor[]) => void
    openInternetContactRemoved: (peerDescriptor: PeerDescriptor, closestPeers: PeerDescriptor[]) => void
    newRandomContact: (peerDescriptor: PeerDescriptor, closestPeers: PeerDescriptor[]) => void
    randomContactRemoved: (peerDescriptor: PeerDescriptor, closestPeers: PeerDescriptor[]) => void
    forwardedMessage: () => void
}

export class DhtNodeConfig {
    transportLayer?: ITransport
    peerDescriptor?: PeerDescriptor
    entryPoints?: PeerDescriptor[]
    webSocketHost?: string
    webSocketPort?: number
    peerIdString?: string
    nodeName?: string
    rpcRequestTimeout?: number

    serviceId = 'layer0'
    parallelism = 3
    maxNeighborListSize = 100
    numberOfNodesPerKBucket = 4
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

interface ForwardingTableEntry {
    timeout: NodeJS.Timeout
    peerDescriptors: PeerDescriptor[]
}

export class DhtNode extends EventEmitter<Events> implements ITransport, IDhtRpcService {
    private readonly config: DhtNodeConfig
    private readonly routerDuplicateDetector: DuplicateDetector = new DuplicateDetector()
    private readonly ongoingClosestPeersRequests: Set<string> = new Set()
    private readonly forwardingTable: Map<string, ForwardingTableEntry> = new Map()

    // noProgressCounter is Increased on every getClosestPeers round in which no new nodes 
    // with an id closer to target id were found.
    // When joinNoProgressLimit is reached, the join process will terminate. If a closer node is found
    // before reaching joinNoProgressLimit, this counter gets reset to 0.

    private noProgressCounter = 0
    private joinTimeoutRef?: NodeJS.Timeout
    private ongoingJoinOperation = false

    private bucket?: KBucket<DhtPeer>
    private connections: Map<PeerIDKey, DhtPeer> = new Map()
    private neighborList?: SortedContactList<DhtPeer>
    private openInternetPeers?: SortedContactList<DhtPeer>
    private randomPeers?: RandomContactList<DhtPeer>
    private rpcCommunicator?: RoutingRpcCommunicator
    private transportLayer?: ITransport
    private ownPeerDescriptor?: PeerDescriptor

    private outgoingClosestPeersRequestsCounter = 0

    private connectionManager?: ConnectionManager
    private started = false
    private stopped = false

    private ongoingRoutingSessions: Map<string, RoutingSession> = new Map()

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
            if (this.config.transportLayer instanceof ConnectionManager) {
                this.connectionManager = this.config.transportLayer
            }
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
            this.connectionManager = connectionManager
            this.transportLayer = connectionManager
        }

        this.rpcCommunicator = new RoutingRpcCommunicator(
            this.config.serviceId,
            this.transportLayer.send,
            { rpcRequestTimeout: this.config.rpcRequestTimeout }
        )

        this.transportLayer.on('message', (message: Message) => {
            this.handleMessage(message)
        })

        this.bindDefaultServerMethods()
        this.initKBuckets(this.ownPeerId!)
    }

    public handleMessage(message: Message): void {
        if (message.serviceId === this.config.serviceId) {
            this.rpcCommunicator?.handleMessageFromPeer(message)
        } else {
            this.emit('message', message)
        }
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

    private initKBuckets(selfId: PeerID): void {
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
            this.connectionManager?.unlockConnection(contact.getPeerDescriptor(), this.config.serviceId)
            logger.trace(`Removed contact ${contact.peerId.value.toString()}`)
            this.emit(
                'kbucketContactRemoved',
                contact.getPeerDescriptor()
            )
        })
        this.bucket.on('added', async (contact: DhtPeer) => {
            if (!this.stopped && !contact.peerId.equals(this.ownPeerId!)) {
                if (await contact.ping(this.ownPeerDescriptor!)) {
                    this.connectionManager?.lockConnection(contact.getPeerDescriptor(), this.config.serviceId)
                    logger.trace(`Added new contact ${contact.peerId.value.toString()}`)
                    this.emit(
                        'newKbucketContact',
                        contact.getPeerDescriptor(),
                        this.neighborList!.getClosestContacts(20).map((peer) => peer.getPeerDescriptor())
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
        this.neighborList.on('contactRemoved', (peerDescriptor: PeerDescriptor, activeContacts: PeerDescriptor[]) => {
            this.emit('contactRemoved', peerDescriptor, activeContacts)
            this.randomPeers!.addContact(
                new DhtPeer(peerDescriptor, toProtoRpcClient(new DhtRpcServiceClient(this.rpcCommunicator!.getRpcClientTransport())))
            )
        })
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

        this.transportLayer!.on('connected', (peerDescriptor: PeerDescriptor) => {
            const dhtPeer = new DhtPeer(peerDescriptor, toProtoRpcClient(new DhtRpcServiceClient(this.rpcCommunicator!.getRpcClientTransport())))
            if (!this.connections.has(PeerID.fromValue(dhtPeer.id).toKey())) {
                this.connections.set(PeerID.fromValue(dhtPeer.id).toKey(), dhtPeer)
            }
            //console.info('connected, ' +PeerID.fromValue(dhtPeer.id).toKey() +', '+ dhtPeer.id)
            this.emit('connected', peerDescriptor)
        })

        this.transportLayer!.on('disconnected', (peerDescriptor: PeerDescriptor) => {
            this.connections.delete(PeerID.fromValue(peerDescriptor.peerId).toKey())
            this.bucket!.remove(peerDescriptor.peerId)
            this.connectionManager?.unlockConnection(peerDescriptor, this.config.serviceId)
            this.emit('disconnected', peerDescriptor)
        })
        this.randomPeers = new RandomContactList(selfId, this.config.maxNeighborListSize)
        this.randomPeers.on('contactRemoved', (peerDescriptor: PeerDescriptor, activeContacts: PeerDescriptor[]) =>
            this.emit('randomContactRemoved', peerDescriptor, activeContacts)
        )
        this.randomPeers.on('newContact', (peerDescriptor: PeerDescriptor, activeContacts: PeerDescriptor[]) =>
            this.emit('newRandomContact', peerDescriptor, activeContacts)
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

    public send = (msg: Message): void => {
        if (!this.started || this.stopped) {
            return
        }
        const targetPeerDescriptor = msg.targetDescriptor!

        const params: RouteMessageWrapper = {
            message: Message.toBinary(msg),
            requestId: v4(),
            destinationPeer: targetPeerDescriptor,
            sourcePeer: this.ownPeerDescriptor!,
            reachableThrough: this.ongoingJoinOperation ? this.config.entryPoints || [] : []
        }

        const forwardingEntry = this.forwardingTable.get(PeerID.fromValue(targetPeerDescriptor.peerId).toKey())
        if (
            forwardingEntry
            && forwardingEntry.peerDescriptors.length > 0
            // && PeerID.fromValue(forwardingEntry.peerDescriptors[0].peerId).equals(PeerID.fromValue(targetPeerDescriptor.peerId))
        ) {
            const forwardingPeer = forwardingEntry.peerDescriptors[0]
            const forwardedMessage: RouteMessageWrapper = {
                message: RouteMessageWrapper.toBinary(params),
                requestId: v4(),
                destinationPeer: forwardingPeer,
                sourcePeer: this.ownPeerDescriptor!,
                reachableThrough: []
            }
            this.doRouteMessage(forwardedMessage, true).catch((err) => {
                logger.warn(
                    `Failed to send (forwardMessage: ${this.config.serviceId}) to ${PeerID.fromValue(targetPeerDescriptor.peerId).toKey()}: ${err}`
                )
            })
        } else {
            this.doRouteMessage(params).catch((err) => {
                logger.warn(
                    `Failed to send (routeMessage: ${this.config.serviceId}) to ${PeerID.fromValue(targetPeerDescriptor.peerId).toKey()}: ${err}`
                )
            })
        }
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

        logger.info(
            `Joining ${this.config.serviceId === 'layer0' ? 'The Streamr Network' : `Control Layer for ${this.config.serviceId}`}`
            + ` via entrypoint ${entryPointDescriptor.peerId.toString()}`
        )
        const entryPoint = new DhtPeer(entryPointDescriptor, toProtoRpcClient(new DhtRpcServiceClient(this.rpcCommunicator!.getRpcClientTransport())))

        if (this.ownPeerId!.equals(entryPoint.peerId)) {
            return
        }

        if (this.connectionManager) {
            this.connectionManager.lockConnection(entryPointDescriptor, `${this.config.serviceId}::joinDht`)
        }

        this.addNewContact(entryPointDescriptor)
        const closest = this.bucket!.closest(this.ownPeerId!.value, this.config.parallelism)
        this.neighborList!.addContacts(closest)

        this.findMoreContacts()
        try {
            await waitForEvent3<Events>(this, 'joinCompleted', this.config.dhtJoinTimeout)
            // console.log(this.config.serviceId, this.ownPeerId!.toKey(), this.neighborList!.getSize(), this.bucket!.count())
        } catch (_e) {
            throw (new Err.DhtJoinTimeout('join timed out'))
        } finally {
            if (this.connectionManager) {
                this.connectionManager.unlockConnection(entryPointDescriptor, `${this.config.serviceId}::joinDht`)
            }
        }
    }

    private findMoreContacts(): void {
        if (this.ongoingJoinOperation) {
            const uncontacted = this.neighborList!.getUncontactedContacts(this.config.parallelism)
            while (this.ongoingClosestPeersRequests.size < this.config.parallelism && uncontacted.length > 0) {
                const nextPeer = uncontacted.shift()
                this.ongoingClosestPeersRequests.add(nextPeer!.peerId.toKey())
                // eslint-disable-next-line promise/catch-or-return
                this.getClosestPeersFromContact(nextPeer!)
                    .then((contacts) => this.onClosestPeersRequestSucceeded(nextPeer!.peerId, contacts))
                    .catch((err) => this.onClosestPeersRequestFailed(nextPeer!.peerId, err))
                    .finally(() => {
                        this.outgoingClosestPeersRequestsCounter--
                        if (this.outgoingClosestPeersRequestsCounter === 0 && this.ongoingJoinOperation) {
                            if (this.isJoinCompleted()) {
                                this.emit('joinCompleted')
                                this.ongoingJoinOperation = false
                            } else {
                                this.findMoreContacts()
                            }
                        }
                    })
            }
        }
    }

    public getBucketSize(): number {
        return this.bucket!.count()
    }

    private addNewContact(contact: PeerDescriptor, setActive = false): void {
        if (!this.started || this.stopped) {
            return
        }

        const peerId = PeerID.fromValue(contact.peerId)
        if (!peerId.equals(this.ownPeerId!)) {
            logger.trace(`Adding new contact ${contact.peerId.toString()}`)
            const dhtPeer = new DhtPeer(contact, toProtoRpcClient(new DhtRpcServiceClient(this.rpcCommunicator!.getRpcClientTransport())))
            if (!this.bucket!.get(contact.peerId) && !this.neighborList!.getContact(PeerID.fromValue(contact.peerId))) {
                this.neighborList!.addContact(dhtPeer)
                if (contact.openInternet) {
                    this.openInternetPeers!.addContact(dhtPeer)
                }
                if (setActive) {
                    this.neighborList!.setActive(peerId)
                    this.openInternetPeers!.setActive(peerId)
                }
                this.bucket!.add(dhtPeer)
            } else {
                this.randomPeers!.addContact(dhtPeer)
            }
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
        this.forwardMessage = this.forwardMessage.bind(this)

        this.rpcCommunicator!.registerRpcMethod(ClosestPeersRequest, ClosestPeersResponse, 'getClosestPeers', this.getClosestPeers)
        this.rpcCommunicator!.registerRpcMethod(PingRequest, PingResponse, 'ping', this.ping)
        this.rpcCommunicator!.registerRpcMethod(RouteMessageWrapper, RouteMessageAck, 'routeMessage', this.routeMessage)
        this.rpcCommunicator!.registerRpcMethod(RouteMessageWrapper, RouteMessageAck, 'forwardMessage', this.forwardMessage)
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

    public isJoinOngoing(): boolean {
        return this.ongoingJoinOperation
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
        this.forwardingTable.forEach((entry) => {
            clearTimeout(entry.timeout)
        })
        this.forwardingTable.clear()
        this.removeAllListeners()
        if (this.connectionManager && !this.config.transportLayer) {
            await this.connectionManager.stop()
        }
    }

    // IDHTRpcService implementation

    public async getClosestPeers(request: ClosestPeersRequest, _context: ServerCallContext): Promise<ClosestPeersResponse> {
        if (this.config.serviceId === 'layer1::webrtc-network' && this.ownPeerId!.toKey() === '656e747279706f696e74') {
            // logger.info(PeerID.fromValue(request.peerDescriptor!.peerId).toKey() + ", " +  this.ownPeerId!.toKey())
        }
        const closestPeers = this.onGetClosestPeers(request.peerDescriptor!)
        const peerDescriptors = closestPeers.map((dhtPeer: DhtPeer) => dhtPeer.getPeerDescriptor())
        const response = {
            peers: peerDescriptors,
            requestId: request.requestId
        }
        return response
    }

    // eslint-disable-next-line class-methods-use-this
    public async ping(request: PingRequest, _context: ServerCallContext): Promise<PingResponse> {
        const response: PingResponse = {
            requestId: request.requestId
        }
        return response
    }

    private createRouteMessageAck(routedMessage: RouteMessageWrapper, error?: string): RouteMessageAck {
        const ack: RouteMessageAck = {
            requestId: routedMessage.requestId,
            destinationPeer: routedMessage.sourcePeer,
            sourcePeer: routedMessage.destinationPeer,
            error: error ? error : ''
        }
        return ack
    }

    public async doRouteMessage(routedMessage: RouteMessageWrapper, forwarding = false): Promise<RouteMessageAck> {
        logger.trace(`Peer ${this.ownPeerId?.value} routing message ${routedMessage.requestId} 
            from ${routedMessage.sourcePeer?.peerId} to ${routedMessage.destinationPeer?.peerId}`)

        const session = new RoutingSession(
            this.ownPeerDescriptor!,
            routedMessage,
            this.connections,
            this.ownPeerId!.equals(PeerID.fromValue(routedMessage.sourcePeer!.peerId)) ? 2 : 1,
            1000,
            forwarding
        )

        const result = await runAndRaceEvents3<RoutingSessionEvents>([() => {
            session.start()
        }], session, ['noCandidatesFound', 'candidatesFound'], 1000)

        if (result.winnerName === 'noCandidatesFound' || result.winnerName === 'routingFailed') {
            if (PeerID.fromValue(routedMessage.sourcePeer!.peerId).equals(this.ownPeerId!)) {
                throw new Error(`Could not perform initial routing`)
            }
            return this.createRouteMessageAck(routedMessage, 'No routing candidates found')
        } else {
            return this.createRouteMessageAck(routedMessage)
        }
    }

    public async routeMessage(routedMessage: RouteMessageWrapper, _context: ServerCallContext): Promise<RouteMessageAck> {
        if (!this.started || this.stopped) {
            return this.createRouteMessageAck(routedMessage, 'routeMessage() service is not running')
        } else if (this.routerDuplicateDetector.isMostLikelyDuplicate(routedMessage.requestId)) {
            logger.trace(`Peer ${this.ownPeerId?.value} routing message ${routedMessage.requestId} 
                from ${routedMessage.sourcePeer?.peerId} to ${routedMessage.destinationPeer?.peerId} is likely a duplicate`)
            return this.createRouteMessageAck(routedMessage, 'message given to routeMessage() service is likely a duplicate')
        }

        logger.trace(`Processing received routeMessage ${routedMessage.requestId}`)
        this.addNewContact(routedMessage.sourcePeer!, true)
        this.routerDuplicateDetector.add(routedMessage.requestId)

        if (this.ownPeerId!.equals(PeerID.fromValue(routedMessage.destinationPeer!.peerId))) {
            logger.trace(`Peer ${this.ownPeerId?.value} routing found message targeted to self ${routedMessage.requestId}`)
            if (routedMessage.reachableThrough.length > 0) {
                const sourceKey = PeerID.fromValue(routedMessage.sourcePeer!.peerId).toKey()
                if (this.forwardingTable.has(sourceKey)) {
                    const oldEntry = this.forwardingTable.get(sourceKey)
                    clearTimeout(oldEntry!.timeout)
                    this.forwardingTable.delete(sourceKey)
                }
                const forwardingEntry: ForwardingTableEntry = {
                    peerDescriptors: routedMessage.reachableThrough,
                    timeout: setTimeout(() => {
                        this.forwardingTable.delete(sourceKey)
                    }, 10000)
                }
                this.forwardingTable.set(sourceKey, forwardingEntry)
            }
            if (this.connectionManager) {
                this.connectionManager.onData(routedMessage.message, routedMessage.sourcePeer!)
            }
            return this.createRouteMessageAck(routedMessage)
        } else {
            return this.doRouteMessage(routedMessage)
        }
    }

    public async forwardMessage(routedMessage: RouteMessageWrapper, _context: ServerCallContext): Promise<RouteMessageAck> {
        if (!this.started || this.stopped) {
            return this.createRouteMessageAck(routedMessage, 'forwardMessage() service is not running')
        } else if (this.routerDuplicateDetector.isMostLikelyDuplicate(routedMessage.requestId)) {
            logger.trace(`Peer ${this.ownPeerId?.value} forwarding message ${routedMessage.requestId} 
        from ${routedMessage.sourcePeer?.peerId} to ${routedMessage.destinationPeer?.peerId} is likely a duplicate`)
            return this.createRouteMessageAck(routedMessage, 'message given to forwardMessage() service is likely a duplicate')
        }

        logger.trace(`Processing received forward routeMessage ${routedMessage.requestId}`)
        this.addNewContact(routedMessage.sourcePeer!, true)
        this.routerDuplicateDetector.add(routedMessage.requestId)

        if (this.ownPeerId!.equals(PeerID.fromValue(routedMessage.destinationPeer!.peerId))) {
            logger.trace(`Peer ${this.ownPeerId?.value} forwarding found message targeted to self ${routedMessage.requestId}`)
            try {
                const forwardedMessage = RouteMessageWrapper.fromBinary(routedMessage.message)
                if (this.ownPeerId!.equals(PeerID.fromValue(forwardedMessage.destinationPeer!.peerId))) {
                    if (this.connectionManager) {
                        this.connectionManager.onData(forwardedMessage.message, forwardedMessage.sourcePeer!)
                    }
                    return this.createRouteMessageAck(routedMessage)
                }

                // eslint-disable-next-line promise/catch-or-return
                this.doRouteMessage(forwardedMessage)
                    .catch((err) => {
                        logger.warn(
                            `Failed to send (forwardMessage: ${this.config.serviceId}) to`
                            + ` ${PeerID.fromValue(forwardedMessage.destinationPeer!.peerId).toKey()}: ${err}`
                        )
                    })
                    .then(() => this.emit('forwardedMessage'))
                return this.createRouteMessageAck(routedMessage)
            } catch (err) {
                logger.trace(`Could not forward message`)
                return this.createRouteMessageAck(routedMessage, `could not route forwarded message ${routedMessage.requestId}`)
            }
        } else {
            return this.doRouteMessage(routedMessage, true)
        }
    }
}
