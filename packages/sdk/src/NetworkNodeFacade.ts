/**
 * Wrap a network node.
 */
import { IMessageType } from '@protobuf-ts/runtime'
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { DhtAddress, PeerDescriptor } from '@streamr/dht'
import { ProtoRpcClient } from '@streamr/proto-rpc'
import {
    ExternalRpcClient,
    ExternalRpcClientClass,
    NetworkOptions,
    StreamMessage as NewStreamMessage,
    ProxyDirection,
    createNetworkNode as createNetworkNode_
} from '@streamr/trackerless-network'
import { Logger, MetricsContext, StreamPartID, StreamPartIDUtils, UserID } from '@streamr/utils'
import EventEmitter from 'eventemitter3'
import { pull } from 'lodash'
import { Lifecycle, inject, scoped } from 'tsyringe'
import { Authentication, AuthenticationInjectionToken } from './Authentication'
import { ConfigInjectionToken, NetworkPeerDescriptor, StrictStreamrClientConfig } from './Config'
import { DestroySignal } from './DestroySignal'
import { OperatorRegistry } from './contracts/OperatorRegistry'
import { OperatorDiscoveryRequest, OperatorDiscoveryResponse } from './generated/packages/sdk/protos/SdkRpc'
import { OperatorDiscoveryClient } from './generated/packages/sdk/protos/SdkRpc.client'
import { StreamMessage as OldStreamMessage } from './protocol/StreamMessage'
import { StreamMessageTranslator } from './protocol/StreamMessageTranslator'
import { pOnce } from './utils/promises'
import { convertPeerDescriptorToNetworkPeerDescriptor, peerDescriptorTranslator } from './utils/utils'

export interface NetworkNodeStub {
    getNodeId: () => DhtAddress
    addMessageListener: (listener: (msg: NewStreamMessage) => void) => void
    removeMessageListener: (listener: (msg: NewStreamMessage) => void) => void
    join: (streamPartId: StreamPartID, neighborRequirement?: { minCount: number; timeout: number }) => Promise<void>
    leave: (streamPartId: StreamPartID) => Promise<void>
    broadcast: (streamMessage: NewStreamMessage) => Promise<void>
    getStreamParts: () => StreamPartID[]
    getNeighbors: (streamPartId: StreamPartID) => readonly DhtAddress[]
    getPeerDescriptor: () => PeerDescriptor
    getOptions: () => NetworkOptions
    getMetricsContext: () => MetricsContext
    getDiagnosticInfo: () => Record<string, unknown>
    hasStreamPart: (streamPartId: StreamPartID) => boolean
    inspect(node: PeerDescriptor, streamPartId: StreamPartID): Promise<boolean>
    start: (doJoin?: boolean) => Promise<void>
    stop: () => Promise<void>
    setProxies: (
        streamPartId: StreamPartID,
        nodes: PeerDescriptor[],
        direction: ProxyDirection,
        userId: UserID,
        connectionCount?: number
    ) => Promise<void>
    isProxiedStreamPart(streamPartId: StreamPartID): boolean
    setStreamPartEntryPoints: (streamPartId: StreamPartID, peerDescriptors: PeerDescriptor[]) => void
    createExternalRpcClient<T extends ExternalRpcClient>(clientClass: ExternalRpcClientClass<T>): ProtoRpcClient<T>
    registerExternalNetworkRpcMethod<
        RequestClass extends IMessageType<RequestType>,
        ResponseClass extends IMessageType<ResponseType>,
        RequestType extends object,
        ResponseType extends object
    >(
        request: RequestClass,
        response: ResponseClass,
        name: string,
        fn: (req: RequestType, context: ServerCallContext) => Promise<ResponseType>
    ): void
}

export interface Events {
    start: () => void
}

/**
 * The factory is used so that integration tests can replace the real network node with a fake instance
 */
/* eslint-disable class-methods-use-this */
@scoped(Lifecycle.ContainerScoped)
export class NetworkNodeFactory {
    createNetworkNode(opts: NetworkOptions): NetworkNodeStub {
        return createNetworkNode_(opts)
    }
}

const logger = new Logger(module)

/**
 * Wrap a network node.
 * Lazily creates & starts node on first call to getNode().
 */
@scoped(Lifecycle.ContainerScoped)
export class NetworkNodeFacade {
    private cachedNode?: NetworkNodeStub
    private startNodeCalled = false
    private startNodeComplete = false
    private readonly messageListeners: ((msg: OldStreamMessage) => void)[] = []
    private readonly networkNodeFactory: NetworkNodeFactory
    private readonly operatorRegistry: OperatorRegistry
    private readonly config: Pick<StrictStreamrClientConfig, 'network' | 'contracts'>
    private readonly authentication: Authentication
    private readonly eventEmitter: EventEmitter<Events>
    private readonly destroySignal: DestroySignal

