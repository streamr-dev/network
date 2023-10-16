/* eslint-disable @typescript-eslint/ban-ts-comment */

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
    DataEntry,
} from '../proto/packages/dht/protos/DhtRpc'
import { DisconnectionType, ITransport, TransportEvents } from '../transport/ITransport'
import { ConnectionManager, ConnectionManagerConfig, PortRange, TlsCertificate } from '../connection/ConnectionManager'
import { DhtRpcServiceClient, ExternalApiServiceClient } from '../proto/packages/dht/protos/DhtRpc.client'
import {
    Logger,
    MetricsContext,
    hexToBinary,
    binaryToHex,
    waitForCondition
} from '@streamr/utils'
import { toProtoRpcClient } from '@streamr/proto-rpc'
import { Empty } from '../proto/google/protobuf/empty'
import { DhtCallContext } from '../rpc-protocol/DhtCallContext'
import { Any } from '../proto/google/protobuf/any'
import { isSamePeerDescriptor, peerIdFromPeerDescriptor } from '../helpers/peerIdFromPeerDescriptor'
import { Router } from './routing/Router'
import { RecursiveFinder, RecursiveFindResult } from './find/RecursiveFinder'
import { DataStore } from './store/DataStore'
import { PeerDiscovery } from './discovery/PeerDiscovery'
import { LocalDataStore } from './store/LocalDataStore'
import { IceServer } from '../connection/WebRTC/WebRtcConnector'
import { registerExternalApiRpcMethods } from './registerExternalApiRpcMethods'
import { RemoteExternalApi } from './RemoteExternalApi'
import { PeerManager } from './PeerManager'
import { UUID } from '../helpers/UUID'
import { isNodeJS } from '../helpers/browser/isNodeJS'
import { getTI } from '@streamr/test-utils'
import { sample } from 'lodash'

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
    joinParallelism?: number
    maxNeighborListSize?: number
    numberOfNodesPerKBucket?: number
    joinNoProgressLimit?: number
    dhtJoinTimeout?: number
    metricsContext?: MetricsContext
    storeHighestTtl?: number
    storeMaxTtl?: number
    networkConnectivityTimeout?: number

    transportLayer?: ITransport
    peerDescriptor?: PeerDescriptor
    entryPoints?: PeerDescriptor[]
    websocketHost?: string
    websocketPortRange?: PortRange
    peerId?: string

    nodeName?: string
    rpcRequestTimeout?: number
    iceServers?: IceServer[]
    webrtcAllowPrivateAddresses?: boolean
    webrtcDatachannelBufferThresholdLow?: number
    webrtcDatachannelBufferThresholdHigh?: number
    webrtcNewConnectionTimeout?: number
    webrtcPortRange?: PortRange
    maxConnections?: number
    tlsCertificate?: TlsCertificate
    externalIp?: string
}

export class DhtNodeConfig {
    serviceId = 'layer0'
    joinParallelism = 3
    maxNeighborListSize = 200
    numberOfNodesPerKBucket = 8
    joinNoProgressLimit = 4
    dhtJoinTimeout = 60000
    getClosestContactsLimit = 5
    maxConnections = 80
    storeHighestTtl = 60000
    storeMaxTtl = 60000
    networkConnectivityTimeout = 10000
    storeNumberOfCopies = 5
    metricsContext = new MetricsContext()
    peerId = new UUID().toHex()

