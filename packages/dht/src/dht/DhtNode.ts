import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import {
    Logger,
    MetricsContext,
    merge,
    scheduleAtInterval,
    until
} from '@streamr/utils'
import { EventEmitter } from 'eventemitter3'
import { sample } from 'lodash'
import type { MarkRequired } from 'ts-essentials'
import { ConnectionLocker, ConnectionManager, PortRange, TlsCertificate } from '../connection/ConnectionManager'
import { ConnectionsView } from '../connection/ConnectionsView'
import { DefaultConnectorFacade, DefaultConnectorFacadeOptions } from '../connection/ConnectorFacade'
import { IceServer } from '../connection/webrtc/WebrtcConnector'
import { isBrowserEnvironment } from '../helpers/browser/isBrowserEnvironment'
import { createPeerDescriptor } from '../helpers/createPeerDescriptor'
import { DhtAddress, KADEMLIA_ID_LENGTH_IN_BYTES, toNodeId } from '../identifiers'
import { Any } from '../../generated/google/protobuf/any'
import {
    ClosestPeersRequest,
    ClosestPeersResponse,
    ClosestRingPeersRequest,
    ClosestRingPeersResponse,
    ConnectivityResponse,
    DataEntry,
    ExternalFetchDataRequest,
    ExternalFetchDataResponse,
    ExternalStoreDataRequest,
    ExternalStoreDataResponse,
    LeaveNotice,
    Message,
    PeerDescriptor,
    PingRequest,
    PingResponse,
    RecursiveOperation
} from '../../generated/packages/dht/protos/DhtRpc'
import { ExternalApiRpcClient, StoreRpcClient } from '../../generated/packages/dht/protos/DhtRpc.client'
import { ITransport, TransportEvents } from '../transport/ITransport'
import { RoutingRpcCommunicator } from '../transport/RoutingRpcCommunicator'
import { ServiceID } from '../types/ServiceID'
import { DhtNodeRpcLocal } from './DhtNodeRpcLocal'
import { DhtNodeRpcRemote } from './DhtNodeRpcRemote'
import { ExternalApiRpcLocal } from './ExternalApiRpcLocal'
import { ExternalApiRpcRemote } from './ExternalApiRpcRemote'
import { PeerManager } from './PeerManager'
import { RingContacts } from './contact/RingContactList'
import { RingIdRaw } from './contact/ringIdentifiers'
import { PeerDiscovery } from './discovery/PeerDiscovery'
import { RecursiveOperationManager } from './recursive-operation/RecursiveOperationManager'
import { Router } from './routing/Router'
import { LocalDataStore } from './store/LocalDataStore'
import { StoreManager } from './store/StoreManager'
import { StoreRpcRemote } from './store/StoreRpcRemote'
import { getLocalRegionByCoordinates, getLocalRegionWithCache } from '@streamr/cdn-location'

export interface DhtNodeEvents {
    nearbyContactAdded: (peerDescriptor: PeerDescriptor) => void
    nearbyContactRemoved: (peerDescriptor: PeerDescriptor) => void
    randomContactAdded: (peerDescriptor: PeerDescriptor) => void
    randomContactRemoved: (peerDescriptor: PeerDescriptor) => void
    ringContactAdded: (peerDescriptor: PeerDescriptor) => void
    ringContactRemoved: (peerDescriptor: PeerDescriptor) => void
    manualRejoinRequired: () => void
}

export interface DhtNodeOptions {
    serviceId?: ServiceID
    joinParallelism?: number
    maxContactCount?: number
    numberOfNodesPerKBucket?: number
    joinNoProgressLimit?: number
    peerDiscoveryQueryBatchSize?: number
    dhtJoinTimeout?: number
    metricsContext?: MetricsContext
    storeHighestTtl?: number
    storeMaxTtl?: number
    networkConnectivityTimeout?: number
    storageRedundancyFactor?: number
    periodicallyPingNeighbors?: boolean
    periodicallyPingRingContacts?: boolean
    // Limit for how many new neighbors to ping. If number of neighbors is higher than the limit new neighbors 
    // are not pinged when they are added. This is to prevent flooding the network with pings when joining.
    // Enable periodicallyPingNeighbors to eventually ping all neighbors.
    neighborPingLimit?: number

