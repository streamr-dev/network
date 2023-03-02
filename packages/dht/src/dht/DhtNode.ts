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
    ConnectivityResponse,
    DataEntry,
    FindMode,
    LeaveNotice,
    Message,
    NodeType,
    PeerDescriptor,
    PingRequest,
    PingResponse
} from '../proto/packages/dht/protos/DhtRpc'
import * as Err from '../helpers/errors'
import { ITransport, TransportEvents } from '../transport/ITransport'
import { ConnectionManager, ConnectionManagerConfig } from '../connection/ConnectionManager'
import { DhtRpcServiceClient } from '../proto/packages/dht/protos/DhtRpc.client'
import {
    Logger,
    MetricsContext
} from '@streamr/utils'
import { toProtoRpcClient } from '@streamr/proto-rpc'
import { RandomContactList } from './contact/RandomContactList'
import { Empty } from '../proto/google/protobuf/empty'
import { DhtCallContext } from '../rpc-protocol/DhtCallContext'
import { Any } from '../proto/google/protobuf/any'
import { keyFromPeerDescriptor, peerIdFromPeerDescriptor } from '../helpers/peerIdFromPeerDescriptor'
import { Router } from './Router'
import { RecursiveFinder } from './RecursiveFinder'
import { DataStore } from './store/DataStore'
import { PeerDiscovery } from './PeerDiscovery'
import { LocalDataStore } from './store/LocalDataStore'

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
    stunUrls?: string[]

    serviceId = 'layer0'
    parallelism = 3
    maxNeighborListSize = 200
    numberOfNodesPerKBucket = 8
    joinNoProgressLimit = 4
    routeMessageTimeout = 2000
    dhtJoinTimeout = 60000
    getClosestContactsLimit = 5
    maxConnections = 80
    storeHighestTtl = 10000
    storeMaxTtl = 10000
    storeNumberOfCopies = 5
    metricsContext = new MetricsContext()

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

export interface RecursiveFindResult { closestNodes: Array<PeerDescriptor>, dataEntries?: Array<DataEntry> }

export class DhtNode extends EventEmitter<Events> implements ITransport {
    private readonly config: DhtNodeConfig

    private bucket?: KBucket<DhtPeer>
    private connections: Map<PeerIDKey, DhtPeer> = new Map()
    private neighborList?: SortedContactList<DhtPeer>
    private openInternetPeers?: SortedContactList<DhtPeer>
    private randomPeers?: RandomContactList<DhtPeer>
    private rpcCommunicator?: RoutingRpcCommunicator
    private transportLayer?: ITransport
    private ownPeerDescriptor?: PeerDescriptor
    public router?: Router
    public dataStore?: DataStore
    private localDataStore = new LocalDataStore()
    private recursiveFinder?: RecursiveFinder
    private peerDiscovery?: PeerDiscovery

    public connectionManager?: ConnectionManager
    private started = false
    private stopped = false

    public contactAddCounter = 0
    public contactOnAddedCounter = 0

    constructor(conf: Partial<DhtNodeConfig>) {
        super()
        this.config = new DhtNodeConfig(conf)

        this.send = this.send.bind(this)
        this.onKBucketAdded = this.onKBucketAdded.bind(this)
        this.onKBucketPing = this.onKBucketPing.bind(this)
        this.onKBucketRemoved = this.onKBucketRemoved.bind(this)
    }

