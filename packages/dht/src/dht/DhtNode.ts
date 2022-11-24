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
    RouteMessageWrapper,
    LeaveNotice
} from '../proto/DhtRpc'
import { DuplicateDetector } from './DuplicateDetector'
import * as Err from '../helpers/errors'
import { ITransport, TransportEvents } from '../transport/ITransport'
import { ConnectionManager, ConnectionManagerConfig } from '../connection/ConnectionManager'
import { DhtRpcServiceClient } from '../proto/DhtRpc.client'
import { Logger, MetricsContext } from '@streamr/utils'
import { v4 } from 'uuid'
import { IDhtRpcService } from '../proto/DhtRpc.server'
import { toProtoRpcClient } from '@streamr/proto-rpc'
import { runAndRaceEvents3 } from '../helpers/waitForEvent3'
import { RoutingSession, RoutingSessionEvents } from './RoutingSession'
import { DiscoverySession } from './DiscoverySession'
import { RandomContactList } from './contact/RandomContactList'
import { Empty } from '../proto/google/protobuf/empty'
import { DhtCallContext } from '../rpc-protocol/DhtCallContext'

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
    maxNeighborListSize = 100
    numberOfNodesPerKBucket = 8
    joinNoProgressLimit = 4
    routeMessageTimeout = 4000
    dhtJoinTimeout = 60000
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

export class DhtNode extends EventEmitter<Events> implements ITransport, IDhtRpcService {
    private readonly config: DhtNodeConfig
    private readonly routerDuplicateDetector: DuplicateDetector = new DuplicateDetector()
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

    private connectionManager?: ConnectionManager
    private started = false
    private stopped = false
    private rejoinOngoing = false

