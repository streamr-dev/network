/**
 * Wrap a network node.
 */
import { inject, Lifecycle, scoped } from 'tsyringe'
import EventEmitter from 'eventemitter3'
import {
    NetworkNode,
    NetworkOptions,
    PeerDescriptor,
    PeerID
} from '@streamr/trackerless-network'
import { MetricsContext } from '@streamr/utils'
import { uuid } from './utils/uuid'
import { pOnce } from './utils/promises'
import { ConfigInjectionToken, TrackerRegistryContract, StrictStreamrClientConfig } from './Config'
import { StreamMessage, StreamPartID, ProxyDirection } from '@streamr/protocol'
import { DestroySignal } from './DestroySignal'
import { getMainnetProvider } from './Ethereum'
import { getTrackerRegistryFromContract } from './registry/getTrackerRegistryFromContract'
import { Authentication, AuthenticationInjectionToken } from './Authentication'
import { toEthereumAddress } from '@streamr/utils'

// TODO should we make getNode() an internal method, and provide these all these services as client methods?
/** @deprecated This in an internal interface */
export interface NetworkNodeStub {
    stack: any
    getNodeId: () => string
    addMessageListener: (listener: (msg: StreamMessage) => void) => void
    removeMessageListener: (listener: (msg: StreamMessage) => void) => void
    subscribe: (streamPartId: StreamPartID, entryPointDescriptor: PeerDescriptor) => void
    subscribeAndWaitForJoin: (streamPart: StreamPartID, entryPointDescriptor: PeerDescriptor, timeout?: number) => Promise<number>
    waitForJoinAndPublish: (msg: StreamMessage, entryPointDescriptor: PeerDescriptor, timeout?: number) => Promise<number>
    unsubscribe: (streamPartId: StreamPartID) => void
    publish: (streamMessage: StreamMessage, entryPointDescriptor: PeerDescriptor) => void
    getStreamParts: () => StreamPartID[]
    getNeighbors: () => string[]
    getNeighborsForStreamPart: (streamPartId: StreamPartID) => ReadonlyArray<string>
    getRtt: (nodeId: string) => number | undefined
    setExtraMetadata: (metadata: Record<string, unknown>) => void
    getMetricsContext: () => MetricsContext
    hasStreamPart: (streamPartId: StreamPartID) => boolean
    hasProxyConnection: (streamPartId: StreamPartID, contactNodeId: string, direction: ProxyDirection) => boolean
    /** @internal */
    start: () => Promise<void>
    /** @internal */
    stop: () => Promise<void>
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
    private cachedNetwork?: NetworkNode
    private startNodeCalled = false
    private startNodeComplete = false
    private readonly config: Pick<StrictStreamrClientConfig, 'network' | 'contracts'>
    private readonly eventEmitter: EventEmitter<Events>

    constructor(
        private destroySignal: DestroySignal,
        private networkNodeFactory: NetworkNodeFactory,
        @inject(AuthenticationInjectionToken) private authentication: Authentication,
        @inject(ConfigInjectionToken) config: Pick<StrictStreamrClientConfig, 'network' | 'contracts'>
    ) {
        this.config = config
        this.eventEmitter = new EventEmitter<Events>()
        destroySignal.onDestroy.listen(this.destroy)
    }

    private assertNotDestroyed(): void {
        this.destroySignal.assertNotDestroyed()
    }

    private async getNormalizedNetworkOptions(): Promise<NetworkOptions> {
        const entryPoints = this.config.network.entryPoints.map((ep) => {
            const peerDescriptor: PeerDescriptor = {
                kademliaId: PeerID.fromString(ep.kademliaId).value,
                type: ep.type,
                openInternet: ep.openInternet,
                udp: ep.udp,
                tcp: ep.tcp,
                websocket: ep.websocket,
            }
            return peerDescriptor
        })
        if ((this.config.network.trackers as TrackerRegistryContract).contractAddress) {
            const trackerRegistry = await getTrackerRegistryFromContract({
                contractAddress: toEthereumAddress((this.config.network.trackers as TrackerRegistryContract).contractAddress),
                jsonRpcProvider: getMainnetProvider(this.config)
            })
            return {
                ...this.config.network,
                entryPoints: entryPoints,
                trackers: trackerRegistry.getAllTrackers()
            }
        }
        return {
            ...this.config.network,
            entryPoints: entryPoints
        }
    }

    private async initNode(): Promise<NetworkNode> {
        this.assertNotDestroyed()
        if (this.cachedNetwork) { return this.cachedNetwork }

        let id = this.config.network.id
        if (id == null || id === '') {
            id = await this.generateId()
        } else {
            const ethereumAddress = await this.authentication.getAddress()
            if (!id.toLowerCase().startsWith(ethereumAddress)) {
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
            this.cachedNetwork = node
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
        const network = this.cachedNetwork
        this.cachedNetwork = undefined
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
    publishToNode(streamMessage: StreamMessage): void | Promise<void> {
        // NOTE: function is intentionally not async for performance reasons.
        // Will call cachedNode.publish immediately if cachedNode is set.
        // Otherwise will wait for node to start.
        this.destroySignal.assertNotDestroyed()
        const entryPoint = this.getEntryPoints()[0]
        if (this.isStarting()) {
            // use .then instead of async/await so
            // this.cachedNode.publish call can be sync
            return this.startNodeTask().then((node) => {
                return node.publish(streamMessage, entryPoint)
            })
        }
        return this.cachedNetwork!.publish(streamMessage, entryPoint)
    }

    async openProxyConnection(streamPartId: StreamPartID, nodeId: string, direction: ProxyDirection): Promise<void> {
        if (this.isStarting()) {
            await this.startNodeTask()
        }
        await this.cachedNetwork!.openProxyConnection(streamPartId, nodeId, direction, (await this.authentication.getAddress()))
    }

    async closeProxyConnection(streamPartId: StreamPartID, nodeId: string, direction: ProxyDirection): Promise<void> {
        if (this.isStarting()) {
            return
        }
        await this.cachedNetwork!.closeProxyConnection(streamPartId, nodeId, direction)
    }

    private isStarting(): boolean {
        return !this.cachedNetwork || !this.startNodeComplete
    }

    once<E extends keyof Events>(eventName: E, listener: Events[E]): void {
        this.eventEmitter.once(eventName, listener as any)
    }

    getEntryPoints(): PeerDescriptor[] {
        return this.config.network.entryPoints.map((ep) => {
            const peerDescriptor: PeerDescriptor = {
                kademliaId: PeerID.fromString(ep.kademliaId).value,
                type: ep.type,
                openInternet: ep.openInternet,
                udp: ep.udp,
                tcp: ep.tcp,
                websocket: ep.websocket
            }
            return peerDescriptor
        })
    }
}