    public async start(): Promise<void> {
        if (this.started || this.stopped) {
            return
        }
        logger.trace(`Starting new Streamr Network DHT Node with serviceId ${this.config.serviceId}`)
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
                entryPoints: this.config.entryPoints,
                stunUrls: this.config.stunUrls,
                metricsContext: this.config.metricsContext,
                nodeName: this.getNodeName(),
                maxConnections: this.config.maxConnections
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
        this.peerDiscovery = new PeerDiscovery({
            rpcCommunicator: this.rpcCommunicator!,
            ownPeerDescriptor: this.ownPeerDescriptor!,
            ownPeerId: this.ownPeerId!,
            bucket: this.bucket!,
            connections: this.connections!,
            neighborList: this.neighborList!,
            randomPeers: this.randomPeers!,
            openInternetPeers: this.openInternetPeers!,
            joinNoProgressLimit: this.config.joinNoProgressLimit,
            getClosestContactsLimit: this.config.getClosestContactsLimit,
            joinTimeout: this.config.dhtJoinTimeout,
            serviceId: this.config.serviceId,
            parallelism: this.config.parallelism,
            addContact: this.addNewContact.bind(this),
            connectionManager: this.connectionManager
        })
        this.router = new Router({
            rpcCommunicator: this.rpcCommunicator!,
            connections: this.connections,
            ownPeerDescriptor: this.ownPeerDescriptor!,
            ownPeerId: this.ownPeerId!,
            routeMessageTimeout: this.config.routeMessageTimeout,
            addContact: this.addNewContact.bind(this),
            serviceId: this.config.serviceId,
            connectionManager: this.connectionManager
        })
        this.recursiveFinder = new RecursiveFinder({
            rpcCommunicator: this.rpcCommunicator!,
            router: this.router!,
            sessionTransport: this,
            connections: this.connections,
            ownPeerDescriptor: this.ownPeerDescriptor!,
            serviceId: this.config.serviceId,
            ownPeerId: this.ownPeerId!,
            addContact: this.addNewContact.bind(this),
            isPeerCloserToIdThanSelf: this.isPeerCloserToIdThanSelf.bind(this),
            getClosestPeerDescriptors: this.getClosestPeerDescriptors.bind(this),
            localDataStore: this.localDataStore
        })
        this.dataStore = new DataStore({
            rpcCommunicator: this.rpcCommunicator!,
            router: this.router!,
            recursiveFinder: this.recursiveFinder,
            ownPeerDescriptor: this.ownPeerDescriptor!,
            serviceId: this.config.serviceId,
            storeHighestTtl: this.config.storeHighestTtl,
            storeMaxTtl: this.config.storeMaxTtl,
            storeNumberOfCopies: this.config.storeNumberOfCopies,
            localDataStore: this.localDataStore
        })
    }

    private isPeerCloserToIdThanSelf(peer1: PeerDescriptor, compareToId: PeerID): boolean {
        const distance1 = this.bucket!.distance(peer1.kademliaId, compareToId.value)
        const distance2 = this.bucket!.distance(this.ownPeerDescriptor!.kademliaId, compareToId.value)
        return distance1 < distance2
    }

    public handleMessage(message: Message): void {
        if (message.serviceId === this.config.serviceId) {
            logger.trace('callig this.handleMessageFromPeer ' + this.config.nodeName + ', ' +
                message.sourceDescriptor?.nodeName + ' ' + message.serviceId + ' ' + message.messageId)
            this.rpcCommunicator?.handleMessageFromPeer(message)
        } else {
            logger.trace('emit "message" ' + this.config.nodeName + ', ' + message.sourceDescriptor?.nodeName +
                ' ' + message.serviceId + ' ' + message.messageId)
            this.emit('message', message)
        }
    }

    private generatePeerDescriptorCallBack = (connectivityResponse: ConnectivityResponse) => {
        if (this.config.peerDescriptor) {
            this.ownPeerDescriptor = this.config.peerDescriptor
        } else {
            this.ownPeerDescriptor = DhtNode.createPeerDescriptor(connectivityResponse,
                this.config.peerIdString,
                this.config.nodeName)
        }

        return this.ownPeerDescriptor
    }

    private get ownPeerId(): PeerID | undefined {
        if (!this.ownPeerDescriptor) {
            return undefined
        } else {
            return peerIdFromPeerDescriptor(this.ownPeerDescriptor)
        }
    }

    public static createPeerDescriptor = (msg?: ConnectivityResponse,
        peerIdString?: string,
        nodeName?: string): PeerDescriptor => {

        let peerId: Uint8Array

        if (msg) {
            peerId = peerIdString ? PeerID.fromString(peerIdString).value : PeerID.fromIp(msg.ip).value
        } else {
            peerId = PeerID.fromString(peerIdString!).value
        }

        const ret: PeerDescriptor = { kademliaId: peerId, nodeName: nodeName, type: NodeType.NODEJS }

        if (msg && msg.websocket) {
            ret.websocket = { ip: msg.websocket!.ip, port: msg.websocket!.port }
            ret.openInternet = true
        }

        return ret
    }