    transportLayer?: ITransport
    peerDescriptor?: PeerDescriptor
    entryPoints?: PeerDescriptor[]
    websocketHost?: string
    websocketPortRange?: PortRange
    nodeName?: string
    rpcRequestTimeout?: number
    iceServers?: IceServer[]
    webrtcAllowPrivateAddresses?: boolean
    webrtcDatachannelBufferThresholdLow?: number
    webrtcDatachannelBufferThresholdHigh?: number
    webrtcNewConnectionTimeout?: number
    externalIp?: string
    webrtcPortRange?: PortRange
    tlsCertificate?: TlsCertificate

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

export const createPeerDescriptor = (msg?: ConnectivityResponse, peerId?: string, nodeName?: string): PeerDescriptor => {
    let kademliaId: Uint8Array
    if (msg) {
        kademliaId = peerId ? hexToBinary(peerId) : PeerID.fromIp(msg.host).value
    } else {
        kademliaId = hexToBinary(peerId!)
    }
    const nodeType = isNodeJS() ? NodeType.NODEJS : NodeType.BROWSER
    const ret: PeerDescriptor = { kademliaId, nodeName: nodeName ? nodeName : binaryToHex(kademliaId), type: nodeType }
    if (msg && msg.websocket) {
        ret.websocket = { host: msg.websocket.host, port: msg.websocket.port, tls: msg.websocket.tls }
        ret.openInternet = true
    }
    return ret
}

interface IDhtNodeTest {
    getNeighborList: () => SortedContactList<DhtPeer>
    getKBucketPeers: () => PeerDescriptor[]
    getConnections: () => Map<PeerIDKey, DhtPeer>
    getBucketSize: () => number
}

export class DhtNode extends EventEmitter<Events> implements ITransport {
    private readonly config: DhtNodeConfig

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
    private peerManager?: PeerManager

    private started = false
    private abortController = new AbortController()
    private entryPointDisconnectTimeout?: NodeJS.Timeout

    public contactAddCounter = 0
    public contactOnAddedCounter = 0

    private testInterface: IDhtNodeTest = {
        getConnections: () => { return this.peerManager!.connections },
        getNeighborList: () => { return getTI(this.peerManager!)!.getNeighborList() },
        getKBucketPeers: () => { return getTI(this.peerManager!)!.getKBucketPeers() },
        getBucketSize: () => { return getTI(this.peerManager!)!.getKBucketSize() }
    }
    public testInterfaceType?: IDhtNodeTest

    constructor(conf: Partial<DhtNodeConfig>) {
        super()
        this.config = new DhtNodeConfig(conf)
        this.send = this.send.bind(this)
    }

    public async start(): Promise<void> {
        if (this.started || this.abortController.signal.aborted) {
            return
        }
        logger.trace(`Starting new Streamr Network DHT Node with serviceId ${this.config.serviceId}`)
        this.started = true

        if (!isNodeJS()) {
            this.config.websocketPortRange = undefined
            if (this.config.peerDescriptor) {
                this.config.peerDescriptor.websocket = undefined
            }
        }
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
                webrtcAllowPrivateAddresses: this.config.webrtcAllowPrivateAddresses,
                webrtcDatachannelBufferThresholdLow: this.config.webrtcDatachannelBufferThresholdLow,
                webrtcDatachannelBufferThresholdHigh: this.config.webrtcDatachannelBufferThresholdHigh,
                webrtcNewConnectionTimeout: this.config.webrtcNewConnectionTimeout,
                webrtcPortRange: this.config.webrtcPortRange,
                maxConnections: this.config.maxConnections,
                tlsCertificate: this.config.tlsCertificate,
                externalIp: this.config.externalIp
            }
            // If own PeerDescriptor is given in config, create a ConnectionManager with ws server
            if (this.config.peerDescriptor?.websocket) {
                connectionManagerConfig.websocketHost = this.config.peerDescriptor.websocket.host
                connectionManagerConfig.websocketPortRange = {
                    min: this.config.peerDescriptor.websocket.port,
                    max: this.config.peerDescriptor.websocket.port
                }
                // If websocketPortRange is given, create ws server using it, websocketHost can be undefined
            } else if (this.config.websocketPortRange) {
                connectionManagerConfig.websocketHost = this.config.websocketHost
                connectionManagerConfig.websocketPortRange = this.config.websocketPortRange
            }

            this.connectionManager = new ConnectionManager(connectionManagerConfig)
            await this.connectionManager.start(this.generatePeerDescriptorCallBack)
            this.transportLayer = this.connectionManager
        }

        this.rpcCommunicator = new RoutingRpcCommunicator(
            this.config.serviceId,
            this.transportLayer.send,
            { rpcRequestTimeout: this.config.rpcRequestTimeout }
        )

        this.transportLayer.on('message', (message: Message) => this.handleMessage(message))

        this.bindDefaultServerMethods()
        this.ownPeerId = peerIdFromPeerDescriptor(this.ownPeerDescriptor!)

        this.initPeerManager(this.ownPeerId!)

