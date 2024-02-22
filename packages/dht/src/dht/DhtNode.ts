import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import {
    Logger,
    MetricsContext,
    merge,
    waitForCondition
} from '@streamr/utils'
import { EventEmitter } from 'eventemitter3'
import { sample } from 'lodash'
import { MarkRequired } from 'ts-essentials'
import { ConnectionManager, PortRange, TlsCertificate } from '../connection/ConnectionManager'
import { DefaultConnectorFacade, DefaultConnectorFacadeConfig } from '../connection/ConnectorFacade'
import { IceServer } from '../connection/webrtc/WebrtcConnector'
import { isBrowserEnvironment } from '../helpers/browser/isBrowserEnvironment'
import { DhtAddress, KADEMLIA_ID_LENGTH_IN_BYTES, getNodeIdFromPeerDescriptor } from '../identifiers'
import { Any } from '../proto/google/protobuf/any'
import {
    ClosestPeersRequest,
    ClosestPeersResponse,
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
} from '../proto/packages/dht/protos/DhtRpc'
import { ExternalApiRpcClient, StoreRpcClient } from '../proto/packages/dht/protos/DhtRpc.client'
import { ITransport, TransportEvents } from '../transport/ITransport'
import { RoutingRpcCommunicator } from '../transport/RoutingRpcCommunicator'
import { ServiceID } from '../types/ServiceID'
import { DhtNodeRpcLocal } from './DhtNodeRpcLocal'
import { DhtNodeRpcRemote } from './DhtNodeRpcRemote'
import { ExternalApiRpcLocal } from './ExternalApiRpcLocal'
import { ExternalApiRpcRemote } from './ExternalApiRpcRemote'
import { PeerManager } from './PeerManager'
import { PeerDiscovery } from './discovery/PeerDiscovery'
import { RecursiveOperationManager } from './recursive-operation/RecursiveOperationManager'
import { Router } from './routing/Router'
import { LocalDataStore } from './store/LocalDataStore'
import { StoreManager } from './store/StoreManager'
import { StoreRpcRemote } from './store/StoreRpcRemote'
import { createPeerDescriptor } from '../helpers/createPeerDescriptor'

export interface DhtNodeEvents {
    contactAdded: (peerDescriptor: PeerDescriptor, closestPeers: PeerDescriptor[]) => void
    contactRemoved: (peerDescriptor: PeerDescriptor, closestPeers: PeerDescriptor[]) => void
    randomContactAdded: (peerDescriptor: PeerDescriptor, closestPeers: PeerDescriptor[]) => void
    randomContactRemoved: (peerDescriptor: PeerDescriptor, closestPeers: PeerDescriptor[]) => void
}

export interface DhtNodeOptions {
    serviceId?: ServiceID
    joinParallelism?: number
    maxNeighborListSize?: number
    numberOfNodesPerKBucket?: number
    joinNoProgressLimit?: number
    peerDiscoveryQueryBatchSize?: number
    dhtJoinTimeout?: number
    metricsContext?: MetricsContext
    storeHighestTtl?: number
    storeMaxTtl?: number
    networkConnectivityTimeout?: number
    storageRedundancyFactor?: number

    transport?: ITransport
    peerDescriptor?: PeerDescriptor
    entryPoints?: PeerDescriptor[]
    websocketHost?: string
    websocketPortRange?: PortRange
    websocketServerEnableTls?: boolean
    nodeId?: DhtAddress

    rpcRequestTimeout?: number
    iceServers?: IceServer[]
    webrtcAllowPrivateAddresses?: boolean
    webrtcDatachannelBufferThresholdLow?: number
    webrtcDatachannelBufferThresholdHigh?: number
    webrtcNewConnectionTimeout?: number
    webrtcPortRange?: PortRange
    maxMessageSize?: number
    maxConnections?: number
    tlsCertificate?: TlsCertificate
    externalIp?: string
    autoCertifierUrl?: string
    autoCertifierConfigFile?: string
}

type StrictDhtNodeOptions = MarkRequired<DhtNodeOptions,
    'serviceId' |
    'joinParallelism' |
    'maxNeighborListSize' |
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

