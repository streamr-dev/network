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
    LeaveNotice,
    ConnectivityResponse,
    Message,
    NodeType,
    PeerDescriptor,
    PingRequest,
    PingResponse,
    FindMode,
} from '../proto/packages/dht/protos/DhtRpc'
import * as Err from '../helpers/errors'
import { DisconnectionType, ITransport, TransportEvents } from '../transport/ITransport'
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
import { Router } from './routing/Router'
import { RecursiveFinder, RecursiveFindResult } from './find/RecursiveFinder'
import { DataStore } from './store/DataStore'
import { PeerDiscovery } from './discovery/PeerDiscovery'
import { LocalDataStore } from './store/LocalDataStore'
import { IceServer } from '../connection/WebRTC/WebRtcConnector'

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

export interface DhtNodeOptions {
    serviceId?: string
    parallelism?: number
    maxNeighborListSize?: number
    numberOfNodesPerKBucket?: number
    joinNoProgressLimit?: number
    routeMessageTimeout?: number
    dhtJoinTimeout?: number
    metricsContext?: MetricsContext

    transportLayer?: ITransport
    peerDescriptor?: PeerDescriptor
    entryPoints?: PeerDescriptor[]
    webSocketHost?: string
    webSocketPort?: number
    peerIdString?: string

    nodeName?: string
    rpcRequestTimeout?: number
    iceServers?: IceServer[]
    webrtcDisallowPrivateAddresses?: boolean
    webrtcDatachannelBufferThresholdLow?: number
    webrtcDatachannelBufferThresholdHigh?: number
    newWebrtcConnectionTimeout?: number
}

export class DhtNodeConfig {
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

    transportLayer?: ITransport
    peerDescriptor?: PeerDescriptor
    entryPoints?: PeerDescriptor[]
    webSocketHost?: string
    webSocketPort?: number
    peerIdString?: string
    nodeName?: string
    rpcRequestTimeout?: number
    iceServers?: IceServer[]
    webrtcDisallowPrivateAddresses?: boolean
    webrtcDatachannelBufferThresholdLow?: number
    webrtcDatachannelBufferThresholdHigh?: number
    newWebrtcConnectionTimeout?: number

