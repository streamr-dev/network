/* eslint-disable @typescript-eslint/ban-ts-comment */

import { DhtNodeRpcRemote } from './DhtNodeRpcRemote'
import KBucket from 'k-bucket'
import { EventEmitter } from 'eventemitter3'
import { RoutingRpcCommunicator } from '../transport/RoutingRpcCommunicator'
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
    DataEntry,
    ExternalFindDataRequest,
    ExternalFindDataResponse,
    ExternalStoreDataRequest,
    ExternalStoreDataResponse,
} from '../proto/packages/dht/protos/DhtRpc'
import { ITransport, TransportEvents } from '../transport/ITransport'
import { ConnectionManager, PortRange, TlsCertificate } from '../connection/ConnectionManager'
import { DhtNodeRpcClient, ExternalApiRpcClient } from '../proto/packages/dht/protos/DhtRpc.client'
import {
    Logger,
    MetricsContext,
    hexToBinary,
    merge,
    waitForCondition
} from '@streamr/utils'
import { toProtoRpcClient } from '@streamr/proto-rpc'
import { Any } from '../proto/google/protobuf/any'
import { areEqualPeerDescriptors, getNodeIdFromPeerDescriptor, peerIdFromPeerDescriptor } from '../helpers/peerIdFromPeerDescriptor'
import { Router } from './routing/Router'
import { Finder, FindResult } from './find/Finder'
import { StoreRpcLocal } from './store/StoreRpcLocal'
import { PeerDiscovery } from './discovery/PeerDiscovery'
import { LocalDataStore } from './store/LocalDataStore'
import { IceServer } from '../connection/webrtc/WebrtcConnector'
import { ExternalApiRpcRemote } from './ExternalApiRpcRemote'
import { PeerManager } from './PeerManager'
import { UUID } from '../helpers/UUID'
import { isBrowserEnvironment } from '../helpers/browser/isBrowserEnvironment'
import { sample } from 'lodash'
import { DefaultConnectorFacade, DefaultConnectorFacadeConfig } from '../connection/ConnectorFacade'
import { MarkRequired } from 'ts-essentials'
import { DhtNodeRpcLocal } from './DhtNodeRpcLocal'
import { ExternalApiRpcLocal } from './ExternalApiRpcLocal'
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'

export interface DhtNodeEvents {
    newContact: (peerDescriptor: PeerDescriptor, closestPeers: PeerDescriptor[]) => void
    contactRemoved: (peerDescriptor: PeerDescriptor, closestPeers: PeerDescriptor[]) => void
    joinCompleted: () => void
    newRandomContact: (peerDescriptor: PeerDescriptor, closestPeers: PeerDescriptor[]) => void
    randomContactRemoved: (peerDescriptor: PeerDescriptor, closestPeers: PeerDescriptor[]) => void
}

export interface DhtNodeOptions {
    serviceId?: string
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
    peerId?: string

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
    'metricsContext' |
    'peerId'>

const logger = new Logger(module)

export type Events = TransportEvents & DhtNodeEvents

export const createPeerDescriptor = (msg?: ConnectivityResponse, peerId?: string): PeerDescriptor => {
    let kademliaId: Uint8Array
    if (msg) {
        kademliaId = peerId ? hexToBinary(peerId) : PeerID.fromIp(msg.host).value
    } else {
        kademliaId = hexToBinary(peerId!)
    }
    const nodeType = isBrowserEnvironment() ? NodeType.BROWSER : NodeType.NODEJS 
    const ret: PeerDescriptor = { kademliaId, type: nodeType }
    if (msg && msg.websocket) {
        ret.websocket = { host: msg.websocket.host, port: msg.websocket.port, tls: msg.websocket.tls }
    }
    return ret
}

interface IDhtNodeTest {
    getConnections: () => Map<PeerIDKey, DhtNodeRpcRemote>
    getPeerManager: () => PeerManager
}

export class DhtNode extends EventEmitter<Events> implements ITransport {
    private readonly config: StrictDhtNodeOptions

    private rpcCommunicator?: RoutingRpcCommunicator
    private transport?: ITransport
    private localPeerDescriptor?: PeerDescriptor
    private ownPeerId?: PeerID
    public router?: Router
    private storeRpcLocal?: StoreRpcLocal
    private localDataStore = new LocalDataStore()
    private finder?: Finder
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
        getPeerManager: () => { return this.peerManager! }
    }
    public testInterfaceType?: IDhtNodeTest

