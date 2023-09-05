/**
 * Wrap a network node.
 */
import { PeerDescriptor } from '@streamr/dht'
import { StreamMessage, StreamPartID } from '@streamr/protocol'
import { NetworkNode, NetworkOptions, ProxyDirection, UserID, NodeID } from '@streamr/trackerless-network'
import { EthereumAddress, MetricsContext } from '@streamr/utils'
import { inject, Lifecycle, scoped } from 'tsyringe'
import EventEmitter from 'eventemitter3'
import { Authentication, AuthenticationInjectionToken } from './Authentication'
import { ConfigInjectionToken, StrictStreamrClientConfig, NetworkPeerDescriptor } from './Config'
import { DestroySignal } from './DestroySignal'
import { pOnce } from './utils/promises'
import { uuid } from './utils/uuid'
import { peerDescriptorTranslator } from './utils/utils'

// TODO should we make getNode() an internal method, and provide these all these services as client methods?
/** @deprecated This in an internal interface */
export interface NetworkNodeStub {
    getNodeId: () => NodeID
    addMessageListener: (listener: (msg: StreamMessage) => void) => void
    removeMessageListener: (listener: (msg: StreamMessage) => void) => void
    subscribe: (streamPartId: StreamPartID) => Promise<void>
    subscribeAndWaitForJoin: (streamPart: StreamPartID, timeout?: number) => Promise<number>
    waitForJoinAndPublish: (msg: StreamMessage, timeout?: number) => Promise<number>
    unsubscribe: (streamPartId: StreamPartID) => void
    publish: (streamMessage: StreamMessage) => Promise<void>
    getStreamParts: () => StreamPartID[]
    getNeighbors: () => string[]
    getNeighborsForStreamPart: (streamPartId: StreamPartID) => ReadonlyArray<NodeID>
    setExtraMetadata: (metadata: Record<string, unknown>) => void
    getPeerDescriptor: () => PeerDescriptor
    getMetricsContext: () => MetricsContext
    getDiagnosticInfo: () => Record<string, unknown>
    hasStreamPart: (streamPartId: StreamPartID) => boolean
    inspect(node: PeerDescriptor, streamPartId: StreamPartID): Promise<boolean>
    /** @internal */
    hasProxyConnection: (streamPartId: StreamPartID, contactNodeId: NodeID, direction: ProxyDirection) => boolean
    /** @internal */
    start: (doJoin?: boolean) => Promise<void>
    /** @internal */
    stop: () => Promise<void>
    /** @internal */
    setProxies: (
        streamPartId: StreamPartID,
        peerDescriptors: PeerDescriptor[],
        direction: ProxyDirection,
        userId: UserID,
        connectionCount?: number
    ) => Promise<void>
    setStreamPartEntryPoints: (streamPartId: StreamPartID, peerDescriptors: PeerDescriptor[]) => void
}

export interface Events {
    start: () => void
}

export const toUserID = (address: EthereumAddress): UserID => {
    return Buffer.from(address.slice(2), 'hex') as UserID
}

/**
 * The factory is used so that integration tests can replace the real network node with a fake instance
 */
/* eslint-disable class-methods-use-this */
@scoped(Lifecycle.ContainerScoped)
export class NetworkNodeFactory {
    createNetworkNode(opts: NetworkOptions): NetworkNodeStub {
        return new NetworkNode(opts)
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
    private readonly config: Pick<StrictStreamrClientConfig, 'network' | 'contracts'>
    private readonly authentication: Authentication
    private readonly eventEmitter: EventEmitter<Events>
    private readonly destroySignal: DestroySignal

    constructor(
        networkNodeFactory: NetworkNodeFactory,
        @inject(ConfigInjectionToken) config: Pick<StrictStreamrClientConfig, 'network' | 'contracts'>,
        @inject(AuthenticationInjectionToken) authentication: Authentication,
        destroySignal: DestroySignal
    ) {
        this.networkNodeFactory = networkNodeFactory
        this.config = config
        this.authentication = authentication
        this.eventEmitter = new EventEmitter<Events>()
        this.destroySignal = destroySignal
        destroySignal.onDestroy.listen(this.destroy)
    }

    private assertNotDestroyed(): void {
        this.destroySignal.assertNotDestroyed()
    }

    private async getNetworkOptions(): Promise<NetworkOptions> {
        let id = this.config.network!.node!.id

        const entryPoints = this.getEntryPoints()

        const ownPeerDescriptor: PeerDescriptor | undefined = this.config.network.controlLayer!.peerDescriptor ? 
            peerDescriptorTranslator(this.config.network.controlLayer!.peerDescriptor) : undefined

        if (id == null || id === '') {
            id = await this.generateId()
        } else {
            const ethereumAddress = await this.authentication.getAddress()
            if (!id.toLowerCase().startsWith(ethereumAddress)) {
                throw new Error(`given node id ${id} not compatible with authenticated wallet ${ethereumAddress}`)
            }
        }

        return {
            layer0: {
                ...this.config.network.controlLayer,
                entryPoints,
                peerDescriptor: ownPeerDescriptor
            },
            networkNode: {
                ...this.config.network.node,
                id: id as NodeID
            },
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

    private async generateId(): Promise<string> {
        const address = await this.authentication.getAddress()
        return `${address}#${uuid()}`
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
                node.publish(streamMessage)
            )
        }
        return this.cachedNode!.publish(streamMessage)
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
        proxyNodes: NetworkPeerDescriptor[],
        direction: ProxyDirection,
        connectionCount?: number
    ): Promise<void> {
        if (this.isStarting()) {
            await this.startNodeTask(false)
        }
        const peerDescriptors = proxyNodes.map(peerDescriptorTranslator)
        await this.cachedNode!.setProxies(
            streamPartId,
            peerDescriptors,
            direction,
            toUserID(await this.authentication.getAddress()),
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

    getEntryPoints(): PeerDescriptor[] {
        return this.config.network.controlLayer!.entryPoints!.map(peerDescriptorTranslator)
    }
}
