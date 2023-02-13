import crypto from 'crypto'
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
    Message,
    NodeType,
    PeerDescriptor,
    PingRequest,
    PingResponse,
    RouteMessageAck,
    RouteMessageWrapper,
    LeaveNotice,
    RecursiveFindRequest,
    FindMode,
    MessageType,
    StoreDataResponse,
    StoreDataRequest,
    DataEntry
} from '../proto/packages/dht/protos/DhtRpc'
import * as Err from '../helpers/errors'
import { ITransport, TransportEvents } from '../transport/ITransport'
import { ConnectionManager, ConnectionManagerConfig } from '../connection/ConnectionManager'
import { DhtRpcServiceClient } from '../proto/packages/dht/protos/DhtRpc.client'
import {
    Logger,
    MetricsContext,
    raceEvents3,
    runAndRaceEvents3,
    RunAndRaceEventsReturnType,
    waitForEvent3,
    waitForCondition
} from '@streamr/utils'
import { v4 } from 'uuid'
import { IDhtRpcService } from '../proto/packages/dht/protos/DhtRpc.server'
import { toProtoRpcClient } from '@streamr/proto-rpc'
import { RoutingMode, RoutingSession, RoutingSessionEvents } from './RoutingSession'
import { DiscoverySession } from './DiscoverySession'
import { RandomContactList } from './contact/RandomContactList'
import { Empty } from '../proto/google/protobuf/empty'
import { DhtCallContext } from '../rpc-protocol/DhtCallContext'
import { RemoteRecursiveFindSession } from './RemoteRecursiveFindSession'
import { RecursiveFindSession, RecursiveFindSessionEvents } from './RecursiveFindSession'
import { SetDuplicateDetector } from './SetDuplicateDetector'
import { Any } from '../proto/google/protobuf/any'
import { Timestamp } from '../proto/google/protobuf/timestamp'
import { keyFromPeerDescriptor, peerIdFromPeerDescriptor } from '../helpers/peerIdFromPeerDescriptor'

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

interface ForwardingTableEntry {
    timeout: NodeJS.Timeout
    peerDescriptors: PeerDescriptor[]
}

export interface RecursiveFindResult { closestNodes: Array<PeerDescriptor>, dataEntries?: Array<DataEntry> }

export class DhtNode extends EventEmitter<Events> implements ITransport, IDhtRpcService {
    private readonly config: DhtNodeConfig
    private readonly routerDuplicateDetector: SetDuplicateDetector = new SetDuplicateDetector(100000, 100)
    private readonly ongoingClosestPeersRequests: Set<string> = new Set()
    private readonly forwardingTable: Map<string, ForwardingTableEntry> = new Map()

    // noProgressCounter is Increased on every getClosestPeers round in which no new nodes
    // with an id closer to target id were found.
    // When joinNoProgressLimit is reached, the join process will terminate. If a closer node is found
    // before reaching joinNoProgressLimit, this counter gets reset to 0.

    //private noProgressCounter = 0
    private joinTimeoutRef?: NodeJS.Timeout
    private ongoingJoinOperation = false

    private ongoingRoutingSessions: Map<string, RoutingSession> = new Map()
    private ongoingDiscoverySessions: Map<string, DiscoverySession> = new Map()

    private bucket?: KBucket<DhtPeer>
    private connections: Map<PeerIDKey, DhtPeer> = new Map()
    private neighborList?: SortedContactList<DhtPeer>
    private openInternetPeers?: SortedContactList<DhtPeer>
    private randomPeers?: RandomContactList<DhtPeer>
    private rpcCommunicator?: RoutingRpcCommunicator
    private transportLayer?: ITransport
    private ownPeerDescriptor?: PeerDescriptor

    private outgoingClosestPeersRequestsCounter = 0

    public connectionManager?: ConnectionManager
    private started = false
    private stopped = false
    private rejoinOngoing = false