    transport?: ITransport
    connectionsView?: ConnectionsView
    connectionLocker?: ConnectionLocker
    peerDescriptor?: PeerDescriptor
    entryPoints?: PeerDescriptor[]
    websocketHost?: string
    websocketPortRange?: PortRange
    websocketServerEnableTls?: boolean
    nodeId?: DhtAddress
    region?: number

    rpcRequestTimeout?: number
    iceServers?: IceServer[]
    webrtcAllowPrivateAddresses?: boolean
    webrtcDatachannelBufferThresholdLow?: number
    webrtcDatachannelBufferThresholdHigh?: number
    webrtcPortRange?: PortRange
    maxMessageSize?: number
    maxConnections?: number
    tlsCertificate?: TlsCertificate
    externalIp?: string
    autoCertifierUrl?: string
    autoCertifierConfigFile?: string
    geoIpDatabaseFolder?: string
    allowIncomingPrivateConnections?: boolean
}

type StrictDhtNodeOptions = MarkRequired<DhtNodeOptions,
    'serviceId' |
    'joinParallelism' |
    'maxContactCount' |
    'numberOfNodesPerKBucket' |
    'joinNoProgressLimit' |
    'dhtJoinTimeout' |
    'peerDiscoveryQueryBatchSize' |
    'maxConnections' |
    'storeHighestTtl' |
    'storeMaxTtl' |
    'networkConnectivityTimeout' |
    'storageRedundancyFactor' |
    'metricsContext'>

const logger = new Logger(module)

const PERIODICAL_PING_INTERVAL = 60 * 1000

// TODO move this to trackerless-network package and change serviceId to be a required paramater
export const CONTROL_LAYER_NODE_SERVICE_ID = 'layer0'

export type Events = TransportEvents & DhtNodeEvents

export class DhtNode extends EventEmitter<Events> implements ITransport {

    private readonly options: StrictDhtNodeOptions
    private rpcCommunicator?: RoutingRpcCommunicator
    private transport?: ITransport
    private localPeerDescriptor?: PeerDescriptor
    private router?: Router
    private storeManager?: StoreManager
    private localDataStore: LocalDataStore
    private recursiveOperationManager?: RecursiveOperationManager
    private peerDiscovery?: PeerDiscovery
    private peerManager?: PeerManager
    private connectionsView?: ConnectionsView
    public connectionLocker?: ConnectionLocker
    private started = false
    private abortController = new AbortController()

    constructor(conf: DhtNodeOptions) {
        super()
        this.options = merge({
            serviceId: CONTROL_LAYER_NODE_SERVICE_ID,
            joinParallelism: 3,
            maxContactCount: 200,
            numberOfNodesPerKBucket: 8,
            joinNoProgressLimit: 5,
            dhtJoinTimeout: 60000,
            peerDiscoveryQueryBatchSize: 5,
            maxConnections: 80,
            storeHighestTtl: 60000,
            storeMaxTtl: 60000,
            networkConnectivityTimeout: 10000,
            storageRedundancyFactor: 5, // TODO validate that this is > 1 (as each node should replicate the data to other node)
            metricsContext: new MetricsContext()
        }, conf)
        this.validateOptions()
        this.localDataStore = new LocalDataStore(this.options.storeMaxTtl)
        this.send = this.send.bind(this)
    }

    private validateOptions(): void {
        const expectedNodeIdLength = KADEMLIA_ID_LENGTH_IN_BYTES * 2
        if (this.options.nodeId !== undefined) {
            if (!/^[0-9a-fA-F]+$/.test(this.options.nodeId)) {
                throw new Error('Invalid nodeId, the nodeId should be a hex string')
            } else if (this.options.nodeId.length !== expectedNodeIdLength) {
                throw new Error(`Invalid nodeId, the length of the nodeId should be ${expectedNodeIdLength}`)
            }
        }
        if (this.options.peerDescriptor !== undefined) {
            if (this.options.peerDescriptor.nodeId.length !== KADEMLIA_ID_LENGTH_IN_BYTES) {
                throw new Error(`Invalid peerDescriptor, the length of the nodeId should be ${KADEMLIA_ID_LENGTH_IN_BYTES} bytes`)
            }
        }
        if (this.options.transport !== undefined && this.options.connectionsView === undefined) {
            throw new Error('connectionsView is required when transport is given')
        }
    }