    private onKBucketPing(oldContacts: DhtPeer[], newContact: DhtPeer): void {

        const sortingList: SortedContactList<DhtPeer> = new SortedContactList(this.ownPeerId!, 100)
        sortingList.addContacts(oldContacts)
        const sortedContacts = sortingList.getAllContacts()

        this.connectionManager?.weakUnlockConnection(sortedContacts[sortedContacts.length - 1].getPeerDescriptor())

        this.bucket?.remove(sortedContacts[sortedContacts.length - 1].peerId.value)

        this.bucket!.add(newContact)
    }

    private onKBucketRemoved(contact: DhtPeer): void {
        this.connectionManager?.weakUnlockConnection(contact.getPeerDescriptor())
        logger.trace(`Removed contact ${contact.peerId.value.toString()}`)
        this.emit(
            'kbucketContactRemoved',
            contact.getPeerDescriptor()
        )
        if (
            this.bucket!.count() === 0
            && !this.peerDiscovery!.isJoinOngoing()
            && this.config.entryPoints
            && this.config.entryPoints.length > 0
        ) {
            setImmediate(async () => {
                await this.peerDiscovery!.rejoinDht(this.config.entryPoints![0])
            })
        }
    }

    private onKBucketAdded(contact: DhtPeer): void {
        this.contactOnAddedCounter++
        if (this.config.nodeName == '1') {
            logger.trace('peer1 contactOnAddCounter: ' + this.contactOnAddedCounter)
        }
        if (!this.stopped && !contact.peerId.equals(this.ownPeerId!)) {

            // Important to lock here, before the ping result is known

            this.connectionManager?.weakLockConnection(contact.getPeerDescriptor())

            // If there already is a connection
            if (this.connections.has(contact.peerId.toKey())) {
                logger.trace(`Added new contact ${contact.peerId.value.toString()}`)
                this.emit(
                    'newKbucketContact',
                    contact.getPeerDescriptor(),
                    this.neighborList!.getClosestContacts(this.config.getClosestContactsLimit).map((peer) => peer.getPeerDescriptor())
                )
            } else {    // open connection by pinging
                logger.trace('starting ping ' + this.config.nodeName + ', ' + contact.getPeerDescriptor().nodeName + ' ')
                contact.ping().then((result) => {
                    if (result) {
                        logger.trace(`Added new contact ${contact.peerId.value.toString()}`)
                        this.emit(
                            'newKbucketContact',
                            contact.getPeerDescriptor(),
                            this.neighborList!.getClosestContacts(this.config.getClosestContactsLimit).map((peer) => peer.getPeerDescriptor())
                        )
                    } else {
                        logger.trace('ping failed ' + this.config.nodeName + ', ' + contact.getPeerDescriptor().nodeName + ' ')
                        this.connectionManager?.weakUnlockConnection(contact.getPeerDescriptor())

                        this.removeContact(contact.getPeerDescriptor())
                        this.addClosestContactToBucket()
                    }
                    return
                }).catch((_e) => {
                    this.connectionManager?.weakUnlockConnection(contact.getPeerDescriptor())
                    this.removeContact(contact.getPeerDescriptor())
                    this.addClosestContactToBucket()
                })
            }
        }
    }

