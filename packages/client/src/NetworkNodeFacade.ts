/**
 * Wrap a network node.
 */
import { PeerDescriptor } from '@streamr/dht'
import { StreamMessage, StreamPartID } from '@streamr/protocol'
import { createNetworkNode as createNetworkNode_, NetworkOptions, NodeID, ProxyDirection } from '@streamr/trackerless-network'
import { EthereumAddress, MetricsContext } from '@streamr/utils'
import EventEmitter from 'eventemitter3'
import { Lifecycle, inject, scoped } from 'tsyringe'
import { Authentication, AuthenticationInjectionToken } from './Authentication'
import { ConfigInjectionToken, NetworkPeerDescriptor, StrictStreamrClientConfig } from './Config'
import { DestroySignal } from './DestroySignal'
import { OperatorRegistry } from './registry/OperatorRegistry'
import { pOnce } from './utils/promises'
import { peerDescriptorTranslator } from './utils/utils'

// TODO should we make getNode() an internal method, and provide these all these services as client methods?
/** @deprecated This in an internal interface */
export interface NetworkNodeStub {
    getNodeId: () => NodeID
    addMessageListener: (listener: (msg: StreamMessage) => void) => void
    removeMessageListener: (listener: (msg: StreamMessage) => void) => void
    join: (streamPartId: StreamPartID, neighborRequirement?: { minCount: number, timeout: number }) => Promise<void>
    leave: (streamPartId: StreamPartID) => Promise<void>
    broadcast: (streamMessage: StreamMessage) => Promise<void>
    getStreamParts: () => StreamPartID[]
    getNeighbors: (streamPartId: StreamPartID) => ReadonlyArray<NodeID>
    getPeerDescriptor: () => PeerDescriptor
    getOptions: () => NetworkOptions
    getMetricsContext: () => MetricsContext
    getDiagnosticInfo: () => Record<string, unknown>
    hasStreamPart: (streamPartId: StreamPartID) => boolean
    inspect(node: PeerDescriptor, streamPartId: StreamPartID): Promise<boolean>
    /** @internal */
    start: (doJoin?: boolean) => Promise<void>
    /** @internal */
    stop: () => Promise<void>
    /** @internal */
    setProxies: (
        streamPartId: StreamPartID,
        nodes: PeerDescriptor[],
        direction: ProxyDirection,
        userId: EthereumAddress,
        connectionCount?: number
    ) => Promise<void>
    isProxiedStreamPart(streamPartId: StreamPartID): boolean
    setStreamPartEntryPoints: (streamPartId: StreamPartID, peerDescriptors: PeerDescriptor[]) => void
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

/**
 * Wrap a network node.
 * Lazily creates & starts node on first call to getNode().
 */
@scoped(Lifecycle.ContainerScoped)
export class NetworkNodeFacade {

    private cachedNode?: NetworkNodeStub
    private startNodeCalled = false
    private startNodeComplete = false
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
        destroySignal.onDestroy.once(this.destroy)
    }

    private assertNotDestroyed(): void {
        this.destroySignal.assertNotDestroyed()
    }

    private async getNetworkOptions(): Promise<NetworkOptions> {
        const entryPoints = await this.getEntryPoints()
        const localPeerDescriptor: PeerDescriptor | undefined = this.config.network.controlLayer.peerDescriptor ? 
            peerDescriptorTranslator(this.config.network.controlLayer.peerDescriptor) : undefined
        return {
            layer0: {
                ...this.config.network.controlLayer,
                entryPoints: entryPoints.map(peerDescriptorTranslator),
                peerDescriptor: localPeerDescriptor
            },
            networkNode: this.config.network.node,
            metricsContext: new MetricsContext()
        }
    }

    private async initNode(): Promise<NetworkNodeStub> {
        this.assertNotDestroyed()
        if (this.cachedNode) { return this.cachedNode }

        const node = this.networkNodeFactory.createNetworkNode(await this.getNetworkOptions())
        if (!this.destroySignal.isDestroyed()) {
            this.cachedNode = node
        }
        return node
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
    private startNodeTask = pOnce(async (doJoin: boolean = true) => {
        this.startNodeCalled = true
        try {
            const node = await this.initNode()
            if (!this.destroySignal.isDestroyed()) {
                await node.start(doJoin)
            }

            if (this.destroySignal.isDestroyed()) {
                await node.stop()
            } else {
                this.eventEmitter.emit('start')
            }
            this.assertNotDestroyed()
            return node
        } finally {
            this.startNodeComplete = true
        }
    })

    startNode: () => Promise<unknown> = this.startNodeTask

    getNode: () => Promise<NetworkNodeStub> = this.startNodeTask

    async getNodeId(): Promise<NodeID> {
        const node = await this.getNode()
        return node.getNodeId()
    }

    /**
     * Calls publish on node after starting it.
     * Basically a wrapper around: (await getNode()).publish(…)
     * but will be sync in case that node is already started.
     * Zalgo intentional. See below.
     */
    async publishToNode(streamMessage: StreamMessage): Promise<void> {
        // NOTE: function is intentionally not async for performance reasons.
        // Will call cachedNode.publish immediately if cachedNode is set.
        // Otherwise will wait for node to start.
        this.destroySignal.assertNotDestroyed()
        if (this.isStarting()) {
            // use .then instead of async/await so
            // this.cachedNode.publish call can be sync
            return this.startNodeTask().then((node) =>
                node.broadcast(streamMessage)
            )
        }
        return this.cachedNode!.broadcast(streamMessage)
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
            await this.authentication.getAddress(),
            connectionCount
        )
    }

    async setStreamPartEntryPoints(streamPartId: StreamPartID, nodeDescriptors: NetworkPeerDescriptor[]): Promise<void> {
        if (this.isStarting()) {
            await this.startNodeTask(false)
        }
        const peerDescriptors = nodeDescriptors.map(peerDescriptorTranslator)
        this.cachedNode!.setStreamPartEntryPoints(streamPartId, peerDescriptors)
    }

    private isStarting(): boolean {
        return !this.cachedNode || !this.startNodeComplete
    }

    once<E extends keyof Events>(eventName: E, listener: Events[E]): void {
        this.eventEmitter.once(eventName, listener as any)
    }

    private async getEntryPoints(): Promise<NetworkPeerDescriptor[]> {
        const discoveryConfig = this.config.network.controlLayer.entryPointDiscovery
        const discoveredEntryPoints = (discoveryConfig?.enabled)
            ? await this.operatorRegistry.findRandomNetworkEntrypoints(
                discoveryConfig.maxEntryPoints!,
                discoveryConfig.maxQueryResults!,
                discoveryConfig.maxHeartbeatAgeHours!,
            )
            : []
        return [...this.config.network.controlLayer.entryPoints!, ...discoveredEntryPoints]
    }
}