    public async start(): Promise<void> {
        if (this.started || this.abortController.signal.aborted) {
            return
        }
        logger.trace(`Starting new Streamr Network DHT Node with serviceId ${this.options.serviceId}`)
        this.started = true

        if (isBrowserEnvironment()) {
            this.options.websocketPortRange = undefined
            if (this.options.peerDescriptor) {
                this.options.peerDescriptor.websocket = undefined
            }
        } 
          
        // If transport is given, do not create a ConnectionManager
        if (this.options.transport) {
            this.transport = this.options.transport
            this.connectionsView = this.options.connectionsView
            this.connectionLocker = this.options.connectionLocker
            this.localPeerDescriptor = this.transport.getLocalPeerDescriptor()
        } else {
            const connectorFacadeOptions: DefaultConnectorFacadeOptions = {
                transport: this,
                entryPoints: this.options.entryPoints,
                iceServers: this.options.iceServers,
                webrtcAllowPrivateAddresses: this.options.webrtcAllowPrivateAddresses,
                webrtcDatachannelBufferThresholdLow: this.options.webrtcDatachannelBufferThresholdLow,
                webrtcDatachannelBufferThresholdHigh: this.options.webrtcDatachannelBufferThresholdHigh,
                webrtcPortRange: this.options.webrtcPortRange,
                maxMessageSize: this.options.maxMessageSize,
                websocketServerEnableTls: this.options.websocketServerEnableTls,
                tlsCertificate: this.options.tlsCertificate,
                externalIp: this.options.externalIp,
                autoCertifierUrl: this.options.autoCertifierUrl,
                autoCertifierConfigFile: this.options.autoCertifierConfigFile,
                geoIpDatabaseFolder: this.options.geoIpDatabaseFolder,
                createLocalPeerDescriptor: (connectivityResponse: ConnectivityResponse) => this.generatePeerDescriptorCallBack(connectivityResponse)
            }
            // If own PeerDescriptor is given in options, create a ConnectionManager with ws server
            if (this.options.peerDescriptor?.websocket) {
                connectorFacadeOptions.websocketHost = this.options.peerDescriptor.websocket.host
                connectorFacadeOptions.websocketPortRange = {
                    min: this.options.peerDescriptor.websocket.port,
                    max: this.options.peerDescriptor.websocket.port
                }
                // If websocketPortRange is given, create ws server using it, websocketHost can be undefined
            } else if (this.options.websocketPortRange) {
                connectorFacadeOptions.websocketHost = this.options.websocketHost
                connectorFacadeOptions.websocketPortRange = this.options.websocketPortRange
            }

            const connectionManager = new ConnectionManager({
                createConnectorFacade: () => new DefaultConnectorFacade(connectorFacadeOptions),
                maxConnections: this.options.maxConnections,
                metricsContext: this.options.metricsContext,
                allowIncomingPrivateConnections: this.options.allowIncomingPrivateConnections ?? false
            })
            await connectionManager.start()
            this.connectionsView = connectionManager
            this.connectionLocker = connectionManager
            this.transport = connectionManager
        }

        this.rpcCommunicator = new RoutingRpcCommunicator(
            this.options.serviceId,
            (msg, opts) => this.transport!.send(msg, opts),
            { rpcRequestTimeout: this.options.rpcRequestTimeout }
        )

        this.transport.on('message', (message: Message) => this.handleMessageFromTransport(message))

        this.initPeerManager()

        this.peerDiscovery = new PeerDiscovery({
            localPeerDescriptor: this.localPeerDescriptor!,
            joinNoProgressLimit: this.options.joinNoProgressLimit,
            joinTimeout: this.options.dhtJoinTimeout,
            serviceId: this.options.serviceId,
            parallelism: this.options.joinParallelism,
            connectionLocker: this.connectionLocker,
            peerManager: this.peerManager!,
            abortSignal: this.abortController.signal,
            createDhtNodeRpcRemote: (peerDescriptor: PeerDescriptor) => this.createDhtNodeRpcRemote(peerDescriptor),
        })
        this.router = new Router({
            rpcCommunicator: this.rpcCommunicator,
            localPeerDescriptor: this.localPeerDescriptor!,
            handleMessage: (message: Message) => this.handleMessageFromRouter(message),
            getConnections: () => this.connectionsView!.getConnections()
        })
        this.recursiveOperationManager = new RecursiveOperationManager({
            rpcCommunicator: this.rpcCommunicator,
            router: this.router,
            sessionTransport: this,
            connectionsView: this.connectionsView!,
            localPeerDescriptor: this.localPeerDescriptor!,
            serviceId: this.options.serviceId,
            localDataStore: this.localDataStore,
            addContact: (contact: PeerDescriptor) => this.peerManager!.addContact(contact),
            createDhtNodeRpcRemote: (peerDescriptor: PeerDescriptor) => this.createDhtNodeRpcRemote(peerDescriptor),
        })
        this.storeManager = new StoreManager({
            rpcCommunicator: this.rpcCommunicator,
            recursiveOperationManager: this.recursiveOperationManager,
            localPeerDescriptor: this.localPeerDescriptor!,
            serviceId: this.options.serviceId,
            highestTtl: this.options.storeHighestTtl,
            redundancyFactor: this.options.storageRedundancyFactor,
            localDataStore: this.localDataStore,
            getNeighbors: () => this.peerManager!.getNeighbors().map((n) => n.getPeerDescriptor()),
            createRpcRemote: (contact: PeerDescriptor) => {
                return new StoreRpcRemote(
                    this.localPeerDescriptor!,
                    contact,
                    this.rpcCommunicator!,
                    StoreRpcClient,
                    this.options.rpcRequestTimeout
                )
            }
        })
        this.on('nearbyContactAdded', (peerDescriptor: PeerDescriptor) => {
            this.storeManager!.onContactAdded(peerDescriptor)
        })
        this.bindRpcLocalMethods()

        const pruneTargets = []
        if (this.options.periodicallyPingNeighbors === true) {
            pruneTargets.push(() => this.peerManager!.getNeighbors().map((node) => this.createDhtNodeRpcRemote(node.getPeerDescriptor())))
        }
        if (this.options.periodicallyPingRingContacts === true) {
            pruneTargets.push(() => this.peerManager!.getRingContacts().getAllContacts())
        }
        for (const pruneTarget of pruneTargets) {
            await scheduleAtInterval(
                async () => {
                    const nodes = pruneTarget()
                    await this.peerManager!.pruneOfflineNodes(nodes)
                }, PERIODICAL_PING_INTERVAL, false, this.abortController.signal
            )
        }
    }

