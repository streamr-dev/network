/**
 * Wrap a network node.
 */
import { inject, Lifecycle, scoped } from 'tsyringe'
import EventEmitter from 'eventemitter3'
import { NetworkNodeOptions, createNetworkNode as _createNetworkNode, MetricsContext } from 'streamr-network'
import { uuid } from './utils/uuid'
import { pOnce } from './utils/promises'
import { NetworkConfig, ConfigInjectionToken, TrackerRegistrySmartContract } from './Config'
import { StreamMessage, StreamPartID, ProxyDirection } from 'streamr-client-protocol'
import { DestroySignal } from './DestroySignal'
import { EthereumConfig, generateEthereumAccount, getMainnetProvider } from './Ethereum'
import { getTrackerRegistryFromContract } from './registry/getTrackerRegistryFromContract'
import { Authentication, AuthenticationInjectionToken } from './Authentication'
import { toEthereumAddress } from '@streamr/utils'

// TODO should we make getNode() an internal method, and provide these all these services as client methods?
export interface NetworkNodeStub {
    getNodeId: () => string
    addMessageListener: (listener: (msg: StreamMessage) => void) => void
    removeMessageListener: (listener: (msg: StreamMessage) => void) => void
    subscribe: (streamPartId: StreamPartID) => void
    subscribeAndWaitForJoin: (streamPart: StreamPartID, timeout?: number) => Promise<number>
    waitForJoinAndPublish: (msg: StreamMessage, timeout?: number) => Promise<number>
    unsubscribe: (streamPartId: StreamPartID) => void
    publish: (streamMessage: StreamMessage) => void
    getStreamParts: () => Iterable<StreamPartID>
    getNeighbors: () => ReadonlyArray<string>
    getNeighborsForStreamPart: (streamPartId: StreamPartID) => ReadonlyArray<string>
    getRtt: (nodeId: string) => number | undefined
    setExtraMetadata: (metadata: Record<string, unknown>) => void
    getMetricsContext: () => MetricsContext
    hasStreamPart: (streamPartId: StreamPartID) => boolean
    hasProxyConnection: (streamPartId: StreamPartID, contactNodeId: string, direction: ProxyDirection) => boolean
    /** @internal */
    start: () => void
    /** @internal */
    stop: () => Promise<unknown>
    /** @internal */
    openProxyConnection: (streamPartId: StreamPartID, nodeId: string, direction: ProxyDirection, userId: string) => Promise<void>
    /** @internal */
    closeProxyConnection: (streamPartId: StreamPartID, nodeId: string, direction: ProxyDirection) => Promise<void>
}

export const getEthereumAddressFromNodeId = (nodeId: string): string => {
    const ETHERUM_ADDRESS_LENGTH = 42
    return nodeId.substring(0, ETHERUM_ADDRESS_LENGTH)
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
    createNetworkNode(opts: NetworkNodeOptions): NetworkNodeStub {
        return _createNetworkNode(opts)
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
    private readonly networkConfig: NetworkConfig
    private readonly ethereumConfig: EthereumConfig
    private readonly eventEmitter: EventEmitter<Events>

    constructor(
        private destroySignal: DestroySignal,
        private networkNodeFactory: NetworkNodeFactory,
        @inject(AuthenticationInjectionToken) private authentication: Authentication,
        @inject(ConfigInjectionToken.Network) networkConfig: NetworkConfig,
        @inject(ConfigInjectionToken.Ethereum) ethereumConfig: EthereumConfig
    ) {
        this.networkConfig = networkConfig
        this.ethereumConfig = ethereumConfig
        this.eventEmitter = new EventEmitter<Events>()
        destroySignal.onDestroy.listen(this.destroy)
    }

    private assertNotDestroyed(): void {
        this.destroySignal.assertNotDestroyed()
    }

    private async getNormalizedNetworkOptions(): Promise<NetworkNodeOptions> {
        if ((this.networkConfig.trackers as TrackerRegistrySmartContract).contractAddress) {
            const trackerRegistry = await getTrackerRegistryFromContract({
                contractAddress: toEthereumAddress((this.networkConfig.trackers as TrackerRegistrySmartContract).contractAddress),
                jsonRpcProvider: getMainnetProvider(this.ethereumConfig)
            })
            return {
                ...this.networkConfig,
                trackers: trackerRegistry.getAllTrackers()
            }
        }
        return this.networkConfig as NetworkNodeOptions
    }

    private async initNode(): Promise<NetworkNodeStub> {
        this.assertNotDestroyed()
        if (this.cachedNode) { return this.cachedNode }

        let id = this.networkConfig.id
        if (id == null || id === '') {
            id = await this.generateId()
        } else if (!this.authentication.isAuthenticated()) {
            throw new Error(`cannot set explicit nodeId ${id} without authentication`)
        } else {
            const ethereumAddress = await this.authentication.getAddress()
            if (!id.toLowerCase().startsWith(ethereumAddress.toLowerCase())) {
                throw new Error(`given node id ${id} not compatible with authenticated wallet ${ethereumAddress}`)
            }
        }

        const networkOptions = await this.getNormalizedNetworkOptions()
        const node = this.networkNodeFactory.createNetworkNode({
            disconnectionWaitTime: 200,
            ...networkOptions,
            id,
            metricsContext: new MetricsContext()
        })

        if (!this.destroySignal.isDestroyed()) {
            this.cachedNode = node
        }

        return node
    }

    private async generateId(): Promise<string> {
        if (this.authentication.isAuthenticated()) {
            const address = await this.authentication.getAddress()
            return `${address}#${uuid()}`
        } else {
            return generateEthereumAccount().address
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
    private startNodeTask = pOnce(async () => {
        this.startNodeCalled = true
        try {
            const node = await this.initNode()
            if (!this.destroySignal.isDestroyed()) {
                node.start()
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
    publishToNode(streamMessage: StreamMessage): void | Promise<void> {
        // NOTE: function is intentionally not async for performance reasons.
        // Will call cachedNode.publish immediately if cachedNode is set.
        // Otherwise will wait for node to start.
        this.destroySignal.assertNotDestroyed()
        if (this.isStarting()) {
            // use .then instead of async/await so
            // this.cachedNode.publish call can be sync
            return this.startNodeTask().then((node) => {
                return node.publish(streamMessage)
            })
        }
        return this.cachedNode!.publish(streamMessage)
    }

    async openProxyConnection(streamPartId: StreamPartID, nodeId: string, direction: ProxyDirection): Promise<void> {
        if (this.isStarting()) {
            await this.startNodeTask()
        }
        await this.cachedNode!.openProxyConnection(streamPartId, nodeId, direction, (await this.authentication.getAddress()))
    }

    async closeProxyConnection(streamPartId: StreamPartID, nodeId: string, direction: ProxyDirection): Promise<void> {
        if (this.isStarting()) {
            return
        }
        await this.cachedNode!.closeProxyConnection(streamPartId, nodeId, direction)
    }

    private isStarting(): boolean {
        return !this.cachedNode || !this.startNodeComplete
    }

    once<E extends keyof Events>(eventName: E, listener: Events[E]): void {
        this.eventEmitter.once(eventName, listener as any)
    }
}