    private getClosestPeersFromBucketIntervalRef?: NodeJS.Timeout
    private rejoinTimeoutRef?: NodeJS.Timeout

    public contactAddCounter = 0
    public contactOnAddedCounter = 0

    // A map into which each node can store one value per data key
    // The first key is the key of the data, the second key is the 
    // PeerID of the storer of the data

    private dataStore: Map<PeerIDKey, Map<PeerIDKey, DataEntry>> = new Map()

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
            && !this.isJoinOngoing()
            && this.config.entryPoints
            && this.config.entryPoints.length > 0
        ) {
            setImmediate(async () => {
                await this.rejoinDht(this.config.entryPoints![0])
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
                    this.config.serviceId,
                    this
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
                this.config.serviceId,
                this
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

        msg.sourceDescriptor = this.ownPeerDescriptor

        const targetPeerDescriptor = msg.targetDescriptor!

        const params: RouteMessageWrapper = {
            message: msg,
            requestId: v4(),
            destinationPeer: targetPeerDescriptor,
            sourcePeer: this.ownPeerDescriptor!,
            reachableThrough: this.ongoingJoinOperation ? this.config.entryPoints || [] : [],
            routingPath: []
        }

        const forwardingEntry = this.forwardingTable.get(keyFromPeerDescriptor(targetPeerDescriptor))
        if (
            forwardingEntry
            && forwardingEntry.peerDescriptors.length > 0
            // && PeerID.fromValue(forwardingEntry.peerDescriptors[0].peerId).equals(PeerID.fromValue(targetPeerDescriptor.peerId))
        ) {
            const forwardingPeer = forwardingEntry.peerDescriptors[0]
            const forwardedMessage: RouteMessageWrapper = {
                message: msg,
                requestId: v4(),
                destinationPeer: forwardingPeer,
                sourcePeer: this.ownPeerDescriptor!,
                reachableThrough: [],
                routingPath: []
            }
            this.doRouteMessage(forwardedMessage, true).catch((err) => {
                logger.warn(
                    `Failed to send (forwardMessage: ${this.config.serviceId}) to 
                    ${keyFromPeerDescriptor(targetPeerDescriptor)}: ${err}`
                )
            })
        } else {
            this.doRouteMessage(params).catch((err) => {
                logger.warn(
                    `Failed to send (routeMessage: ${this.config.serviceId}) to ${keyFromPeerDescriptor(targetPeerDescriptor)}: ${err}`
                )
            })
        }
    }

    public async joinDht(entryPointDescriptor: PeerDescriptor): Promise<void> {
        if (!this.started || this.stopped || this.ongoingJoinOperation) {
            return
        }

        this.ongoingJoinOperation = true

        logger.trace(
            `Joining ${this.config.serviceId === 'layer0' ? 'The Streamr Network' : `Control Layer for ${this.config.serviceId}`}`
            + ` via entrypoint ${keyFromPeerDescriptor(entryPointDescriptor)}`
        )
        const entryPoint = new DhtPeer(
            this.ownPeerDescriptor!,
            entryPointDescriptor,
            toProtoRpcClient(new DhtRpcServiceClient(this.rpcCommunicator!.getRpcClientTransport())),
            this.config.serviceId,
            this
        )

        if (this.ownPeerId!.equals(entryPoint.peerId)) {
            return
        }

        if (this.connectionManager) {
            this.connectionManager.lockConnection(entryPointDescriptor, `${this.config.serviceId}::joinDht`)
        }

        if (!this.started || this.stopped) {
            return
        }

        this.addNewContact(entryPointDescriptor)
        const closest = this.bucket!.closest(this.ownPeerId!.value, this.config.getClosestContactsLimit)
        this.neighborList!.addContacts(closest)

        const session = new DiscoverySession(this.neighborList!, this.ownPeerId!.value,
            this.ownPeerDescriptor!, this.config.serviceId, this.rpcCommunicator!, this.config.parallelism,
            this.config.joinNoProgressLimit, (newPeer: DhtPeer) => {
                if (!this.bucket!.get(newPeer.id)) {

                    if (newPeer.getPeerDescriptor().openInternet) {
                        this.openInternetPeers!.addContact(newPeer)
                    }

                    this.bucket!.add(newPeer)
                } else {
                    this.randomPeers!.addContact(newPeer)
                }
            }, this.config.nodeName)

        const randomSession = new DiscoverySession(this.neighborList!, crypto.randomBytes(8),
            this.ownPeerDescriptor!, this.config.serviceId, this.rpcCommunicator!, this.config.parallelism,
            this.config.joinNoProgressLimit, (newPeer: DhtPeer) => {
                if (!this.bucket!.get(newPeer.id)) {

                    if (newPeer.getPeerDescriptor().openInternet) {
                        this.openInternetPeers!.addContact(newPeer)
                    }

                    this.bucket!.add(newPeer)
                } else {
                    this.randomPeers!.addContact(newPeer)
                }
            }, this.config.nodeName + '-random')

        this.ongoingDiscoverySessions.set(session.sessionId, session)
        this.ongoingDiscoverySessions.set(randomSession.sessionId, randomSession)

        try {
            await session.findClosestNodes(this.config.dhtJoinTimeout * 2)
            this.neighborList?.setAllAsUncontacted()
            await randomSession.findClosestNodes(this.config.dhtJoinTimeout * 2)
            if (!this.stopped) {
                if (this.bucket!.count() === 0) {
                    this.rejoinDht(entryPointDescriptor).catch(() => { })
                }
                /* else {
                    this.getClosestPeersFromBucketIntervalRef = setTimeout(async () => await this.getClosestPeersFromBucket(), 30 * 1000)
                }*/
            }
        } catch (_e) {
            throw (new Err.DhtJoinTimeout('join timed out'))
        } finally {
            this.ongoingJoinOperation = false
            this.ongoingDiscoverySessions.delete(session.sessionId)
            this.ongoingDiscoverySessions.delete(randomSession.sessionId)

            if (this.connectionManager) {
                logger.trace('unlocking entryPoint Disconnect')
                this.connectionManager.unlockConnection(entryPointDescriptor, `${this.config.serviceId}::joinDht`)
            }
        }

        // -- todo, separate into a function, now trying this out
    }

    private async rejoinDht(entryPoint: PeerDescriptor): Promise<void> {
        if (!this.started || this.stopped || this.rejoinOngoing) {
            return
        }
        logger.info(`Rejoining DHT ${this.config.serviceId} ${this.config.nodeName}!`)
        this.rejoinOngoing = true
        try {
            this.neighborList!.clear()
            await this.joinDht(entryPoint)

            this.rejoinOngoing = false
            if (this.connections.size === 0 || this.bucket!.count() === 0) {
                if (!this.started || this.stopped) {
                    return
                }
                this.rejoinTimeoutRef = setTimeout(async () => {
                    await this.rejoinDht(entryPoint)
                    this.rejoinTimeoutRef = undefined
                }, 5000)
            } else {
                logger.info(`Rejoined DHT successfully ${this.config.serviceId}!`)
            }
        } catch (err) {
            logger.warn(`rejoining DHT ${this.config.serviceId} failed`)
            this.rejoinOngoing = false
            if (!this.started || this.stopped) {
                return
            }
            this.rejoinTimeoutRef = setTimeout(async () => {
                await this.rejoinDht(entryPoint)
                this.rejoinTimeoutRef = undefined
            }, 5000)
        }
    }

    private async getClosestPeersFromBucket(): Promise<void> {
        if (!this.started || this.stopped) {
            return
        }
        await Promise.allSettled(this.bucket!.toArray().map(async (peer: DhtPeer) => {
            const contacts = await peer.getClosestPeers(this.ownPeerDescriptor!.kademliaId!)
            contacts.forEach((contact) => {
                this.addNewContact(contact)
            })
        }))
        if (!this.started || this.stopped) {
            return
        }
        this.getClosestPeersFromBucketIntervalRef = setTimeout(async () =>
            await this.getClosestPeersFromBucket()
        , 90 * 1000)
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
                this.config.serviceId,
                this
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
        this.routeMessage = this.routeMessage.bind(this)
        this.findRecursively = this.findRecursively.bind(this)
        this.forwardMessage = this.forwardMessage.bind(this)
        this.leaveNotice = this.leaveNotice.bind(this)
        this.storeData = this.storeData.bind(this)

        this.rpcCommunicator!.registerRpcMethod(ClosestPeersRequest, ClosestPeersResponse, 'getClosestPeers', this.getClosestPeers)
        this.rpcCommunicator!.registerRpcMethod(PingRequest, PingResponse, 'ping', this.ping)
        this.rpcCommunicator!.registerRpcMethod(RouteMessageWrapper, RouteMessageAck, 'routeMessage', this.routeMessage)
        this.rpcCommunicator!.registerRpcMethod(RouteMessageWrapper, RouteMessageAck, 'findRecursively', this.findRecursively)
        this.rpcCommunicator!.registerRpcMethod(RouteMessageWrapper, RouteMessageAck, 'forwardMessage', this.forwardMessage)
        this.rpcCommunicator!.registerRpcNotification(LeaveNotice, 'leaveNotice', this.leaveNotice)
        this.rpcCommunicator!.registerRpcMethod(StoreDataRequest, StoreDataResponse, 'storeData', this.storeData)
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

    public getNumberOfOutgoingClosestPeersRequests(): number {
        return this.outgoingClosestPeersRequestsCounter
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

    public isJoinOngoing(): boolean {
        return this.ongoingJoinOperation
    }

    public async stop(): Promise<void> {
        logger.trace('stop()')
        if (!this.started) {
            throw new Err.CouldNotStop('Cannot not stop() before start()')
        }
        this.stopped = true

        if (this.joinTimeoutRef) {
            clearTimeout(this.joinTimeoutRef)
        }
        if (this.getClosestPeersFromBucketIntervalRef) {
            clearTimeout(this.getClosestPeersFromBucketIntervalRef)
            this.getClosestPeersFromBucketIntervalRef = undefined
        }
        if (this.rejoinTimeoutRef) {
            clearTimeout(this.rejoinTimeoutRef)
            this.rejoinTimeoutRef = undefined
        }
        this.ongoingJoinOperation = false
        this.ongoingRoutingSessions.forEach((session, _id) => {
            session.stop()
        })

        this.ongoingDiscoverySessions.forEach((session, _id) => {
            session.stop()
        })

        this.bucket!.removeAllListeners()
        this.rpcCommunicator!.stop()
        this.forwardingTable.forEach((entry) => {
            clearTimeout(entry.timeout)
        })
        this.forwardingTable.clear()
        //this.removeAllListeners()

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

    // eslint-disable-next-line class-methods-use-this
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
            from ${routedMessage.sourcePeer?.kademliaId} to ${routedMessage.destinationPeer?.kademliaId}`)

        routedMessage.routingPath.push(this.ownPeerDescriptor!)

        const session = new RoutingSession(
            this.ownPeerDescriptor!,
            routedMessage,
            this.connections,
            this.ownPeerId!.equals(peerIdFromPeerDescriptor(routedMessage.sourcePeer!)) ? 2 : 1,
            this.config.routeMessageTimeout,
            forwarding ? RoutingMode.FORWARD : RoutingMode.ROUTE,
            undefined,
            routedMessage.routingPath.map((descriptor) => peerIdFromPeerDescriptor(descriptor))
        )

        this.ongoingRoutingSessions.set(session.sessionId, session)

        let result: RunAndRaceEventsReturnType<RoutingSessionEvents>

        try {
            result = await runAndRaceEvents3<RoutingSessionEvents>([() => {
                session.start()
            }], session, ['noCandidatesFound', 'candidatesFound'], 1500)
        } catch (e) {
            logger.error(e)
            throw e
        }
        raceEvents3<RoutingSessionEvents>(
            session, ['routingSucceeded', 'routingFailed', 'stopped'], 10000).then(() => {
            if (this.ongoingRoutingSessions.has(session.sessionId)) {
                this.ongoingRoutingSessions.delete(session.sessionId)
            }
            return
        }).catch(() => {
            if (this.ongoingRoutingSessions.has(session.sessionId)) {
                this.ongoingRoutingSessions.delete(session.sessionId)
            }
        })

        if (this.stopped) {
            return this.createRouteMessageAck(routedMessage, 'DhtNode Stopped')
        } else if (result.winnerName === 'noCandidatesFound' || result.winnerName === 'routingFailed') {
            if (peerIdFromPeerDescriptor(routedMessage.sourcePeer!).equals(this.ownPeerId!)) {
                throw new Error(`Could not perform initial routing`)
            }
            return this.createRouteMessageAck(routedMessage, 'No routing candidates found')
        } else {
            return this.createRouteMessageAck(routedMessage)
        }
    }

    public async startRecursiveFind(idToFind: Uint8Array, findMode: FindMode = FindMode.NODE): Promise<RecursiveFindResult> {
        const sessionId = v4()
        const recursiveFindSession = new RecursiveFindSession(sessionId, this, idToFind)
        const targetDescriptor: PeerDescriptor = { kademliaId: idToFind, type: NodeType.VIRTUAL }
        const request: RecursiveFindRequest = {
            recursiveFindSessionId: sessionId,
            findMode: findMode
        }
        const msg: Message = {
            messageType: MessageType.RECURSIVE_FIND_REQUEST,
            messageId: v4(),
            serviceId: this.config.serviceId,
            body: {
                oneofKind: 'recursiveFindRequest',
                recursiveFindRequest: request
            }
        }

        const params: RouteMessageWrapper = {
            message: msg,
            requestId: v4(),
            destinationPeer: targetDescriptor,
            sourcePeer: this.ownPeerDescriptor!,
            reachableThrough: [],
            routingPath: []
        }
        const promise = waitForEvent3<RecursiveFindSessionEvents>(recursiveFindSession, 'findCompleted', 60000)
        this.doFindRecursevily(params)
        await promise

        const results = recursiveFindSession.getResults()
        logger.trace("recursive find results: " + JSON.stringify(results))
        return results
    }

    private reportRecursiveFindResult(targetPeerDescriptor: PeerDescriptor, serviceId: string,
        closestNodes: PeerDescriptor[], data: Map<PeerIDKey, DataEntry> | undefined, noCloserNodesFound: boolean = false) {
        const session = new RemoteRecursiveFindSession(this.ownPeerDescriptor!, targetPeerDescriptor, serviceId, this)
        session.reportRecursiveFindResult(closestNodes, data, noCloserNodesFound)
    }

    private async doFindRecursevily(routedMessage: RouteMessageWrapper): Promise<RouteMessageAck> {

        routedMessage.routingPath.push(this.ownPeerDescriptor!)

        logger.info('findRecursively recursiveFindPath ' + routedMessage.routingPath.map((descriptor) => descriptor.nodeName))

        const idToFind = PeerID.fromValue(routedMessage.destinationPeer!.kademliaId)

        let recursiveFindRequest: RecursiveFindRequest | undefined
        const msg = routedMessage.message
        if (msg?.body.oneofKind === 'recursiveFindRequest') {
            recursiveFindRequest = msg.body.recursiveFindRequest
        }

        if (recursiveFindRequest!.findMode == FindMode.DATA) {

            const data = this.doGetData(idToFind)

            if (data) {
                this.reportRecursiveFindResult(routedMessage.sourcePeer!, recursiveFindRequest!.recursiveFindSessionId,
                    this.getClosestPeerDescriptors(routedMessage.destinationPeer!.kademliaId, 5), data, true)
                return this.createRouteMessageAck(routedMessage)
            }

        } else {
            if (this.ownPeerId!.equals(idToFind)) {

                // Exact match, they were trying to find our kademliaID

                this.reportRecursiveFindResult(routedMessage.sourcePeer!, recursiveFindRequest!.recursiveFindSessionId,
                    this.getClosestPeerDescriptors(routedMessage.destinationPeer!.kademliaId, 5), undefined, true)
                return this.createRouteMessageAck(routedMessage)
            }
        }

        const session = new RoutingSession(
            this.ownPeerDescriptor!,
            routedMessage,
            this.connections,
            1,
            1500,
            RoutingMode.RECURSIVE_FIND,
            undefined,
            routedMessage.routingPath.map((descriptor) => peerIdFromPeerDescriptor(descriptor))
        )

        this.ongoingRoutingSessions.set(session.sessionId, session)

        const logFailure = () => {
            logger.trace(`findRecursively Node ${this.getNodeName()} giving up routing`)
        }
        session.on('routingFailed', logFailure)

        let result: RunAndRaceEventsReturnType<RoutingSessionEvents>

        try {
            result = await runAndRaceEvents3<RoutingSessionEvents>([() => {
                session.start()
            }], session, ['noCandidatesFound', 'candidatesFound'], 1500)
        } catch (e) {
            logger.error(e)
        }

        if (this.ongoingRoutingSessions.has(session.sessionId)) {
            this.ongoingRoutingSessions.delete(session.sessionId)
        }

        if (this.stopped) {
            return this.createRouteMessageAck(routedMessage, 'DhtNode Stopped')
        } else if (result!.winnerName === 'noCandidatesFound' || result!.winnerName === 'routingFailed') {
            if (peerIdFromPeerDescriptor(routedMessage.sourcePeer!).equals(this.ownPeerId!)) {
                throw new Error(`Could not perform initial routing`)
            }
            logger.trace(`findRecursively Node ${this.getNodeName()} found no candidates`)
            this.reportRecursiveFindResult(routedMessage.sourcePeer!, recursiveFindRequest!.recursiveFindSessionId,
                this.getClosestPeerDescriptors(routedMessage.destinationPeer!.kademliaId, 5), undefined, true)
            return this.createRouteMessageAck(routedMessage)
        } else {
            logger.trace(`findRecursively Node ${this.getNodeName()} found candidates ` +
                JSON.stringify((session.getClosestContacts(5).map((desc) => desc.nodeName))))
            this.reportRecursiveFindResult(routedMessage.sourcePeer!, recursiveFindRequest!.recursiveFindSessionId,
                session.getClosestContacts(5), undefined, false)
            return this.createRouteMessageAck(routedMessage)
        }
    }

    public async findRecursively(routedMessage: RouteMessageWrapper): Promise<RouteMessageAck> {
        if (!this.started || this.stopped) {
            return this.createRouteMessageAck(routedMessage, 'findRecursively() service is not running')
        } else if (this.routerDuplicateDetector.isMostLikelyDuplicate(routedMessage.requestId, routedMessage.sourcePeer!.nodeName!)) {
            logger.trace(`findRecursively Node ${this.getNodeName()} received a DUPLICATE RouteMessageWrapper from 
            ${routedMessage.previousPeer?.nodeName}`)

            return this.createRouteMessageAck(routedMessage, 'message given to findRecursively() service is likely a duplicate')
        }

        logger.trace(`Node ${this.getNodeName()} received findRecursively call from ${routedMessage.previousPeer!.nodeName!}`)

        this.addNewContact(routedMessage.sourcePeer!, true)
        this.routerDuplicateDetector.add(routedMessage.requestId, routedMessage.sourcePeer!.nodeName!)

        return this.doFindRecursevily(routedMessage)
    }

    public async routeMessage(routedMessage: RouteMessageWrapper, _context: ServerCallContext): Promise<RouteMessageAck> {
        if (!this.started || this.stopped) {
            return this.createRouteMessageAck(routedMessage, 'routeMessage() service is not running')
        } else if (this.routerDuplicateDetector.isMostLikelyDuplicate(routedMessage.requestId, routedMessage.sourcePeer!.nodeName!)) {
            logger.trace(`Peer ${this.ownPeerId?.value} routing message ${routedMessage.requestId} 
                from ${routedMessage.sourcePeer?.kademliaId} to ${routedMessage.destinationPeer?.kademliaId} is likely a duplicate`)
            return this.createRouteMessageAck(routedMessage, 'message given to routeMessage() service is likely a duplicate')
        }

        logger.trace(`Processing received routeMessage ${routedMessage.requestId}`)

        this.addNewContact(routedMessage.sourcePeer!, true)

        this.routerDuplicateDetector.add(routedMessage.requestId, routedMessage.sourcePeer!.nodeName!)

        if (this.ownPeerId!.equals(peerIdFromPeerDescriptor(routedMessage.destinationPeer!))) {

            logger.trace(`${this.config.nodeName} routing message targeted to self ${routedMessage.requestId}`)

            if (routedMessage.reachableThrough.length > 0) {
                const sourceKey = keyFromPeerDescriptor(routedMessage.sourcePeer!)
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
                this.connectionManager.handleMessage(routedMessage.message!)
            }
            return this.createRouteMessageAck(routedMessage)
        } else {
            return this.doRouteMessage(routedMessage)
        }
    }

    public async forwardMessage(routedMessage: RouteMessageWrapper, _context: ServerCallContext): Promise<RouteMessageAck> {
        if (!this.started || this.stopped) {
            return this.createRouteMessageAck(routedMessage, 'forwardMessage() service is not running')
        } else if (this.routerDuplicateDetector.isMostLikelyDuplicate(routedMessage.requestId, routedMessage.sourcePeer!.nodeName!)) {
            logger.trace(`Peer ${this.ownPeerId?.value} forwarding message ${routedMessage.requestId} 
        from ${routedMessage.sourcePeer?.kademliaId} to ${routedMessage.destinationPeer?.kademliaId} is likely a duplicate`)
            return this.createRouteMessageAck(routedMessage, 'message given to forwardMessage() service is likely a duplicate')
        }

        logger.trace(`Processing received forward routeMessage ${routedMessage.requestId}`)
        this.addNewContact(routedMessage.sourcePeer!, true)
        this.routerDuplicateDetector.add(routedMessage.requestId, routedMessage.sourcePeer!.nodeName!)

        if (this.ownPeerId!.equals(peerIdFromPeerDescriptor(routedMessage.destinationPeer!))) {
            logger.trace(`Peer ${this.ownPeerId?.value} forwarding found message targeted to self ${routedMessage.requestId}`)
            try {
                const forwardedMessage = routedMessage.message!

                if (this.ownPeerId!.equals(peerIdFromPeerDescriptor(forwardedMessage.targetDescriptor!))) {
                    if (this.connectionManager) {
                        this.connectionManager.handleMessage(forwardedMessage!)
                    }
                    return this.createRouteMessageAck(routedMessage)
                }

                // eslint-disable-next-line promise/catch-or-return
                this.doRouteMessage({ ...routedMessage, destinationPeer: forwardedMessage.targetDescriptor })
                    .catch((err) => {
                        logger.error(
                            `Failed to send (forwardMessage: ${this.config.serviceId}) to`
                            + ` ${keyFromPeerDescriptor(forwardedMessage.targetDescriptor!)}: ${err}`
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

    public garbageCollectConnections(): void {
        if (this.connectionManager) {
            const LAST_USED_LIMIT = 100
            this.connectionManager.garbageCollectConnections(this.config.maxConnections, LAST_USED_LIMIT)
        }
    }

    public async waitReadyForTesting(): Promise<void> {
        if (this.connectionManager) {
            const LAST_USED_LIMIT = 100

            this.connectionManager.garbageCollectConnections(this.config.maxConnections, LAST_USED_LIMIT)
            await waitForCondition(() => {
                /*
                logger.info(this.getNodeName() + ': connections:' +
                    this.getNumberOfConnections() + ', kbucket: ' + this.getBucketSize()
                    + ', localLocked: ' + this.getNumberOfLocalLockedConnections()
                    + ', remoteLocked: ' + this.getNumberOfRemoteLockedConnections()
                    + ', weakLocked: ' + this.getNumberOfWeakLockedConnections())
                */
                return (this.getNumberOfLocalLockedConnections() == 0 &&
                    this.getNumberOfRemoteLockedConnections() == 0 &&
                    this.getNumberOfConnections() <= this.config.maxConnections)
            }, 10000)
        }
    }

    // RPC service implementation

    public async storeData(request: StoreDataRequest, context: ServerCallContext): Promise<StoreDataResponse> {

        let ttl = request.ttl
        if (ttl > this.config.storeMaxTtl) {
            ttl = this.config.storeMaxTtl
        }

        this.doStoreData((context as DhtCallContext).incomingSourceDescriptor!,
            PeerID.fromValue(request.kademliaId), request.data!, ttl)

        logger.info(this.config.nodeName + ' storeData()')

        return StoreDataResponse.create()
    }

    // Backednd of the RPC service implementation

    public doStoreData(storer: PeerDescriptor, dataKey: PeerID, data: Any, ttl: number): void {

        const publisherId = PeerID.fromValue(storer.kademliaId)

        if (!this.dataStore.has(dataKey.toKey())) {
            this.dataStore.set(dataKey.toKey(), new Map())
        }

        this.dataStore.get(dataKey.toKey())!.set(publisherId.toKey(), { storer, data, storedAt: Timestamp.now(), ttl })
    }

    public doGetData(key: PeerID): Map<PeerIDKey, DataEntry> | undefined {
        if (this.dataStore.has(key.toKey())) {
            return this.dataStore.get(key.toKey())!
        } else {
            return undefined
        }
    }

    // Store API for higher layers and tests

    public async storeDataToDht(key: Uint8Array, data: Any): Promise<PeerDescriptor[]> {
        // Find the closest nodes to the ID to store data into     

        const result = await this.startRecursiveFind(key)
        const closestNodes = result.closestNodes

        const successfulNodes: PeerDescriptor[] = []

        // ToDo: make TTL decrease according to some nice curve

        const ttl = this.config.storeHighestTtl

        for (let i = 0; i < closestNodes.length && successfulNodes.length < 5; i++) {
            const dhtPeer = new DhtPeer(
                this.ownPeerDescriptor!,
                closestNodes[i],
                toProtoRpcClient(new DhtRpcServiceClient(this.rpcCommunicator!.getRpcClientTransport())),
                this.config.serviceId,
                this
            )
            try {
                const response = await dhtPeer.storeData({ kademliaId: key, data, ttl })
                if (response.error) {
                    logger.error('dhtPeer.storeData() returned error: ' + response.error)
                    continue
                }
            } catch (e) {
                logger.error('dhtPeer.storeData() threw an exception ' + e)
                continue
            }
            successfulNodes.push(closestNodes[i])
            logger.info('dhtPeer.storeData() returned success')
        }

        return successfulNodes
    }

    public async getDataFromDht(idToFind: Uint8Array): Promise<RecursiveFindResult> {
        return this.startRecursiveFind(idToFind, FindMode.DATA)
    }

}