    private initPeerManager() {
        this.peerManager = new PeerManager({
            numberOfNodesPerKBucket: this.options.numberOfNodesPerKBucket,
            maxContactCount: this.options.maxContactCount,
            localNodeId: this.getNodeId(),
            localPeerDescriptor: this.localPeerDescriptor!,
            connectionLocker: this.connectionLocker,
            lockId: this.options.serviceId,
            createDhtNodeRpcRemote: (peerDescriptor: PeerDescriptor) => this.createDhtNodeRpcRemote(peerDescriptor),
            hasConnection: (nodeId: DhtAddress) => this.connectionsView!.hasConnection(nodeId),
            neighborPingLimit: this.options.neighborPingLimit
        })
        this.peerManager.on('nearbyContactRemoved', (peerDescriptor: PeerDescriptor) => {
            this.emit('nearbyContactRemoved', peerDescriptor)
        })
        this.peerManager.on('nearbyContactAdded', (peerDescriptor: PeerDescriptor) =>
            this.emit('nearbyContactAdded', peerDescriptor)
        )
        this.peerManager.on('randomContactRemoved', (peerDescriptor: PeerDescriptor) =>
            this.emit('randomContactRemoved', peerDescriptor)
        )
        this.peerManager.on('randomContactAdded', (peerDescriptor: PeerDescriptor) =>
            this.emit('randomContactAdded', peerDescriptor)
        )
        this.peerManager.on('ringContactRemoved', (peerDescriptor: PeerDescriptor) => {
            this.emit('ringContactRemoved', peerDescriptor)
        })
        this.peerManager.on('ringContactAdded', (peerDescriptor: PeerDescriptor) => {
            this.emit('ringContactAdded', peerDescriptor)
        })
        this.peerManager.on('kBucketEmpty', () => {
            if (!this.peerDiscovery!.isJoinOngoing()) {
                if (this.options.entryPoints && this.options.entryPoints.length > 0) {
                    setImmediate(async () => {
                        const contactedPeers = new Set<DhtAddress>()
                        const distantJoinContactPeers = new Set<DhtAddress>()
                        // TODO should we catch possible promise rejection?
                        await Promise.all(this.options.entryPoints!.map((entryPoint) =>
                            this.peerDiscovery!.rejoinDht(entryPoint, contactedPeers, distantJoinContactPeers)
                        ))
                    })
                } else {
                    this.emit('manualRejoinRequired')
                }
            }
        })
        this.transport!.on('connected', (peerDescriptor: PeerDescriptor) => {
            this.router!.onNodeConnected(peerDescriptor)
            this.emit('connected', peerDescriptor)
        })
        this.transport!.on('disconnected', (peerDescriptor: PeerDescriptor, gracefulLeave: boolean) => {
            const isControlLayerNode = (this.connectionLocker !== undefined)
            if (isControlLayerNode) {
                const nodeId = toNodeId(peerDescriptor)
                if (gracefulLeave) {
                    this.peerManager!.removeContact(nodeId)
                } else {
                    this.peerManager!.removeNeighbor(nodeId)
                }
            }
            this.router!.onNodeDisconnected(peerDescriptor)
            this.emit('disconnected', peerDescriptor, gracefulLeave)
        })
    }