        this.peerDiscovery = new PeerDiscovery({
            ownPeerDescriptor: this.ownPeerDescriptor!,
            joinNoProgressLimit: this.config.joinNoProgressLimit,
            getClosestContactsLimit: this.config.getClosestContactsLimit,
            joinTimeout: this.config.dhtJoinTimeout,
            serviceId: this.config.serviceId,
            parallelism: this.config.joinParallelism,
            peerManager: this.peerManager!
        })
        this.router = new Router({
            rpcCommunicator: this.rpcCommunicator!,
            connections: this.peerManager!.connections,
            ownPeerDescriptor: this.ownPeerDescriptor!,
            ownPeerId: this.ownPeerId!,
            addContact: (peerDescriptor: PeerDescriptor, setActive?: boolean | undefined) => {
                this.peerManager!.handleNewPeers([peerDescriptor], setActive)
            },
            serviceId: this.config.serviceId,
            connectionManager: this.connectionManager
        })
        this.recursiveFinder = new RecursiveFinder({
            rpcCommunicator: this.rpcCommunicator,
            router: this.router,
            sessionTransport: this,
            connections: this.peerManager!.connections,
            ownPeerDescriptor: this.ownPeerDescriptor!,
            serviceId: this.config.serviceId,
            ownPeerId: this.ownPeerId!,
            addContact: (peerDescriptor: PeerDescriptor, setActive?: boolean | undefined) => {
                this.peerManager!.handleNewPeers([peerDescriptor], setActive)
            },
            isPeerCloserToIdThanSelf: this.isPeerCloserToIdThanSelf.bind(this),
            localDataStore: this.localDataStore
        })
        this.dataStore = new DataStore({
            rpcCommunicator: this.rpcCommunicator,
            recursiveFinder: this.recursiveFinder,
            ownPeerDescriptor: this.ownPeerDescriptor!,
            serviceId: this.config.serviceId,
            highestTtl: this.config.storeHighestTtl,
            maxTtl: this.config.storeMaxTtl,
            numberOfCopies: this.config.storeNumberOfCopies,
            localDataStore: this.localDataStore,
            dhtNodeEmitter: this,
            getNodesClosestToIdFromBucket: (id: Uint8Array, n?: number) => {
                return this.peerManager!.getClosestPeersTo(id, n)
            }
        })
        registerExternalApiRpcMethods(this)
        if (this.connectionManager! && this.config.entryPoints && this.config.entryPoints.length > 0
            && !isSamePeerDescriptor(this.config.entryPoints[0], this.ownPeerDescriptor!)) {
            this.connectToEntryPoint(this.config.entryPoints[0])
        }
    }

    private initPeerManager = (selfId: PeerID) => {
        this.peerManager = new PeerManager({
            numberOfNodesPerKBucket: this.config.numberOfNodesPerKBucket,
            maxNeighborListSize: this.config.maxNeighborListSize,
            ownPeerId: selfId,
            connectionManager: this.connectionManager!,
            nodeName: this.config.nodeName!,
            getClosestContactsLimit: this.config.getClosestContactsLimit,
            createDhtPeer: this.createDhtPeer.bind(this)
        })

        this.peerManager.on('contactRemoved', (peerDescriptor: PeerDescriptor, activeContacts: PeerDescriptor[]) => {
            this.emit('contactRemoved', peerDescriptor, activeContacts)
        })
        this.peerManager.on('newContact', (peerDescriptor: PeerDescriptor, activeContacts: PeerDescriptor[]) =>
            this.emit('newContact', peerDescriptor, activeContacts)
        )
        this.peerManager.on('openInternetContactRemoved', (peerDescriptor: PeerDescriptor, activeContacts: PeerDescriptor[]) =>
            this.emit('openInternetContactRemoved', peerDescriptor, activeContacts)
        )
        this.peerManager.on('newOpenInternetContact', (peerDescriptor: PeerDescriptor, activeContacts: PeerDescriptor[]) =>
            this.emit('newOpenInternetContact', peerDescriptor, activeContacts)
        )
        this.peerManager.on('randomContactRemoved', (peerDescriptor: PeerDescriptor, activeContacts: PeerDescriptor[]) =>
            this.emit('randomContactRemoved', peerDescriptor, activeContacts)
        )
        this.peerManager.on('newRandomContact', (peerDescriptor: PeerDescriptor, activeContacts: PeerDescriptor[]) =>
            this.emit('newRandomContact', peerDescriptor, activeContacts)
        )
        this.peerManager.on('kBucketEmpty', () => {
            if (!this.peerDiscovery!.isJoinOngoing()
                && this.config.entryPoints
                && this.config.entryPoints.length > 0
            ) {
                setImmediate(async () => {
                    await Promise.all(this.config.entryPoints!.map((entryPoint) =>
                        this.peerDiscovery!.rejoinDht(entryPoint)
                    ))
                })
            }

        })
        this.transportLayer!.on('connected', (peerDescriptor: PeerDescriptor) => {
            this.peerManager!.handleConnected(peerDescriptor)
            this.emit('connected', peerDescriptor)
        })
        this.transportLayer!.on('disconnected', (peerDescriptor: PeerDescriptor, disonnectionType: DisconnectionType) => {
            this.peerManager?.handleDisconnected(peerDescriptor, disonnectionType, this.connectionManager ? true : false)
            this.emit('disconnected', peerDescriptor, disonnectionType)
        })
        this.transportLayer!.getAllConnectionPeerDescriptors().map((peerDescriptor) => {
            this.peerManager!.handleConnected(peerDescriptor)
        })
    }

    private bindDefaultServerMethods(): void {
        if (!this.started || this.abortController.signal.aborted) {
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
        const distance1 = KBucket.distance(peer1.kademliaId, compareToId.value)
        const distance2 = KBucket.distance(this.ownPeerDescriptor!.kademliaId, compareToId.value)
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
                this.config.peerId,
                this.config.nodeName)
        }
        return this.ownPeerDescriptor
    }

    private getClosestPeerDescriptors(kademliaId: Uint8Array, limit: number): PeerDescriptor[] {
        const closestPeers = this.peerManager!.getClosestPeersTo(kademliaId, limit)
        return closestPeers.map((dhtPeer: DhtPeer) => dhtPeer.getPeerDescriptor())
    }

    public getNodeId(): PeerID {
        return this.ownPeerId!
    }

    private connectToEntryPoint(entryPoint: PeerDescriptor): void {
        this.connectionManager!.lockConnection(entryPoint, 'temporary-layer0-connection')
        this.entryPointDisconnectTimeout = setTimeout(() => {
            this.connectionManager!.unlockConnection(entryPoint, 'temporary-layer0-connection')
        }, 10 * 1000)
    }

    public async send(msg: Message, _doNotConnect?: boolean): Promise<void> {
        if (!this.started || this.abortController.signal.aborted) {
            return
        }
        const reachableThrough = this.peerDiscovery!.isJoinOngoing() ? this.config.entryPoints || [] : []
        await this.router!.send(msg, reachableThrough)
    }

    public async joinDht(entryPointDescriptors: PeerDescriptor[], doRandomJoin?: boolean, retry?: boolean): Promise<void> {
        if (!this.started) {
            throw new Error('Cannot join DHT before calling start() on DhtNode')
        }
        await Promise.all(entryPointDescriptors.map((entryPoint) =>
            this.peerDiscovery!.joinDht(entryPoint, doRandomJoin, retry)
        ))
    }

    public async startRecursiveFind(idToFind: Uint8Array, findMode?: FindMode, excludedPeer?: PeerDescriptor): Promise<RecursiveFindResult> {
        return this.recursiveFinder!.startRecursiveFind(idToFind, findMode, excludedPeer)
    }

    public async storeDataToDht(key: Uint8Array, data: Any): Promise<PeerDescriptor[]> {
        if (this.isJoinOngoing() && this.config.entryPoints && this.config.entryPoints.length > 0) {
            return this.storeDataViaPeer(key, data, sample(this.config.entryPoints)!)
        }
        return this.dataStore!.storeDataToDht(key, data)
    }

    public async storeDataViaPeer(key: Uint8Array, data: Any, peer: PeerDescriptor): Promise<PeerDescriptor[]> {
        const target = new RemoteExternalApi(
            this.ownPeerDescriptor!,
            peer,
            this.config.serviceId,
            toProtoRpcClient(new ExternalApiServiceClient(this.rpcCommunicator!.getRpcClientTransport()))
        )
        return await target.storeData(key, data)
    }

    public async getDataFromDht(idToFind: Uint8Array): Promise<RecursiveFindResult> {
        return this.recursiveFinder!.startRecursiveFind(idToFind, FindMode.DATA)
    }

    public async deleteDataFromDht(idToDelete: Uint8Array): Promise<void> {
        if (!this.abortController.signal.aborted) {
            return this.dataStore!.deleteDataFromDht(idToDelete)
        }
    }

    public async findDataViaPeer(idToFind: Uint8Array, peer: PeerDescriptor): Promise<DataEntry[]> {
        const target = new RemoteExternalApi(
            this.ownPeerDescriptor!,
            peer,
            this.config.serviceId,
            toProtoRpcClient(new ExternalApiServiceClient(this.rpcCommunicator!.getRpcClientTransport()))
        )
        return await target.findData(idToFind)
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
        return Array.from(this.peerManager!.connections.values()).map((peer) => peer.getPeerDescriptor())
    }

    public getK(): number {
        return this.config.numberOfNodesPerKBucket
    }

    /*
    public getOpenInternetPeerDescriptors(): PeerDescriptor[] {
        return this.openInternetPeers!.getAllContacts().map((contact) => contact.getPeerDescriptor())
    }
    */

    public getNumberOfConnections(): number {
        return this.peerManager!.connections.size
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

    public async waitForNetworkConnectivity(): Promise<void> {
        await waitForCondition(() => {
            if (!this.peerManager) {
                return false
            } else {
                return (this.peerManager.getNumberOfPeers() > 0)
            }
        }, this.config.networkConnectivityTimeout, 100, this.abortController.signal)
    }

    public isJoinOngoing(): boolean {
        return this.peerDiscovery!.isJoinOngoing()
    }

    public hasJoined(): boolean {
        return this.peerDiscovery!.isJoinCalled()
    }

    public getKnownEntryPoints(): PeerDescriptor[] {
        return this.config.entryPoints || []
    }

    private createDhtPeer(peerDescriptor: PeerDescriptor): DhtPeer {
        return new DhtPeer(
            this.ownPeerDescriptor!,
            peerDescriptor,
            toProtoRpcClient(new DhtRpcServiceClient(this.rpcCommunicator!.getRpcClientTransport())),
            this.config.serviceId
        )
    }

    public getClosestContacts(limit?: number): PeerDescriptor[] {
        return this.peerManager!.getClosestPeersTo(this.ownPeerDescriptor!.kademliaId, limit).map((peer) => peer.getPeerDescriptor())
    }

    public getNumberOfContacts(): number {
        return this.peerManager!.getNumberOfPeers()
    }

    public async stop(): Promise<void> {
        if (this.abortController.signal.aborted || !this.started) {
            return
        }
        logger.trace('stop()')
        this.abortController.abort()

        if (this.entryPointDisconnectTimeout) {
            clearTimeout(this.entryPointDisconnectTimeout)
        }

        this.peerManager!.stop()
        this.localDataStore.clear()
        this.rpcCommunicator!.stop()
        this.router!.stop()
        this.recursiveFinder!.stop()
        this.peerDiscovery!.stop()
        if (this.connectionManager) {
            await this.connectionManager.stop()
        }
        this.transportLayer = undefined
        this.connectionManager = undefined

        this.removeAllListeners()
    }

    // IDHTRpcService implementation
    private async getClosestPeers(request: ClosestPeersRequest, context: ServerCallContext): Promise<ClosestPeersResponse> {
        this.peerManager?.handleNewPeers([(context as DhtCallContext).incomingSourceDescriptor!], true)
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
            this.peerManager?.handleNewPeers([(context as DhtCallContext).incomingSourceDescriptor!], true)
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
            this.peerManager!.handlePeerLeaving((context as DhtCallContext).incomingSourceDescriptor!, false)
        }
        return {}
    }

    public removeContact(peerDescriptor: PeerDescriptor, removeFromOpenInternetPeers?: boolean): void {
        this.peerManager!.handlePeerLeaving(peerDescriptor, removeFromOpenInternetPeers)
    }
}