    private getClosestPeersFromBucketIntervalRef?: NodeJS.Timeout
    private rejoinTimeoutRef?: NodeJS.Timeout

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
                entryPoints: this.config.entryPoints,
                stunUrls: this.config.stunUrls,
                metricsContext: this.config.metricsContext
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
            return PeerID.fromValue(this.ownPeerDescriptor!.kademliaId)
        }
    }

    public static createPeerDescriptor = (msg?: ConnectivityResponseMessage, peerIdString?: string): PeerDescriptor => {

        let peerId: Uint8Array

        if (msg) {
            peerId = peerIdString ? PeerID.fromString(peerIdString).value : PeerID.fromIp(msg.ip).value
        } else {
            peerId = PeerID.fromString(peerIdString!).value
        }

        const ret: PeerDescriptor = { kademliaId: peerId, type: NodeType.NODEJS }

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
                const alive = await contact.ping()
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
        })
        this.bucket.on('added', async (contact: DhtPeer) => {
            if (!this.stopped && !contact.peerId.equals(this.ownPeerId!)) {
                if (await contact.ping()) {
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
            //console.info('connected, ' +PeerID.fromValue(dhtPeer.id).toKey() +', '+ dhtPeer.id)
            this.emit('connected', peerDescriptor)
        })

        this.transportLayer!.on('disconnected', (peerDescriptor: PeerDescriptor) => {
            this.connections.delete(PeerID.fromValue(peerDescriptor.kademliaId).toKey())
            this.bucket!.remove(peerDescriptor.kademliaId)
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

    public send = async (msg: Message): Promise<void> => {
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

        const forwardingEntry = this.forwardingTable.get(PeerID.fromValue(targetPeerDescriptor.kademliaId).toKey())
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
                    `Failed to send (forwardMessage: ${this.config.serviceId}) to 
                    ${PeerID.fromValue(targetPeerDescriptor.kademliaId).toKey()}: ${err}`
                )
            })
        } else {
            this.doRouteMessage(params).catch((err) => {
                logger.warn(
                    `Failed to send (routeMessage: ${this.config.serviceId}) to ${PeerID.fromValue(targetPeerDescriptor.kademliaId).toKey()}: ${err}`
                )
            })
        }
    }

    public async joinDht(entryPointDescriptor: PeerDescriptor): Promise<void> {
        if (!this.started || this.stopped || this.ongoingJoinOperation) {
            return
        }

        this.ongoingJoinOperation = true

        logger.info(
            `Joining ${this.config.serviceId === 'layer0' ? 'The Streamr Network' : `Control Layer for ${this.config.serviceId}`}`
            + ` via entrypoint ${PeerID.fromValue(entryPointDescriptor.kademliaId).toKey()}`
        )
        const entryPoint = new DhtPeer(
            this.ownPeerDescriptor!,
            entryPointDescriptor,
            toProtoRpcClient(new DhtRpcServiceClient(this.rpcCommunicator!.getRpcClientTransport())),
            this.config.serviceId
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
        const closest = this.bucket!.closest(this.ownPeerId!.value, this.config.parallelism)
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
            })

        this.ongoingDiscoverySessions.set(session.sessionId, session)

        try {
            await session.findClosestNodes(this.config.dhtJoinTimeout)
            if (!this.stopped) {
                if (this.bucket!.count() === 0) {
                    this.rejoinDht(entryPointDescriptor).catch(() => { })
                } else {
                    this.getClosestPeersFromBucketIntervalRef = setTimeout(async () => await this.getClosestPeersFromBucket(), 30 * 1000)
                }
            }
        } catch (_e) {
            throw (new Err.DhtJoinTimeout('join timed out'))
        } finally {
            this.ongoingJoinOperation = false
            this.ongoingDiscoverySessions.delete(session.sessionId)
            if (this.connectionManager) {
                this.connectionManager.unlockConnection(entryPointDescriptor, `${this.config.serviceId}::joinDht`)
            }
        }
    }

    private async rejoinDht(entryPoint: PeerDescriptor): Promise<void> {
        if (!this.started || this.stopped || this.rejoinOngoing) {
            return
        }
        logger.info(`Rejoining DHT ${this.config.serviceId}!`)
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

        const peerId = PeerID.fromValue(contact.kademliaId)
        if (!peerId.equals(this.ownPeerId!)) {
            logger.trace(`Adding new contact ${contact.kademliaId.toString()}`)
            const dhtPeer = new DhtPeer(
                this.ownPeerDescriptor!,
                contact,
                toProtoRpcClient(new DhtRpcServiceClient(this.rpcCommunicator!.getRpcClientTransport())),
                this.config.serviceId
            )
            if (!this.bucket!.get(contact.kademliaId) && !this.neighborList!.getContact(PeerID.fromValue(contact.kademliaId))) {
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
        logger.trace(`Removing contact ${contact.kademliaId.toString()}`)
        const peerId = PeerID.fromValue(contact.kademliaId)
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
        this.forwardMessage = this.forwardMessage.bind(this)
        this.leaveNotice = this.leaveNotice.bind(this)

        this.rpcCommunicator!.registerRpcMethod(ClosestPeersRequest, ClosestPeersResponse, 'getClosestPeers', this.getClosestPeers)
        this.rpcCommunicator!.registerRpcMethod(PingRequest, PingResponse, 'ping', this.ping)
        this.rpcCommunicator!.registerRpcMethod(RouteMessageWrapper, RouteMessageAck, 'routeMessage', this.routeMessage)
        this.rpcCommunicator!.registerRpcMethod(RouteMessageWrapper, RouteMessageAck, 'forwardMessage', this.forwardMessage)
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
        this.stopped = true
        this.bucket!.toArray().map((peer) => {
            peer.leaveNotice()
        })
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

    // IDHTRpcService implementation

    public async getClosestPeers(request: ClosestPeersRequest, context: ServerCallContext): Promise<ClosestPeersResponse> {
        if (this.config.serviceId === 'layer1::webrtc-network' && this.ownPeerId!.toKey() === '656e747279706f696e74') {
            // logger.info(PeerID.fromValue(request.peerDescriptor!.peerId).toKey() + ", " +  this.ownPeerId!.toKey())
        }

        this.addNewContact((context as DhtCallContext).incomingSourceDescriptor!)
        const closestPeers = this.bucket!.closest(request.kademliaId, 5)
        const peerDescriptors = closestPeers.map((dhtPeer: DhtPeer) => dhtPeer.getPeerDescriptor())
        const response = {
            peers: peerDescriptors,
            requestId: request.requestId
        }
        return response
    }

    // eslint-disable-next-line class-methods-use-this
    public async ping(request: PingRequest, context: ServerCallContext): Promise<PingResponse> {
        this.addNewContact((context as DhtCallContext).incomingSourceDescriptor!)
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

        const session = new RoutingSession(
            this.ownPeerDescriptor!,
            routedMessage,
            this.connections,
            this.ownPeerId!.equals(PeerID.fromValue(routedMessage.sourcePeer!.kademliaId)) ? 2 : 1,
            1000,
            forwarding
        )

        this.ongoingRoutingSessions.set(session.sessionId, session)

        const result = await runAndRaceEvents3<RoutingSessionEvents>([() => {
            session.start()
        }], session, ['noCandidatesFound', 'candidatesFound'], 1000)

        if (this.ongoingRoutingSessions.has(session.sessionId)) {
            this.ongoingRoutingSessions.delete(session.sessionId)
        }

        if (this.stopped) {
            return this.createRouteMessageAck(routedMessage, 'DhtNode Stopped')
        } else if (result.winnerName === 'noCandidatesFound' || result.winnerName === 'routingFailed') {
            if (PeerID.fromValue(routedMessage.sourcePeer!.kademliaId).equals(this.ownPeerId!)) {
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
                from ${routedMessage.sourcePeer?.kademliaId} to ${routedMessage.destinationPeer?.kademliaId} is likely a duplicate`)
            return this.createRouteMessageAck(routedMessage, 'message given to routeMessage() service is likely a duplicate')
        }

        logger.trace(`Processing received routeMessage ${routedMessage.requestId}`)
        this.addNewContact(routedMessage.sourcePeer!, true)
        this.routerDuplicateDetector.add(routedMessage.requestId)

        if (this.ownPeerId!.equals(PeerID.fromValue(routedMessage.destinationPeer!.kademliaId))) {
            logger.trace(`Peer ${this.ownPeerId?.value} routing found message targeted to self ${routedMessage.requestId}`)
            if (routedMessage.reachableThrough.length > 0) {
                const sourceKey = PeerID.fromValue(routedMessage.sourcePeer!.kademliaId).toKey()
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
        from ${routedMessage.sourcePeer?.kademliaId} to ${routedMessage.destinationPeer?.kademliaId} is likely a duplicate`)
            return this.createRouteMessageAck(routedMessage, 'message given to forwardMessage() service is likely a duplicate')
        }

        logger.trace(`Processing received forward routeMessage ${routedMessage.requestId}`)
        this.addNewContact(routedMessage.sourcePeer!, true)
        this.routerDuplicateDetector.add(routedMessage.requestId)

        if (this.ownPeerId!.equals(PeerID.fromValue(routedMessage.destinationPeer!.kademliaId))) {
            logger.trace(`Peer ${this.ownPeerId?.value} forwarding found message targeted to self ${routedMessage.requestId}`)
            try {
                const forwardedMessage = RouteMessageWrapper.fromBinary(routedMessage.message)
                if (this.ownPeerId!.equals(PeerID.fromValue(forwardedMessage.destinationPeer!.kademliaId))) {
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
                            + ` ${PeerID.fromValue(forwardedMessage.destinationPeer!.kademliaId).toKey()}: ${err}`
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