    private bindRpcLocalMethods(): void {
        if (!this.started || this.abortController.signal.aborted) {
            return
        }
        const dhtNodeRpcLocal = new DhtNodeRpcLocal({
            peerDiscoveryQueryBatchSize: this.options.peerDiscoveryQueryBatchSize,
            getNeighbors: () => this.peerManager!.getNeighbors().map((n) => n.getPeerDescriptor()),
            getClosestRingContactsTo: (ringIdRaw: RingIdRaw, limit: number) => {
                return this.getClosestRingContactsTo(ringIdRaw, limit)
            },
            addContact: (contact: PeerDescriptor) => this.peerManager!.addContact(contact),
            removeContact: (nodeId: DhtAddress) => this.removeContact(nodeId)
        })
        this.rpcCommunicator!.registerRpcMethod(ClosestPeersRequest, ClosestPeersResponse, 'getClosestPeers',
            (req: ClosestPeersRequest, context) => dhtNodeRpcLocal.getClosestPeers(req, context))
        this.rpcCommunicator!.registerRpcMethod(ClosestRingPeersRequest, ClosestRingPeersResponse, 'getClosestRingPeers',
            (req: ClosestRingPeersRequest, context) => dhtNodeRpcLocal.getClosestRingPeers(req, context))
        this.rpcCommunicator!.registerRpcMethod(PingRequest, PingResponse, 'ping',
            (req: PingRequest, context) => dhtNodeRpcLocal.ping(req, context))
        this.rpcCommunicator!.registerRpcNotification(LeaveNotice, 'leaveNotice',
            (_req: LeaveNotice, context) => dhtNodeRpcLocal.leaveNotice(context))
        const externalApiRpcLocal = new ExternalApiRpcLocal({
            executeRecursiveOperation: (key: DhtAddress, operation: RecursiveOperation, excludedPeer: DhtAddress) => {
                return this.recursiveOperationManager!.execute(key, operation, excludedPeer)
            },
            storeDataToDht: (key: DhtAddress, data: Any, creator?: DhtAddress) => this.storeDataToDht(key, data, creator)
        })
        this.rpcCommunicator!.registerRpcMethod(
            ExternalFetchDataRequest,
            ExternalFetchDataResponse,
            'externalFetchData',
            (req: ExternalFetchDataRequest, context: ServerCallContext) => externalApiRpcLocal.externalFetchData(req, context),
            { timeout: 10000 }  // TODO use options option or named constant?
        )
        this.rpcCommunicator!.registerRpcMethod(
            ExternalStoreDataRequest,
            ExternalStoreDataResponse,
            'externalStoreData',
            (req: ExternalStoreDataRequest, context: ServerCallContext) => externalApiRpcLocal.externalStoreData(req, context),
            { timeout: 10000 }  // TODO use options option or named constant?
        )
    }

    private handleMessageFromTransport(message: Message): void {
        if (message.serviceId === this.options.serviceId) {
            this.rpcCommunicator?.handleMessageFromPeer(message)
        } 
    }
    
    private handleMessageFromRouter(message: Message): void {
        if (message.serviceId === this.options.serviceId) {
            this.rpcCommunicator?.handleMessageFromPeer(message)
        } else {
            this.emit('message', message)
        }
    }