    constructor(
        networkNodeFactory: NetworkNodeFactory,
        operatorRegistry: OperatorRegistry,
        @inject(ConfigInjectionToken) config: Pick<StrictStreamrClientConfig, 'network' | 'contracts'>,
        @inject(AuthenticationInjectionToken) authentication: Authentication,
        destroySignal: DestroySignal
    ) {
        this.networkNodeFactory = networkNodeFactory
        this.operatorRegistry = operatorRegistry
        this.config = config
        this.authentication = authentication
        this.eventEmitter = new EventEmitter<Events>()
        this.destroySignal = destroySignal
        destroySignal.onDestroy.listen(this.destroy)
    }

    private async getNetworkOptions(): Promise<NetworkOptions> {
        const entryPoints = await this.getEntryPoints()
        const localPeerDescriptor: PeerDescriptor | undefined = this.config.network.controlLayer.peerDescriptor
            ? peerDescriptorTranslator(this.config.network.controlLayer.peerDescriptor)
            : undefined
        return {
            layer0: {
                ...this.config.network.controlLayer,
                entryPoints: entryPoints.map(peerDescriptorTranslator),
                peerDescriptor: localPeerDescriptor,
                websocketPortRange:
                    this.config.network.controlLayer.websocketPortRange !== null
                        ? this.config.network.controlLayer.websocketPortRange
                        : undefined
            },
            networkNode: this.config.network.node,
            metricsContext: new MetricsContext()
        }
    }

    /**
     * Stop network node, or wait for it to stop if already stopping.
     * Subsequent calls to getNode/start will fail.
     */
    private destroy = pOnce(async () => {
        const node = this.cachedNode
        this.cachedNode = undefined
        // stop node only if started or in progress
        if (node && this.startNodeCalled) {
            if (!this.startNodeComplete) {
                // wait for start to finish before stopping node
                const startNodeTask = this.startNodeTask()
                this.startNodeTask.reset() // allow subsequent calls to fail
                await startNodeTask
            }
            await node.stop()
        }
        this.startNodeTask.reset() // allow subsequent calls to fail
    })

    /**
     * Start network node, or wait for it to start if already started.
     */
    // TODO: doJoin parameter seems problematic here; see ticket NET-1319
    private startNodeTask = pOnce(async (doJoin: boolean = true) => {
        this.startNodeCalled = true
        try {
            const node = await this.initNode()
            if (!this.destroySignal.isDestroyed()) {
                await node.start(doJoin)
            }
            node.addMessageListener((msg) => {
                if (this.messageListeners.length > 0) {
                    try {
                        const translated = StreamMessageTranslator.toClientProtocol(msg)
                        for (const listener of this.messageListeners) {
                            listener(translated)
                        }
                    } catch (err) {
                        logger.trace(`Could not translate message`, { err })
                    }
                }
            })
            if (this.destroySignal.isDestroyed()) {
                await node.stop()
            } else {
                this.eventEmitter.emit('start')
            }
            this.destroySignal.assertNotDestroyed()
            return node
        } finally {
            this.startNodeComplete = true
        }
    })

    private async initNode(): Promise<NetworkNodeStub> {
        this.destroySignal.assertNotDestroyed()
        if (this.cachedNode) {
            return this.cachedNode
        }
        const node = this.networkNodeFactory.createNetworkNode(await this.getNetworkOptions())
        if (!this.destroySignal.isDestroyed()) {
            this.cachedNode = node
        }
        return node
    }

    startNode: () => Promise<unknown> = this.startNodeTask

    getNode(): Promise<Omit<NetworkNodeStub, 'start' | 'stop'>> {
        this.destroySignal.assertNotDestroyed()
        return this.startNodeTask()
    }

    async getNodeId(): Promise<DhtAddress> {
        const node = await this.getNode()
        return node.getNodeId()
    }

    async join(streamPartId: StreamPartID, neighborRequirement?: { minCount: number; timeout: number }): Promise<void> {
        const node = await this.getNode()
        await node.join(streamPartId, neighborRequirement)
    }

    async leave(streamPartId: StreamPartID): Promise<void> {
        const node = await this.getNode()
        await node.leave(streamPartId)
    }

    async broadcast(msg: OldStreamMessage): Promise<void> {
        const node = await this.getNode()
        node.broadcast(StreamMessageTranslator.toProtobuf(msg))
    }

    addMessageListener(listener: (msg: OldStreamMessage) => void): void {
        this.messageListeners.push(listener)
    }

    removeMessageListener(listener: (msg: OldStreamMessage) => void): void {
        pull(this.messageListeners, listener)
    }