    constructor(conf: DhtNodeOptions) {
        super()
        this.config = merge({
            serviceId: 'layer0',
            joinParallelism: 3,
            maxNeighborListSize: 200,
            numberOfNodesPerKBucket: 8,
            joinNoProgressLimit: 4,
            dhtJoinTimeout: 60000,
            peerDiscoveryQueryBatchSize: 5,
            maxConnections: 80,
            storeHighestTtl: 60000,
            storeMaxTtl: 60000,
            networkConnectivityTimeout: 10000,
            storageRedundancyFactor: 5,
            metricsContext: new MetricsContext(),
            peerId: new UUID().toHex()
        }, conf)
        this.send = this.send.bind(this)
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

        this.transport.on('message', (message: Message) => this.handleMessage(message))

        this.ownPeerId = peerIdFromPeerDescriptor(this.localPeerDescriptor!)

        this.initPeerManager()

        this.peerDiscovery = new PeerDiscovery({
            localPeerDescriptor: this.localPeerDescriptor!,
            joinNoProgressLimit: this.config.joinNoProgressLimit,
            peerDiscoveryQueryBatchSize: this.config.peerDiscoveryQueryBatchSize,
            joinTimeout: this.config.dhtJoinTimeout,
            serviceId: this.config.serviceId,
            parallelism: this.config.joinParallelism,
            peerManager: this.peerManager!,
        })
        this.router = new Router({
            rpcCommunicator: this.rpcCommunicator!,
            connections: this.peerManager!.connections,
            localPeerDescriptor: this.localPeerDescriptor!,
            addContact: (peerDescriptor: PeerDescriptor, setActive?: boolean | undefined) => {
                this.peerManager!.handleNewPeers([peerDescriptor], setActive)
            },
            serviceId: this.config.serviceId,
            connectionManager: this.connectionManager
        })
        this.finder = new Finder({
            rpcCommunicator: this.rpcCommunicator,
            router: this.router,
            sessionTransport: this,
            connections: this.peerManager!.connections,
            localPeerDescriptor: this.localPeerDescriptor!,
            serviceId: this.config.serviceId,
            addContact: (peerDescriptor: PeerDescriptor, setActive?: boolean | undefined) => {
                this.peerManager!.handleNewPeers([peerDescriptor], setActive)
            },
            isPeerCloserToIdThanSelf: this.isPeerCloserToIdThanSelf.bind(this),
            localDataStore: this.localDataStore
        })
        this.storeRpcLocal = new StoreRpcLocal({
            rpcCommunicator: this.rpcCommunicator,
            finder: this.finder,
            localPeerDescriptor: this.localPeerDescriptor!,
            serviceId: this.config.serviceId,
            highestTtl: this.config.storeHighestTtl,
            maxTtl: this.config.storeMaxTtl,
            redundancyFactor: this.config.storageRedundancyFactor,
            localDataStore: this.localDataStore,
            dhtNodeEmitter: this,
            getNodesClosestToIdFromBucket: (id: Uint8Array, n?: number) => {
                return this.peerManager!.getClosestPeersTo(id, n)
            },
            rpcRequestTimeout: this.config.rpcRequestTimeout
        })
        this.bindRpcLocalMethods()
        if (this.connectionManager! && this.config.entryPoints && this.config.entryPoints.length > 0
            && !areEqualPeerDescriptors(this.config.entryPoints[0], this.localPeerDescriptor!)) {
            this.connectToEntryPoint(this.config.entryPoints[0])
        }
    }