    private async generatePeerDescriptorCallBack(connectivityResponse: ConnectivityResponse) {
        if (this.options.peerDescriptor !== undefined) {
            this.localPeerDescriptor = this.options.peerDescriptor
        } else {
            let region: number | undefined = undefined
            if (this.options.region !== undefined) {
                region = this.options.region
                logger.debug(`Using region ${region} from options when generating local PeerDescriptor`)
            } else if (connectivityResponse.latitude !== undefined && connectivityResponse.longitude !== undefined) {
                region = getLocalRegionByCoordinates(connectivityResponse.latitude, connectivityResponse.longitude)
                logger.debug(`Using region ${region} from GeoIP when generating local PeerDescriptor`)
            } else {
                // as a fallback get the region from the CDN
                // and if it's not available, use a random region
                region = await getLocalRegionWithCache()
                logger.debug(`Using region ${region} from CDN when generating local PeerDescriptor`)
            }
            
            this.localPeerDescriptor = createPeerDescriptor(connectivityResponse, region, this.options.nodeId)
        }
        return this.localPeerDescriptor
    }

    public getClosestContacts(limit?: number): PeerDescriptor[] {
        return this.peerManager!.getNearbyContacts()
            .getClosestContacts(limit)
            .map((peer) => peer.getPeerDescriptor())
    }

    getRandomContacts(limit?: number): PeerDescriptor[] {
        return this.peerManager!.getRandomContacts().getContacts(limit).map((c) => c.getPeerDescriptor())
    }

    getRingContacts(): RingContacts {
        const contacts = this.peerManager!.getRingContacts().getClosestContacts()
        return {
            left: contacts.left.map((c) => c.getPeerDescriptor()),
            right: contacts.right.map((c) => c.getPeerDescriptor())
        }
    }

    public getClosestRingContactsTo(ringIdRaw: RingIdRaw, limit?: number): RingContacts {
        const closest = this.peerManager!.getClosestRingContactsTo(ringIdRaw, limit)
        return {
            left: closest.left.map((dhtPeer: DhtNodeRpcRemote) => dhtPeer.getPeerDescriptor()),
            right: closest.right.map((dhtPeer: DhtNodeRpcRemote) => dhtPeer.getPeerDescriptor())
        }
    }

    public getNodeId(): DhtAddress {
        return toNodeId(this.localPeerDescriptor!)
    }

    public getNeighborCount(): number {
        return this.peerManager!.getNeighborCount()
    }

    public removeContact(nodeId: DhtAddress): void {
        if (!this.started) {  // the stopped state is checked in PeerManager
            return
        }
        this.peerManager!.removeContact(nodeId)
    }

    public async send(msg: Message): Promise<void> {
        if (!this.started || this.abortController.signal.aborted) {
            return
        }
        const reachableThrough = this.peerDiscovery!.isJoinOngoing() ? this.getConnectedEntryPoints() : []
        this.router!.send(msg, reachableThrough)
    }

    private getConnectedEntryPoints(): PeerDescriptor[] {
        return this.options.entryPoints !== undefined ? this.options.entryPoints.filter((entryPoint) =>
            this.connectionsView!.hasConnection(toNodeId(entryPoint))
        ) : []
    }

    public async joinDht(entryPointDescriptors: PeerDescriptor[], doAdditionalDistantPeerDiscovery?: boolean, retry?: boolean): Promise<void> {
        if (!this.started) {
            throw new Error('Cannot join DHT before calling start() on DhtNode')
        }
        await this.peerDiscovery!.joinDht(entryPointDescriptors, doAdditionalDistantPeerDiscovery, retry)
    }

    public async joinRing(): Promise<void> {
        if (!this.started) {
            throw new Error('Cannot join ring before calling start() on DhtNode')
        }
        await this.peerDiscovery!.joinRing()
    }

    public async storeDataToDht(key: DhtAddress, data: Any, creator?: DhtAddress): Promise<PeerDescriptor[]> {
        const connectedEntryPoints = this.getConnectedEntryPoints()
        if (this.peerDiscovery!.isJoinOngoing() && connectedEntryPoints.length > 0) {
            return this.storeDataToDhtViaPeer(key, data, sample(connectedEntryPoints)!)
        }
        return this.storeManager!.storeDataToDht(key, data, creator ?? this.getNodeId())
    }