    async isProxiedStreamPart(streamPartId: StreamPartID): Promise<boolean> {
        const node = await this.getNode()
        return node.isProxiedStreamPart(streamPartId)
    }

    async getMetricsContext(): Promise<MetricsContext> {
        const node = await this.getNode()
        return node.getMetricsContext()
    }

    async getPeerDescriptor(): Promise<PeerDescriptor> {
        const node = await this.getNode()
        return node.getPeerDescriptor()
    }

    async getDiagnosticInfo(): Promise<Record<string, unknown>> {
        const node = await this.getNode()
        return node.getDiagnosticInfo()
    }

    async getStreamParts(): Promise<readonly StreamPartID[]> {
        const node = await this.getNode()
        return node.getStreamParts()
    }

    async getNeighbors(streamPartId: StreamPartID): Promise<readonly DhtAddress[]> {
        const node = await this.getNode()
        return node.getNeighbors(streamPartId)
    }

    async getOptions(): Promise<NetworkOptions> {
        const node = await this.getNode()
        return node.getOptions()
    }

    async inspect(node: NetworkPeerDescriptor, streamPartId: StreamPartID): Promise<boolean> {
        if (this.isStarting()) {
            await this.startNodeTask(false)
        }
        const peerDescriptor = peerDescriptorTranslator(node)
        return this.cachedNode!.inspect(peerDescriptor, streamPartId)
    }

    async setProxies(
        streamPartId: StreamPartID,
        nodes: NetworkPeerDescriptor[],
        direction: ProxyDirection,
        connectionCount?: number
    ): Promise<void> {
        if (this.isStarting()) {
            await this.startNodeTask(false)
        }
        const peerDescriptors = nodes.map(peerDescriptorTranslator)
        await this.cachedNode!.setProxies(
            streamPartId,
            peerDescriptors,
            direction,
            await this.authentication.getUserId(),
            connectionCount
        )
    }

    async setStreamPartEntryPoints(
        streamPartId: StreamPartID,
        nodeDescriptors: NetworkPeerDescriptor[]
    ): Promise<void> {
        if (this.isStarting()) {
            await this.startNodeTask(false)
        }
        const peerDescriptors = nodeDescriptors.map(peerDescriptorTranslator)
        this.cachedNode!.setStreamPartEntryPoints(streamPartId, peerDescriptors)
    }

    async discoverOperators(
        leader: NetworkPeerDescriptor,
        streamPartId: StreamPartID
    ): Promise<NetworkPeerDescriptor[]> {
        const client = await this.createExternalRpcClient(OperatorDiscoveryClient)
        const response = await client.discoverOperators(OperatorDiscoveryRequest.create({ streamPartId }), {
            sourceDescriptor: await this.getPeerDescriptor(),
            targetDescriptor: peerDescriptorTranslator(leader)
        })
        return response.operators.map((operator) => convertPeerDescriptorToNetworkPeerDescriptor(operator))
    }

    private async createExternalRpcClient<T extends ExternalRpcClient>(
        clientClass: ExternalRpcClientClass<T>
    ): Promise<ProtoRpcClient<T>> {
        if (this.isStarting()) {
            await this.startNodeTask(false)
        }
        return this.cachedNode!.createExternalRpcClient(clientClass)
    }

    async registerOperator(opts: {
        getAssignedNodesForStreamPart: (streamPartId: StreamPartID) => NetworkPeerDescriptor[]
    }): Promise<void> {
        const node = await this.getNode()
        node.registerExternalNetworkRpcMethod(
            OperatorDiscoveryRequest,
            OperatorDiscoveryResponse,
            'discoverOperators',
            async (request: OperatorDiscoveryRequest) => {
                const streamPartId = StreamPartIDUtils.parse(request.streamPartId)
                const operators = opts.getAssignedNodesForStreamPart(streamPartId)
                return OperatorDiscoveryResponse.create({
                    operators: operators.map((operator) => peerDescriptorTranslator(operator))
                })
            }
        )
    }

    private isStarting(): boolean {
        return !this.cachedNode || !this.startNodeComplete
    }

    once<E extends keyof Events>(eventName: E, listener: Events[E]): void {
        this.eventEmitter.once(eventName, listener as any)
    }

    private async getEntryPoints(): Promise<NetworkPeerDescriptor[]> {
        const discoveryConfig = this.config.network.controlLayer.entryPointDiscovery
        const discoveredEntryPoints = discoveryConfig?.enabled
            ? await this.operatorRegistry.findRandomNetworkEntrypoints(
                  discoveryConfig.maxEntryPoints!,
                  discoveryConfig.maxQueryResults!,
                  discoveryConfig.maxHeartbeatAgeHours!
              )
            : []
        return [...this.config.network.controlLayer.entryPoints!, ...discoveredEntryPoints]
    }
}