export type Events = TransportEvents & DhtNodeEvents

export class DhtNode extends EventEmitter<Events> implements ITransport {

    private readonly config: StrictDhtNodeOptions
    private rpcCommunicator?: RoutingRpcCommunicator
    private transport?: ITransport
    private localPeerDescriptor?: PeerDescriptor
    public router?: Router
    private storeManager?: StoreManager
    private localDataStore: LocalDataStore
    private recursiveOperationManager?: RecursiveOperationManager
    private peerDiscovery?: PeerDiscovery
    private peerManager?: PeerManager
    public connectionManager?: ConnectionManager
    private started = false
    private abortController = new AbortController()

    constructor(conf: DhtNodeOptions) {
        super()
        this.config = merge({
            serviceId: 'layer0',
            joinParallelism: 3,
            maxNeighborListSize: 200,
            numberOfNodesPerKBucket: 8,
            joinNoProgressLimit: 5,
            dhtJoinTimeout: 60000,
            peerDiscoveryQueryBatchSize: 5,
            maxConnections: 80,
            storeHighestTtl: 60000,
            storeMaxTtl: 60000,
            networkConnectivityTimeout: 10000,
            storageRedundancyFactor: 5,
            metricsContext: new MetricsContext()
        }, conf)
        this.validateConfig()
        this.localDataStore = new LocalDataStore(this.config.storeMaxTtl)
        this.send = this.send.bind(this)
    }

    private validateConfig(): void {
        const expectedNodeIdLength = KADEMLIA_ID_LENGTH_IN_BYTES * 2
        if (this.config.nodeId !== undefined ) {
            if (!/^[0-9a-fA-F]+$/.test(this.config.nodeId)) {
                throw new Error('Invalid nodeId, the nodeId should be a hex string')
            } else if (this.config.nodeId.length !== expectedNodeIdLength) {
                throw new Error(`Invalid nodeId, the length of the nodeId should be ${expectedNodeIdLength}`)
            }
        }
        if (this.config.peerDescriptor !== undefined) {
            if (this.config.peerDescriptor.nodeId.length !== KADEMLIA_ID_LENGTH_IN_BYTES) {
                throw new Error(`Invalid peerDescriptor, the length of the nodeId should be ${KADEMLIA_ID_LENGTH_IN_BYTES} bytes`)
            }
        }
    }