    public async storeDataToDhtViaPeer(key: DhtAddress, data: Any, peer: PeerDescriptor): Promise<PeerDescriptor[]> {
        const rpcRemote = new ExternalApiRpcRemote(
            this.localPeerDescriptor!,
            peer,
            this.rpcCommunicator!,
            ExternalApiRpcClient
        )
        return await rpcRemote.storeData(key, data)
    }

    public async fetchDataFromDht(key: DhtAddress): Promise<DataEntry[]> {
        const connectedEntryPoints = this.getConnectedEntryPoints()
        if (this.peerDiscovery!.isJoinOngoing() && connectedEntryPoints.length > 0) {
            return this.fetchDataFromDhtViaPeer(key, sample(connectedEntryPoints)!)
        }
        const result = await this.recursiveOperationManager!.execute(key, RecursiveOperation.FETCH_DATA)
        return result.dataEntries ?? []  // TODO is this fallback needed?
    }

    public async fetchDataFromDhtViaPeer(key: DhtAddress, peer: PeerDescriptor): Promise<DataEntry[]> {
        const rpcRemote = new ExternalApiRpcRemote(
            this.localPeerDescriptor!,
            peer,
            this.rpcCommunicator!,
            ExternalApiRpcClient
        )
        return await rpcRemote.externalFetchData(key)
    }

    public async deleteDataFromDht(key: DhtAddress, waitForCompletion: boolean): Promise<void> {
        if (!this.abortController.signal.aborted) {
            await this.recursiveOperationManager!.execute(key, RecursiveOperation.DELETE_DATA, undefined, waitForCompletion)
        }
    }

    async findClosestNodesFromDht(key: DhtAddress): Promise<PeerDescriptor[]> {
        const result = await this.recursiveOperationManager!.execute(key, RecursiveOperation.FIND_CLOSEST_NODES)
        return result.closestNodes
    }

    public getTransport(): ITransport {
        return this.transport!
    }

    public getLocalPeerDescriptor(): PeerDescriptor {
        return this.localPeerDescriptor!
    }

    public getNeighbors(): PeerDescriptor[] {
        return this.started ? this.peerManager!.getNeighbors().map((remote: DhtNodeRpcRemote) => remote.getPeerDescriptor()) : []
    }

    getConnectionsView(): ConnectionsView {
        return this.connectionsView!
    }

    public getLocalLockedConnectionCount(): number {
        return this.connectionLocker!.getLocalLockedConnectionCount()
    }

    public getRemoteLockedConnectionCount(): number {
        return this.connectionLocker!.getRemoteLockedConnectionCount()
    }

    public getWeakLockedConnectionCount(): number {
        return this.connectionLocker!.getWeakLockedConnectionCount()
    }
 
    public async waitForNetworkConnectivity(): Promise<void> {
        await until(
            () => this.connectionsView!.getConnectionCount() > 0,
            this.options.networkConnectivityTimeout,
            100,
            this.abortController.signal
        )
    }

    public hasJoined(): boolean {
        return this.peerDiscovery!.isJoinCalled()
    }

    public getDiagnosticInfo(): Record<string, unknown> {
        return {
            localPeerDescriptor: this.localPeerDescriptor,
            transport: this.transport!.getDiagnosticInfo(),
            router: this.router!.getDiagnosticInfo(),
            neighborCount: this.getNeighborCount(),
            nearbyContactCount: Array.from(this.peerManager!.getNearbyContacts().getAllContactsInUndefinedOrder()).length,
            randomContactCount: this.peerManager!.getRandomContacts().getSize()
        }
    }

    public async stop(): Promise<void> {
        if (this.abortController.signal.aborted || !this.started) {
            return
        }
        logger.trace('stop()')
        this.abortController.abort()
        await this.storeManager!.destroy()
        this.localDataStore.clear()
        this.peerManager?.stop()
        this.rpcCommunicator!.stop()
        this.router!.stop()
        this.recursiveOperationManager!.stop()
        if (this.options.transport === undefined) {
            // if the transport was not given in options, the instance was created in start() and
            // this component is responsible for stopping it
            await this.transport!.stop()
        }
        this.transport = undefined
        this.connectionLocker = undefined
        this.removeAllListeners()
    }

    private createDhtNodeRpcRemote(peerDescriptor: PeerDescriptor) {
        return new DhtNodeRpcRemote(
            this.localPeerDescriptor!,
            peerDescriptor,
            this.options.serviceId,
            this.rpcCommunicator!,
            this.options.rpcRequestTimeout
        )
    }
}