    private initPeerManager() {
        this.peerManager = new PeerManager({
            numberOfNodesPerKBucket: this.config.numberOfNodesPerKBucket,
            maxNeighborListSize: this.config.maxNeighborListSize,
            ownPeerId: this.ownPeerId!,
            connectionManager: this.connectionManager!,
            peerDiscoveryQueryBatchSize: this.config.peerDiscoveryQueryBatchSize,
            isLayer0: this.connectionManager ? true : false,
            createDhtNodeRpcRemote: this.createDhtNodeRpcRemote.bind(this)
        })

        this.peerManager.on('contactRemoved', (peerDescriptor: PeerDescriptor, activeContacts: PeerDescriptor[]) => {
            this.emit('contactRemoved', peerDescriptor, activeContacts)
        })
        this.peerManager.on('newContact', (peerDescriptor: PeerDescriptor, activeContacts: PeerDescriptor[]) =>
            this.emit('newContact', peerDescriptor, activeContacts)
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
        this.transport!.on('connected', (peerDescriptor: PeerDescriptor) => {
            this.peerManager!.handleConnected(peerDescriptor)
            this.emit('connected', peerDescriptor)
        })
        this.transport!.on('disconnected', (peerDescriptor: PeerDescriptor, gracefulLeave: boolean) => {
            this.peerManager?.handleDisconnected(peerDescriptor, gracefulLeave)
            this.emit('disconnected', peerDescriptor, gracefulLeave)
        })
        this.transport!.getAllConnectionPeerDescriptors().map((peerDescriptor) => {
            this.peerManager!.handleConnected(peerDescriptor)
        })
    }

    private bindRpcLocalMethods(): void {
        if (!this.started || this.abortController.signal.aborted) {
            return
        }
        const rpcLocal = new DhtNodeRpcLocal({
            serviceId: this.config.serviceId,
            peerDiscoveryQueryBatchSize: this.config.peerDiscoveryQueryBatchSize,
            getClosestPeersTo: (kademliaId: Uint8Array, limit: number) => this.peerManager!.getClosestPeersTo(kademliaId, limit),
            addNewContact: (contact: PeerDescriptor) => this.peerManager?.handleNewPeers([contact]),
            removeContact: (contact: PeerDescriptor) => this.removeContact(contact)
        })
        this.rpcCommunicator!.registerRpcMethod(ClosestPeersRequest, ClosestPeersResponse, 'getClosestPeers',
            (req: ClosestPeersRequest, context) => rpcLocal.getClosestPeers(req, context))
        this.rpcCommunicator!.registerRpcMethod(PingRequest, PingResponse, 'ping',
            (req: PingRequest, context) => rpcLocal.ping(req, context))
        this.rpcCommunicator!.registerRpcNotification(LeaveNotice, 'leaveNotice',
            (req: LeaveNotice, context) => rpcLocal.leaveNotice(req, context))
        const externalApiRpcLocal = new ExternalApiRpcLocal({
            startFind: (idToFind: Uint8Array, fetchData: boolean, excludedPeer: PeerDescriptor) => {
                return this.startFind(idToFind, fetchData, excludedPeer)
            },
            storeDataToDht: (key: Uint8Array, data: Any) => this.storeDataToDht(key, data)
        })
        this.rpcCommunicator!.registerRpcMethod(
            ExternalFindDataRequest,
            ExternalFindDataResponse,
            'externalFindData', 
            (req: ExternalFindDataRequest, context: ServerCallContext) => externalApiRpcLocal.externalFindData(req, context),
            { timeout: 10000 }
        )
        this.rpcCommunicator!.registerRpcMethod(
            ExternalStoreDataRequest,
            ExternalStoreDataResponse,
            'externalStoreData',
            (req: ExternalStoreDataRequest) => externalApiRpcLocal.externalStoreData(req),
            { timeout: 10000 }
        )
    }

    private isPeerCloserToIdThanSelf(peer1: PeerDescriptor, compareToId: PeerID): boolean {
        const distance1 = KBucket.distance(peer1.kademliaId, compareToId.value)
        const distance2 = KBucket.distance(this.localPeerDescriptor!.kademliaId, compareToId.value)
        return distance1 < distance2
    }

    private handleMessage(message: Message): void {
        if (message.serviceId === this.config.serviceId) {
            logger.trace('callig this.handleMessageFromPeer ' + getNodeIdFromPeerDescriptor(message.sourceDescriptor!)
                + ' ' + message.serviceId + ' ' + message.messageId)
            this.rpcCommunicator?.handleMessageFromPeer(message)
        } else {
            logger.trace('emit "message" ' + getNodeIdFromPeerDescriptor(message.sourceDescriptor!)
                + ' ' + message.serviceId + ' ' + message.messageId)
            this.emit('message', message)
        }
    }

    private generatePeerDescriptorCallBack(connectivityResponse: ConnectivityResponse) {
        if (this.config.peerDescriptor) {
            this.localPeerDescriptor = this.config.peerDescriptor
        } else {
            this.localPeerDescriptor = createPeerDescriptor(connectivityResponse, this.config.peerId)
        }
        return this.localPeerDescriptor
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
        const reachableThrough = this.peerDiscovery!.isJoinOngoing() ? this.config.entryPoints ?? [] : []
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

    public async startFind(idToFind: Uint8Array, fetchData?: boolean, excludedPeer?: PeerDescriptor): Promise<FindResult> {
        return this.finder!.startFind(idToFind, fetchData, excludedPeer)
    }

    public async storeDataToDht(key: Uint8Array, data: Any): Promise<PeerDescriptor[]> {
        if (this.peerDiscovery!.isJoinOngoing() && this.config.entryPoints && this.config.entryPoints.length > 0) {
            return this.storeDataViaPeer(key, data, sample(this.config.entryPoints)!)
        }
        return this.storeRpcLocal!.storeDataToDht(key, data)
    }

    public async storeDataViaPeer(key: Uint8Array, data: Any, peer: PeerDescriptor): Promise<PeerDescriptor[]> {
        const rpcRemote = new ExternalApiRpcRemote(
            this.localPeerDescriptor!,
            peer,
            this.config.serviceId,
            toProtoRpcClient(new ExternalApiRpcClient(this.rpcCommunicator!.getRpcClientTransport()))
        )
        return await rpcRemote.storeData(key, data)
    }

    public async getDataFromDht(idToFind: Uint8Array): Promise<DataEntry[]> {
        if (this.peerDiscovery!.isJoinOngoing() && this.config.entryPoints && this.config.entryPoints.length > 0) {
            return this.findDataViaPeer(idToFind, sample(this.config.entryPoints)!)
        }
        const result = await this.finder!.startFind(idToFind, true)
        return result.dataEntries ?? []
    }

    public async deleteDataFromDht(idToDelete: Uint8Array): Promise<void> {
        if (!this.abortController.signal.aborted) {
            return this.storeRpcLocal!.deleteDataFromDht(idToDelete)
        }
    }

    public async findDataViaPeer(idToFind: Uint8Array, peer: PeerDescriptor): Promise<DataEntry[]> {
        const rpcRemote = new ExternalApiRpcRemote(
            this.localPeerDescriptor!,
            peer,
            this.config.serviceId,
            toProtoRpcClient(new ExternalApiRpcClient(this.rpcCommunicator!.getRpcClientTransport()))
        )
        return await rpcRemote.externalFindData(idToFind)
    }

    public getRpcCommunicator(): RoutingRpcCommunicator {
        return this.rpcCommunicator!
    }

    public getTransport(): ITransport {
        return this.transport!
    }

    public getLocalPeerDescriptor(): PeerDescriptor {
        return this.localPeerDescriptor!
    }

    public getAllConnectionPeerDescriptors(): PeerDescriptor[] {
        return Array.from(this.peerManager!.connections.values()).map((peer) => peer.getPeerDescriptor())
    }

    public getK(): number {
        return this.config.numberOfNodesPerKBucket
    }

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

    public hasJoined(): boolean {
        return this.peerDiscovery!.isJoinCalled()
    }

    public getKnownEntryPoints(): PeerDescriptor[] {
        return this.config.entryPoints ?? []
    }

    private createDhtNodeRpcRemote(peerDescriptor: PeerDescriptor): DhtNodeRpcRemote {
        return new DhtNodeRpcRemote(
            this.localPeerDescriptor!,
            peerDescriptor,
            toProtoRpcClient(new DhtNodeRpcClient(this.rpcCommunicator!.getRpcClientTransport())),
            this.config.serviceId,
            this.config.rpcRequestTimeout
        )
    }

    public getClosestContacts(limit?: number): PeerDescriptor[] {
        return this.peerManager!.getClosestPeersTo(this.localPeerDescriptor!.kademliaId, limit).map((peer) => peer.getPeerDescriptor())
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
        this.finder!.stop()
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

    public removeContact(peerDescriptor: PeerDescriptor): void {
        this.peerManager!.handlePeerLeaving(peerDescriptor)
    }
}