    public async start(): Promise<void> {
        if (this.started || this.abortController.signal.aborted) {
            return
        }
        logger.trace(`Starting new Streamr Network DHT Node with serviceId ${this.config.serviceId}`)
        this.started = true

        if (isBrowserEnvironment()) {
            this.config.websocketPortRange = undefined
            if (this.config.peerDescriptor) {
                this.config.peerDescriptor.websocket = undefined
            }
        }
        // If transport is given, do not create a ConnectionManager
        if (this.config.transport) {
            this.transport = this.config.transport
            this.localPeerDescriptor = this.transport.getLocalPeerDescriptor()
            if (this.config.transport instanceof ConnectionManager) {
                this.connectionManager = this.config.transport
            }
        } else {
            const connectorFacadeConfig: DefaultConnectorFacadeConfig = {
                transport: this,
                entryPoints: this.config.entryPoints,
                iceServers: this.config.iceServers,
                webrtcAllowPrivateAddresses: this.config.webrtcAllowPrivateAddresses,
                webrtcDatachannelBufferThresholdLow: this.config.webrtcDatachannelBufferThresholdLow,
                webrtcDatachannelBufferThresholdHigh: this.config.webrtcDatachannelBufferThresholdHigh,
                webrtcNewConnectionTimeout: this.config.webrtcNewConnectionTimeout,
                webrtcPortRange: this.config.webrtcPortRange,
                maxMessageSize: this.config.maxMessageSize,
                websocketServerEnableTls: this.config.websocketServerEnableTls,
                tlsCertificate: this.config.tlsCertificate,
                externalIp: this.config.externalIp,
                autoCertifierUrl: this.config.autoCertifierUrl,
                autoCertifierConfigFile: this.config.autoCertifierConfigFile,
                createLocalPeerDescriptor: (connectivityResponse: ConnectivityResponse) => this.generatePeerDescriptorCallBack(connectivityResponse),
            }
            // If own PeerDescriptor is given in config, create a ConnectionManager with ws server
            if (this.config.peerDescriptor?.websocket) {
                connectorFacadeConfig.websocketHost = this.config.peerDescriptor.websocket.host
                connectorFacadeConfig.websocketPortRange = {
                    min: this.config.peerDescriptor.websocket.port,
                    max: this.config.peerDescriptor.websocket.port
                }
                // If websocketPortRange is given, create ws server using it, websocketHost can be undefined
            } else if (this.config.websocketPortRange) {
                connectorFacadeConfig.websocketHost = this.config.websocketHost
                connectorFacadeConfig.websocketPortRange = this.config.websocketPortRange
            }

            const connectionManager = new ConnectionManager({
                createConnectorFacade: () => new DefaultConnectorFacade(connectorFacadeConfig),
                maxConnections: this.config.maxConnections,
                metricsContext: this.config.metricsContext
            })
            await connectionManager.start()
            this.connectionManager = connectionManager
            this.transport = connectionManager
        }

        this.rpcCommunicator = new RoutingRpcCommunicator(
            this.config.serviceId,
            this.transport.send,
            { rpcRequestTimeout: this.config.rpcRequestTimeout }
        )

        this.transport.on('message', (message: Message) => this.handleMessageFromTransport(message))

        this.initPeerManager()

        this.peerDiscovery = new PeerDiscovery({
            localPeerDescriptor: this.localPeerDescriptor!,
            joinNoProgressLimit: this.config.joinNoProgressLimit,
            peerDiscoveryQueryBatchSize: this.config.peerDiscoveryQueryBatchSize,
            joinTimeout: this.config.dhtJoinTimeout,
            serviceId: this.config.serviceId,
            parallelism: this.config.joinParallelism,
            connectionManager: this.connectionManager,
            peerManager: this.peerManager!
        })
        this.router = new Router({
            rpcCommunicator: this.rpcCommunicator,
            connections: this.peerManager!.connections,
            localPeerDescriptor: this.localPeerDescriptor!,
            addContact: (contact: PeerDescriptor, setActive?: boolean) => this.peerManager!.addContact([contact], setActive),
            handleMessage: (message: Message) => this.handleMessageFromRouter(message),
        })
        this.recursiveOperationManager = new RecursiveOperationManager({
            rpcCommunicator: this.rpcCommunicator,
            router: this.router,
            sessionTransport: this,
            connections: this.peerManager!.connections,
            localPeerDescriptor: this.localPeerDescriptor!,
            serviceId: this.config.serviceId,
            addContact: (contact: PeerDescriptor) => this.peerManager!.addContact([contact]),
            localDataStore: this.localDataStore
        })
        this.storeManager = new StoreManager({
            rpcCommunicator: this.rpcCommunicator,
            recursiveOperationManager: this.recursiveOperationManager,
            localPeerDescriptor: this.localPeerDescriptor!,
            serviceId: this.config.serviceId,
            highestTtl: this.config.storeHighestTtl,
            redundancyFactor: this.config.storageRedundancyFactor,
            localDataStore: this.localDataStore,
            getClosestNeighborsTo: (key: DhtAddress, n?: number) => {
                return this.peerManager!.getClosestNeighborsTo(key, n).map((n) => n.getPeerDescriptor())
            },
            createRpcRemote: (contact: PeerDescriptor) => {
                return new StoreRpcRemote(
                    this.localPeerDescriptor!,
                    contact,
                    this.rpcCommunicator!,
                    StoreRpcClient,
                    this.config.rpcRequestTimeout
                )
            }
        })
        this.on('contactAdded', (peerDescriptor: PeerDescriptor) => {
            this.storeManager!.onContactAdded(peerDescriptor)
        })
        this.bindRpcLocalMethods()
    }

