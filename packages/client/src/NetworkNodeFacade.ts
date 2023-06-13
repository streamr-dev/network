/**
 * Wrap a network node.
 */
import { inject, Lifecycle, scoped } from 'tsyringe'
import EventEmitter from 'eventemitter3'
import {
    NetworkNode,
    NetworkOptions,
    ProxyDirection
} from '@streamr/trackerless-network'
import {
    PeerDescriptor,
    PeerID
} from '@streamr/dht'
import { MetricsContext } from '@streamr/utils'
import { uuid } from './utils/uuid'
import { pOnce } from './utils/promises'
import { entryPointTranslator } from './utils/utils'
import { ConfigInjectionToken, StrictStreamrClientConfig, JsonPeerDescriptor } from './Config'
import { StreamMessage, StreamPartID } from '@streamr/protocol'
import { DestroySignal } from './DestroySignal'
import { Authentication, AuthenticationInjectionToken } from './Authentication'

// TODO should we make getNode() an internal method, and provide these all these services as client methods?
/** @deprecated This in an internal interface */
export interface NetworkNodeStub {
    getNodeId: () => string
    addMessageListener: (listener: (msg: StreamMessage) => void) => void
    removeMessageListener: (listener: (msg: StreamMessage) => void) => void
    subscribe: (streamPartId: StreamPartID, entryPointDescriptors: PeerDescriptor[]) => void
    subscribeAndWaitForJoin: (streamPart: StreamPartID, entryPointDescriptors: PeerDescriptor[], timeout?: number) => Promise<number>
    waitForJoinAndPublish: (msg: StreamMessage, entryPointDescriptors: PeerDescriptor[], timeout?: number) => Promise<number>
    unsubscribe: (streamPartId: StreamPartID) => void
    publish: (streamMessage: StreamMessage, entryPointDescriptors: PeerDescriptor[]) => void
    getStreamParts: () => StreamPartID[]
    getNeighbors: () => string[]
    getNeighborsForStreamPart: (streamPartId: StreamPartID) => ReadonlyArray<string>
    // getRtt: (nodeId: string) => number | undefined
    setExtraMetadata: (metadata: Record<string, unknown>) => void
    getMetricsContext: () => MetricsContext
    getDiagnosticInfo: () => Record<string, unknown>
    hasStreamPart: (streamPartId: StreamPartID) => boolean
    /** @internal */
    hasProxyConnection: (streamPartId: StreamPartID, contactNodeId: string, direction: ProxyDirection) => boolean
    /** @internal */
    start: () => Promise<void>
    /** @internal */
    stop: () => Promise<void>
    /** @internal */
    setProxies: (
        streamPartId: StreamPartID,
        peerDescriptors: PeerDescriptor[],
        direction: ProxyDirection,
        getUserId: () => Promise<string>,
        connectionCount?: number
    ) => Promise<void>
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
        return new NetworkNode(opts)
    }
}

/**
 * Wrap a network node.
 * Lazily creates & starts node on first call to getNode().
 */
@scoped(Lifecycle.ContainerScoped)
export class NetworkNodeFacade {

    private destroySignal: DestroySignal
    private networkNodeFactory: NetworkNodeFactory
    private authentication: Authentication
    private cachedNode?: NetworkNodeStub
    private startNodeCalled = false
    private startNodeComplete = false
    private readonly config: Pick<StrictStreamrClientConfig, 'network' | 'contracts'>
    private readonly eventEmitter: EventEmitter<Events>

    constructor(
        destroySignal: DestroySignal,
        networkNodeFactory: NetworkNodeFactory,
        @inject(AuthenticationInjectionToken) authentication: Authentication,
        @inject(ConfigInjectionToken) config: Pick<StrictStreamrClientConfig, 'network' | 'contracts'>
    ) {
        this.destroySignal = destroySignal
        this.networkNodeFactory = networkNodeFactory
        this.authentication = authentication
        this.config = config
        this.eventEmitter = new EventEmitter<Events>()
        destroySignal.onDestroy.listen(this.destroy)
    }