    private initKBuckets = (selfId: PeerID) => {
        this.bucket = new KBucket<DhtPeer>({
            localNodeId: selfId.value,
            numberOfNodesPerKBucket: this.config.numberOfNodesPerKBucket,
            numberOfNodesToPing: this.config.numberOfNodesPerKBucket
        })

        this.bucket.on('ping', this.onKBucketPing)
        this.bucket.on('removed', this.onKBucketRemoved)
        this.bucket.on('added', this.onKBucketAdded)
        this.bucket.on('updated', (_oldContact: DhtPeer, _newContact: DhtPeer) => {
            // TODO: Update contact info to the connection manager and reconnect
        })

        this.neighborList = new SortedContactList(selfId, this.config.maxNeighborListSize)
        this.neighborList.on('contactRemoved', (peerDescriptor: PeerDescriptor, activeContacts: PeerDescriptor[]) => {
            this.emit('contactRemoved', peerDescriptor, activeContacts)
            this.randomPeers!.addContact(
                new DhtPeer(
                    this.ownPeerDescriptor!,
                    peerDescriptor,
                    toProtoRpcClient(new DhtRpcServiceClient(this.rpcCommunicator!.getRpcClientTransport())),
                    this.config.serviceId
                )
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
            const dhtPeer = new DhtPeer(
                this.ownPeerDescriptor!,
                peerDescriptor,
                toProtoRpcClient(new DhtRpcServiceClient(this.rpcCommunicator!.getRpcClientTransport())),
                this.config.serviceId
            )
            if (!this.connections.has(PeerID.fromValue(dhtPeer.id).toKey())) {
                this.connections.set(PeerID.fromValue(dhtPeer.id).toKey(), dhtPeer)
            }
            if (this.ownPeerDescriptor!.nodeName === 'entrypoint') {
                logger.info("connected: " + this.ownPeerDescriptor!.nodeName + ", " + peerDescriptor.nodeName + ' ' + this.connections.size)
            }
            this.emit('connected', peerDescriptor)

        })

        this.transportLayer!.on('disconnected', (peerDescriptor: PeerDescriptor) => {
            logger.trace('disconnected: ' + this.config.nodeName + ', ' + peerDescriptor.nodeName + ' ')
            this.connections.delete(keyFromPeerDescriptor(peerDescriptor))

            // only remove from bucket if we are on layer 0
            if (this.connectionManager) {
                this.bucket!.remove(peerDescriptor.kademliaId)
            }
            this.emit('disconnected', peerDescriptor)
        })

        this.transportLayer!.getAllConnectionPeerDescriptors().map((peer) => {
            const peerId = peerIdFromPeerDescriptor(peer)
            const dhtPeer = new DhtPeer(
                this.ownPeerDescriptor!,
                peer,
                toProtoRpcClient(new DhtRpcServiceClient(this.rpcCommunicator!.getRpcClientTransport())),
                this.config.serviceId
            )
            this.connections.set(peerId.toKey(), dhtPeer)
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

    public async send(msg: Message, _doNotConnect?: boolean): Promise<void> {
        if (!this.started || this.stopped) {
            return
        }
        const reachableThrough = this.peerDiscovery!.isJoinOngoing() ? this.config.entryPoints || [] : []
        await this.router!.send(msg, reachableThrough)
    }

    public async joinDht(entryPointDescriptor: PeerDescriptor, doRandomJoin?: boolean): Promise<void> {
        if (!this.started) {
            throw new Error('Cannot join DHT before calling start() on DhtNode')
        }
        await this.peerDiscovery!.joinDht(entryPointDescriptor, doRandomJoin)
    }

    public getBucketSize(): number {
        return this.bucket!.count()
    }

    private addNewContact(contact: PeerDescriptor, setActive = false): void {
        if (!this.started || this.stopped) {
            return
        }

        const peerId = peerIdFromPeerDescriptor(contact)
        if (!peerId.equals(this.ownPeerId!)) {
            logger.trace(`Adding new contact ${contact.kademliaId.toString()}`)
            const dhtPeer = new DhtPeer(
                this.ownPeerDescriptor!,
                contact,
                toProtoRpcClient(new DhtRpcServiceClient(this.rpcCommunicator!.getRpcClientTransport())),
                this.config.serviceId
            )
            if (!this.bucket!.get(contact.kademliaId) && !this.neighborList!.getContact(peerIdFromPeerDescriptor(contact))) {
                this.neighborList!.addContact(dhtPeer)
                if (contact.openInternet) {
                    this.openInternetPeers!.addContact(dhtPeer)
                }
                if (setActive) {
                    this.neighborList!.setActive(peerId)
                    this.openInternetPeers!.setActive(peerId)
                }
                this.contactAddCounter++
                this.bucket!.add(dhtPeer)
            } else {
                this.randomPeers!.addContact(dhtPeer)
            }
        }
    }

    public removeContact(contact: PeerDescriptor, removeFromOpenInternetPeers = false): void {
        if (!this.started || this.stopped) {
            return
        }
        logger.trace(`Removing contact ${contact.kademliaId.toString()}`)
        const peerId = peerIdFromPeerDescriptor(contact)

        this.bucket!.remove(peerId.value)
        this.neighborList!.removeContact(peerId)
        this.randomPeers!.removeContact(peerId)

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
        this.leaveNotice = this.leaveNotice.bind(this)

        this.rpcCommunicator!.registerRpcMethod(ClosestPeersRequest, ClosestPeersResponse, 'getClosestPeers', this.getClosestPeers)
        this.rpcCommunicator!.registerRpcMethod(PingRequest, PingResponse, 'ping', this.ping)
        this.rpcCommunicator!.registerRpcNotification(LeaveNotice, 'leaveNotice', this.leaveNotice)
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

    public getAllConnectionPeerDescriptors(): PeerDescriptor[] {
        return Array.from(this.connections.values()).map((peer) => peer.getPeerDescriptor())
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

    public getNumberOfConnections(): number {
        return this.connections.size
    }

    public getNumberOfLocalLockedConnections(): number {
        return this.connectionManager!.getNumberOfLocalLockedConnections()
    }

    public getNumberOfRemoteLockedConnections(): number {
        return this.connectionManager!.getNumberOfRemoteLockedConnections()
    }

    public getNumberOfWeakLockedConnections(): number {
        return this.connectionManager!.getNumberOfWeakLockedConnections()
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
        logger.trace('stop()')
        if (!this.started) {
            throw new Err.CouldNotStop('Cannot not stop() before start()')
        }
        this.stopped = true

        this.bucket!.removeAllListeners()
        this.rpcCommunicator!.stop()
        this.router!.stop()
        this.recursiveFinder!.stop()
        this.peerDiscovery!.stop()
        if (this.connectionManager) {
            await this.connectionManager.stop()
        }
    }

    private getClosestPeerDescriptors(kademliaId: Uint8Array, limit: number): PeerDescriptor[] {
        const closestPeers = this.bucket!.closest(kademliaId, limit)
        return closestPeers.map((dhtPeer: DhtPeer) => dhtPeer.getPeerDescriptor())
    }

    // IDHTRpcService implementation

    public async getClosestPeers(request: ClosestPeersRequest, context: ServerCallContext): Promise<ClosestPeersResponse> {

        this.addNewContact((context as DhtCallContext).incomingSourceDescriptor!)

        const response = {
            peers: this.getClosestPeerDescriptors(request.kademliaId, this.config.getClosestContactsLimit),
            requestId: request.requestId
        }
        return response
    }

    public async ping(request: PingRequest, context: ServerCallContext): Promise<PingResponse> {
        logger.trace('received ping request: ' + this.config.nodeName + ', ' + (context as DhtCallContext).incomingSourceDescriptor?.nodeName)

        setImmediate(() => {
            this.addNewContact((context as DhtCallContext).incomingSourceDescriptor!)
        })

        const response: PingResponse = {
            requestId: request.requestId
        }
        return response
    }

    public async leaveNotice(request: LeaveNotice, context: ServerCallContext): Promise<Empty> {
        // TODO check signature??
        if (request.serviceId === this.config.serviceId) {
            this.removeContact((context as DhtCallContext).incomingSourceDescriptor!)
        }
        return {}
    }

    public async startRecursiveFind(idToFind: Uint8Array, findMode?: FindMode): Promise<RecursiveFindResult> {
        return this.recursiveFinder!.startRecursiveFind(idToFind, findMode)
    }

    // Store API for higher layers and tests
    public async storeDataToDht(key: Uint8Array, data: Any): Promise<PeerDescriptor[]> {
        return this.dataStore!.storeDataToDht(key, data)
    }

    public async getDataFromDht(idToFind: Uint8Array): Promise<RecursiveFindResult> {
        return this.recursiveFinder!.startRecursiveFind(idToFind, FindMode.DATA)
    }

}