    private initPeerManager() {
        this.peerManager = new PeerManager({
            numberOfNodesPerKBucket: this.config.numberOfNodesPerKBucket,
            maxContactListSize: this.config.maxNeighborListSize,
            localNodeId: this.getNodeId(),
            connectionManager: this.connectionManager!,
            peerDiscoveryQueryBatchSize: this.config.peerDiscoveryQueryBatchSize,
            isLayer0: (this.connectionManager !== undefined),
            createDhtNodeRpcRemote: (peerDescriptor: PeerDescriptor) => this.createDhtNodeRpcRemote(peerDescriptor)
        })
        this.peerManager.on('contactRemoved', (peerDescriptor: PeerDescriptor, activeContacts: PeerDescriptor[]) => {
            this.emit('contactRemoved', peerDescriptor, activeContacts)
        })
        this.peerManager.on('contactAdded', (peerDescriptor: PeerDescriptor, activeContacts: PeerDescriptor[]) =>
            this.emit('contactAdded', peerDescriptor, activeContacts)
        )
        this.peerManager.on('randomContactRemoved', (peerDescriptor: PeerDescriptor, activeContacts: PeerDescriptor[]) =>
            this.emit('randomContactRemoved', peerDescriptor, activeContacts)
        )
        this.peerManager.on('randomContactAdded', (peerDescriptor: PeerDescriptor, activeContacts: PeerDescriptor[]) =>
            this.emit('randomContactAdded', peerDescriptor, activeContacts)
        )
        this.peerManager.on('kBucketEmpty', () => {
            if (!this.peerDiscovery!.isJoinOngoing()
                && this.config.entryPoints
                && this.config.entryPoints.length > 0
            ) {
                setImmediate(async () => {
                    // TODO should we catch possible promise rejection?
                    await Promise.all(this.config.entryPoints!.map((entryPoint) =>
                        this.peerDiscovery!.rejoinDht(entryPoint)
                    ))
                })
            }
        })
        this.transport!.on('connected', (peerDescriptor: PeerDescriptor) => {
            this.peerManager!.onContactConnected(peerDescriptor)
            this.router!.onNodeConnected(peerDescriptor)
            this.emit('connected', peerDescriptor)
        })
        this.transport!.on('disconnected', (peerDescriptor: PeerDescriptor, gracefulLeave: boolean) => {
            this.peerManager!.onContactDisconnected(getNodeIdFromPeerDescriptor(peerDescriptor), gracefulLeave)
            this.router!.onNodeDisconnected(peerDescriptor)
            this.emit('disconnected', peerDescriptor, gracefulLeave)
        })
        this.transport!.getConnections().forEach((peer) => {
            this.peerManager!.onContactConnected(peer)
        })
    }