    constructor(conf: Partial<DhtNodeOptions>) {
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

export const createPeerDescriptor = (msg?: ConnectivityResponse, peerIdString?: string, nodeName?: string): PeerDescriptor => {
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
    private ownPeerId?: PeerID
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
                iceServers: this.config.iceServers,
                metricsContext: this.config.metricsContext,
                webrtcDisallowPrivateAddresses: this.config.webrtcDisallowPrivateAddresses,
                webrtcDatachannelBufferThresholdLow: this.config.webrtcDatachannelBufferThresholdLow,
                webrtcDatachannelBufferThresholdHigh: this.config.webrtcDatachannelBufferThresholdHigh,
                newWebrtcConnectionTimeout: this.config.newWebrtcConnectionTimeout,
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

        this.transportLayer.on('message', (message: Message) => this.handleMessage(message))

        this.bindDefaultServerMethods()
        this.ownPeerId = peerIdFromPeerDescriptor(this.ownPeerDescriptor!)
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
            localDataStore: this.localDataStore,
            dhtNodeEmitter: this,
            getNodesClosestToIdFromBucket: (id: Uint8Array, n?: number) => {
                return this.bucket!.closest(id, n)
            }
        })
    }

    private initKBuckets = (selfId: PeerID) => {
        this.bucket = new KBucket<DhtPeer>({
            localNodeId: selfId.value,
            numberOfNodesPerKBucket: this.config.numberOfNodesPerKBucket,
            numberOfNodesToPing: this.config.numberOfNodesPerKBucket
        })
        this.bucket.on('ping', (oldContacts: DhtPeer[], newContact: DhtPeer) => this.onKBucketPing(oldContacts, newContact))
        this.bucket.on('removed', (contact: DhtPeer) => this.onKBucketRemoved(contact))
        this.bucket.on('added', (contact: DhtPeer) => this.onKBucketAdded(contact))
        this.bucket.on('updated', (_oldContact: DhtPeer, _newContact: DhtPeer) => {
            // TODO: Update contact info to the connection manager and reconnect
        })
        this.neighborList = new SortedContactList(selfId, this.config.maxNeighborListSize)
        this.neighborList.on('contactRemoved', (peerDescriptor: PeerDescriptor, activeContacts: PeerDescriptor[]) => {
            if (this.stopped) {
                return
            }
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
        this.transportLayer!.on('connected', (peerDescriptor: PeerDescriptor) => this.onTransportConnected(peerDescriptor))

        this.transportLayer!.on('disconnected', (peerDescriptor: PeerDescriptor, disonnectionType: DisconnectionType) => {
            this.onTransportDisconnected(peerDescriptor, disonnectionType)
        })

        this.transportLayer!.getAllConnectionPeerDescriptors().map((peer) => {
            const peerId = peerIdFromPeerDescriptor(peer)
            const dhtPeer = new DhtPeer(
                this.ownPeerDescriptor!,
                peer,
                toProtoRpcClient(new DhtRpcServiceClient(this.rpcCommunicator!.getRpcClientTransport())),
                this.config.serviceId
            )
            if (peerId.equals(this.ownPeerId!)) {
                logger.error('own peerdescriptor added to connections in initKBucket')
            }

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

    private onTransportConnected(peerDescriptor: PeerDescriptor): void {

        if (this.ownPeerId!.equals(PeerID.fromValue(peerDescriptor.kademliaId))) {
            console.error('onTransportConnected() to self')
        }

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
            logger.trace("connected: " + this.ownPeerDescriptor!.nodeName + ", " + peerDescriptor.nodeName + ' ' + this.connections.size)
        }
        this.emit('connected', peerDescriptor)
    }

    private onTransportDisconnected(peerDescriptor: PeerDescriptor, dicsonnectionType: DisconnectionType): void {
        logger.trace('disconnected: ' + this.config.nodeName + ', ' + peerDescriptor.nodeName + ' ')
        this.connections.delete(keyFromPeerDescriptor(peerDescriptor))
        // only remove from bucket if we are on layer 0
        if (this.connectionManager) {
            this.bucket!.remove(peerDescriptor.kademliaId)

            if (dicsonnectionType == 'OUTGOING_GRACEFUL_LEAVE' || dicsonnectionType == 'INCOMING_GRACEFUL_LEAVE') {
                logger.trace( this.config.nodeName + ', ' + peerDescriptor.nodeName + ' ' + 'onTransportDisconnected with type ' + dicsonnectionType)
                this.removeContact(peerDescriptor, true)
            } else {
                logger.trace( this.config.nodeName + ', ' + peerDescriptor.nodeName + ' ' + 'onTransportDisconnected with type ' + dicsonnectionType)
            }
        }

        this.emit('disconnected', peerDescriptor, dicsonnectionType)
    }

    private bindDefaultServerMethods(): void {
        if (!this.started || this.stopped) {
            return
        }
        logger.trace(`Binding default DHT RPC methods`)
        this.rpcCommunicator!.registerRpcMethod(ClosestPeersRequest, ClosestPeersResponse, 'getClosestPeers',
            (req: ClosestPeersRequest, context) => this.getClosestPeers(req, context))
        this.rpcCommunicator!.registerRpcMethod(PingRequest, PingResponse, 'ping',
            (req: PingRequest, context) => this.ping(req, context))
        this.rpcCommunicator!.registerRpcNotification(LeaveNotice, 'leaveNotice',
            (req: LeaveNotice, context) => this.leaveNotice(req, context))
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
            this.ownPeerDescriptor = createPeerDescriptor(connectivityResponse,
                this.config.peerIdString,
                this.config.nodeName)
        }
        return this.ownPeerDescriptor
    }

    private getClosestPeerDescriptors(kademliaId: Uint8Array, limit: number): PeerDescriptor[] {
        const closestPeers = this.bucket!.closest(kademliaId, limit)
        return closestPeers.map((dhtPeer: DhtPeer) => dhtPeer.getPeerDescriptor())
    }

    private onKBucketPing(oldContacts: DhtPeer[], newContact: DhtPeer): void {
        if (this.stopped) {
            return
        }
        const sortingList: SortedContactList<DhtPeer> = new SortedContactList(this.ownPeerId!, 100)
        sortingList.addContacts(oldContacts)
        const sortedContacts = sortingList.getAllContacts()
        this.connectionManager?.weakUnlockConnection(sortedContacts[sortedContacts.length - 1].getPeerDescriptor())
        this.bucket?.remove(sortedContacts[sortedContacts.length - 1].getPeerId().value)
        this.bucket!.add(newContact)
    }

    private onKBucketRemoved(contact: DhtPeer): void {
        if (this.stopped) {
            return
        }
        this.connectionManager?.weakUnlockConnection(contact.getPeerDescriptor())
        logger.trace(`Removed contact ${contact.getPeerId().value.toString()}`)
        this.emit(
            'kbucketContactRemoved',
            contact.getPeerDescriptor()
        )
        if (this.bucket!.count() === 0
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
        if (this.stopped) {
            return
        }
        this.contactOnAddedCounter++
        if (this.config.nodeName == '1') {
            logger.trace('peer1 contactOnAddCounter: ' + this.contactOnAddedCounter)
        }
        if (!this.stopped && !contact.getPeerId().equals(this.ownPeerId!)) {
            // Important to lock here, before the ping result is known
            this.connectionManager?.weakLockConnection(contact.getPeerDescriptor())
            if (this.connections.has(contact.getPeerId().toKey())) {
                logger.trace(`Added new contact ${contact.getPeerId().value.toString()}`)
                this.emit(
                    'newKbucketContact',
                    contact.getPeerDescriptor(),
                    this.neighborList!.getClosestContacts(this.config.getClosestContactsLimit).map((peer) => peer.getPeerDescriptor())
                )
            } else {    // open connection by pinging
                logger.trace('starting ping ' + this.config.nodeName + ', ' + contact.getPeerDescriptor().nodeName + ' ')
                contact.ping().then((result) => {
                    if (result) {
                        logger.trace(`Added new contact ${contact.getPeerId().value.toString()}`)
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

    public getNeighborList(): SortedContactList<DhtPeer> {
        return this.neighborList!
    }

    public getNodeId(): PeerID {
        return this.ownPeerId!
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

    public async startRecursiveFind(idToFind: Uint8Array, findMode?: FindMode): Promise<RecursiveFindResult> {
        return this.recursiveFinder!.startRecursiveFind(idToFind, findMode)
    }

    public async storeDataToDht(key: Uint8Array, data: Any): Promise<PeerDescriptor[]> {
        return this.dataStore!.storeDataToDht(key, data)
    }

    public async getDataFromDht(idToFind: Uint8Array): Promise<RecursiveFindResult> {
        return this.recursiveFinder!.startRecursiveFind(idToFind, FindMode.DATA)
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

    public getNodeName(): string {
        if (this.config.nodeName) {
            return this.config.nodeName
        } else {
            return 'unnamed node'
        }
    }

    public async stop(): Promise<void> {
        if (this.stopped) {
            return
        }
        logger.trace('stop()')
        if (!this.started) {
            throw new Err.CouldNotStop('Cannot not stop() before start()')
        }
        this.stopped = true

        this.bucket!.toArray().map((dhtPeer: DhtPeer) => this.bucket!.remove(dhtPeer.id))
        this.bucket!.removeAllListeners()
        this.neighborList!.stop()
        this.randomPeers!.stop()
        this.openInternetPeers!.stop()
        this.rpcCommunicator!.stop()
        this.router!.stop()
        this.recursiveFinder!.stop()
        this.peerDiscovery!.stop()
        if (this.connectionManager) {
            await this.connectionManager.stop()
        }
        this.transportLayer = undefined
        this.connectionManager = undefined
        this.connections.clear()
        this.removeAllListeners()
    }

    // IDHTRpcService implementation
    private async getClosestPeers(request: ClosestPeersRequest, context: ServerCallContext): Promise<ClosestPeersResponse> {
        this.addNewContact((context as DhtCallContext).incomingSourceDescriptor!)
        const response = {
            peers: this.getClosestPeerDescriptors(request.kademliaId, this.config.getClosestContactsLimit),
            requestId: request.requestId
        }
        return response
    }

    // IDHTRpcService implementation
    private async ping(request: PingRequest, context: ServerCallContext): Promise<PingResponse> {
        logger.trace('received ping request: ' + this.config.nodeName + ', ' + (context as DhtCallContext).incomingSourceDescriptor?.nodeName)
        setImmediate(() => {
            this.addNewContact((context as DhtCallContext).incomingSourceDescriptor!)
        })
        const response: PingResponse = {
            requestId: request.requestId
        }
        return response
    }

    // IDHTRpcService implementation
    public async leaveNotice(request: LeaveNotice, context: ServerCallContext): Promise<Empty> {
        // TODO check signature??
        if (request.serviceId === this.config.serviceId) {
            this.removeContact((context as DhtCallContext).incomingSourceDescriptor!)
        }
        return {}
    }

}