    private assertNotDestroyed(): void {
        this.destroySignal.assertNotDestroyed()
    }

    private async getNetworkOptions(): Promise<NetworkOptions> {
        let id = this.config.network!.networkNode!.id

        const entryPoints = this.getEntryPoints()

        const ownPeerDescriptor: PeerDescriptor | undefined = this.config.network.layer0!.peerDescriptor ? 
            this.jsonToPeerDescriptor(this.config.network.layer0!.peerDescriptor) : undefined

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
                ...this.config.network.layer0,
                entryPoints,
                peerDescriptor: ownPeerDescriptor
            },
            networkNode: {
                ...this.config.network.networkNode,
                id
            },
            metricsContext: new MetricsContext()
        }
    }

    private jsonToPeerDescriptor(jsonPeerDescriptor: JsonPeerDescriptor): PeerDescriptor {
        return {
            ...jsonPeerDescriptor,
            websocket: jsonPeerDescriptor.websocket,
            kademliaId: PeerID.fromString(jsonPeerDescriptor!.kademliaId).value,
            nodeName: jsonPeerDescriptor!.kademliaId,
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
        const network = this.cachedNode
        this.cachedNode = undefined
        // stop node only if started or in progress
        if (network && this.startNodeCalled) {
            if (!this.startNodeComplete) {
                // wait for start to finish before stopping node
                const startNodeTask = this.startNodeTask()
                this.startNodeTask.reset() // allow subsequent calls to fail
                await startNodeTask
            }
            await network.stop()
        }
        this.startNodeTask.reset() // allow subsequent calls to fail
    })

    /**
     * Start network node, or wait for it to start if already started.
     */
    private startNodeTask = pOnce(async () => {
        this.startNodeCalled = true
        try {
            const node = await this.initNode()
            if (!this.destroySignal.isDestroyed()) {
                await node.start()
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

    async getNodeId(): Promise<string> {
        const node = await this.getNode()
        return node.getNodeId()
    }

    /**
     * Calls publish on node after starting it.
     * Basically a wrapper around: (await getNode()).publish(…)
     * but will be sync in case that node is already started.
     * Zalgo intentional. See below.
     */
    publishToNode(streamMessage: StreamMessage, knownEntryPoints: PeerDescriptor[]): void | Promise<void> {
        // NOTE: function is intentionally not async for performance reasons.
        // Will call cachedNode.publish immediately if cachedNode is set.
        // Otherwise will wait for node to start.
        this.destroySignal.assertNotDestroyed()
        if (this.isStarting()) {
            // use .then instead of async/await so
            // this.cachedNode.publish call can be sync
            return this.startNodeTask().then((node) => {
                return node.publish(streamMessage, knownEntryPoints)
            })
        }
        return this.cachedNode!.publish(streamMessage, knownEntryPoints)
    }
    
    async setProxies(
        streamPartId: StreamPartID,
        nodeDescriptors: JsonPeerDescriptor[],
        direction: ProxyDirection,
        connectionCount?: number
    ): Promise<void> {
        if (this.isStarting()) {
            await this.startNodeTask()
        }
        const peerDescriptors = nodeDescriptors.map(this.jsonToPeerDescriptor)
        await this.cachedNode!.setProxies(
            streamPartId,
            peerDescriptors,
            direction,
            () => this.authentication.getAddress(),
            connectionCount
        )
    }

    private isStarting(): boolean {
        return !this.cachedNode || !this.startNodeComplete
    }

    once<E extends keyof Events>(eventName: E, listener: Events[E]): void {
        this.eventEmitter.once(eventName, listener as any)
    }

    getEntryPoints(): PeerDescriptor[] {
        return entryPointTranslator(this.config.network.layer0!.entryPoints!)
    }
}