    private bindRpcLocalMethods(): void {
        if (!this.started || this.abortController.signal.aborted) {
            return
        }
        const dhtNodeRpcLocal = new DhtNodeRpcLocal({
            peerDiscoveryQueryBatchSize: this.config.peerDiscoveryQueryBatchSize,
            getClosestPeersTo: (nodeId: DhtAddress, limit: number) => {
                return this.peerManager!.getClosestNeighborsTo(nodeId, limit)
                    .map((dhtPeer: DhtNodeRpcRemote) => dhtPeer.getPeerDescriptor())
            },
            addContact: (contact: PeerDescriptor) => this.peerManager!.addContact([contact]),
            removeContact: (nodeId: DhtAddress) => this.removeContact(nodeId)
        })
        this.rpcCommunicator!.registerRpcMethod(ClosestPeersRequest, ClosestPeersResponse, 'getClosestPeers',
            (req: ClosestPeersRequest, context) => dhtNodeRpcLocal.getClosestPeers(req, context))
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
            { timeout: 10000 }  // TODO use config option or named constant?
        )
        this.rpcCommunicator!.registerRpcMethod(
            ExternalStoreDataRequest,
            ExternalStoreDataResponse,
            'externalStoreData',
            (req: ExternalStoreDataRequest, context: ServerCallContext) => externalApiRpcLocal.externalStoreData(req, context),
            { timeout: 10000 }  // TODO use config option or named constant?
        )
    }

    private handleMessageFromTransport(message: Message): void {
        if (message.serviceId === this.config.serviceId) {
            this.rpcCommunicator?.handleMessageFromPeer(message)
        } 
    }
    
    private handleMessageFromRouter(message: Message): void {
        if (message.serviceId === this.config.serviceId) {
            this.rpcCommunicator?.handleMessageFromPeer(message)
        } else if (this.connectionManager?.handleIncomingMessage(message)) {
            // message was handled by connectionManager
        } else {
            this.emit('message', message)
        }
    }

    private generatePeerDescriptorCallBack(connectivityResponse: ConnectivityResponse) {
        if (this.config.peerDescriptor !== undefined) {
            this.localPeerDescriptor = this.config.peerDescriptor
        } else {
            this.localPeerDescriptor = createPeerDescriptor(connectivityResponse, this.config.nodeId)
        }
        return this.localPeerDescriptor
    }

    public getClosestContacts(limit?: number): PeerDescriptor[] {
        return this.peerManager!.getClosestContactsTo(
            this.getNodeId(),
            limit).map((peer) => peer.getPeerDescriptor()
        )
    }

    public getNodeId(): DhtAddress {
        return getNodeIdFromPeerDescriptor(this.localPeerDescriptor!)
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
        return this.config.entryPoints !== undefined ? this.config.entryPoints.filter((entryPoint) =>
            this.peerManager!.connections.has(getNodeIdFromPeerDescriptor(entryPoint))
        ) : []
    }

    public async joinDht(entryPointDescriptors: PeerDescriptor[], doAdditionalDistantPeerDiscovery?: boolean, retry?: boolean): Promise<void> {
        if (!this.started) {
            throw new Error('Cannot join DHT before calling start() on DhtNode')
        }
        await this.peerDiscovery!.joinDht(entryPointDescriptors, doAdditionalDistantPeerDiscovery, retry)
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
        const result = await this.recursiveOperationManager!.execute(key, RecursiveOperation.FIND_NODE)
        return result.closestNodes
    }

    public getTransport(): ITransport {
        return this.transport!
    }

    public getLocalPeerDescriptor(): PeerDescriptor {
        return this.localPeerDescriptor!
    }

    public getConnections(): PeerDescriptor[] {
        return Array.from(this.peerManager!.connections.values()).map((peer) => peer.getPeerDescriptor())
    }

    public getNeighbors(): PeerDescriptor[] {
        return this.started ? this.peerManager!.getNeighbors() : []
    }

    public getConnectionCount(): number {
        return this.peerManager!.getConnectionCount()
    }

    public getLocalLockedConnectionCount(): number {
        return this.connectionManager!.getLocalLockedConnectionCount()
    }

    public getRemoteLockedConnectionCount(): number {
        return this.connectionManager!.getRemoteLockedConnectionCount()
    }

    public getWeakLockedConnectionCount(): number {
        return this.connectionManager!.getWeakLockedConnectionCount()
    }

    public async waitForNetworkConnectivity(): Promise<void> {
        await waitForCondition(() => {
            if (!this.peerManager) {
                return false
            } else {
                return (this.peerManager.getConnectionCount() > 0)
            }
        }, this.config.networkConnectivityTimeout, 100, this.abortController.signal)
    }

    public hasJoined(): boolean {
        return this.peerDiscovery!.isJoinCalled()
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
        this.peerDiscovery!.stop()
        if (this.config.transport === undefined) {
            // if the transport was not given in config, the instance was created in start() and
            // this component is responsible for stopping it
            await this.transport!.stop()
        }
        this.transport = undefined
        this.connectionManager = undefined
        this.removeAllListeners()
    }

    private createDhtNodeRpcRemote(peerDescriptor: PeerDescriptor) {
        return new DhtNodeRpcRemote(
            this.localPeerDescriptor!,
            peerDescriptor,
            this.config.serviceId,
            this.rpcCommunicator!,
            this.config.rpcRequestTimeout
        )
    }
}
