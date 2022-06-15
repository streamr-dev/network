import 'reflect-metadata'
import './utils/PatchTsyringe'
import { container as rootContainer, DependencyContainer } from 'tsyringe'

import { Ethereum } from './Ethereum'
import { uuid } from './utils/uuid'
import { counterId } from './utils/utils'
import { pOnce } from './utils/promises'
import { Debug } from './utils/log'
import { Context } from './utils/Context'
import { ConfigInjectionToken, StrictStreamrClientConfig, StreamrClientConfig, createStrictConfig } from './Config'
import { BrubeckContainer } from './Container'

import { Publisher } from './publish/Publisher'
import { Subscriber } from './subscribe/Subscriber'
import { ProxyPublishSubscribe } from './ProxyPublishSubscribe'
import { ResendOptions, Resends } from './subscribe/Resends'
import { ResendSubscription } from './subscribe/ResendSubscription'
import { BrubeckNode, NetworkNodeStub } from './BrubeckNode'
import { DestroySignal } from './DestroySignal'
import { GroupKeyStoreFactory, UpdateEncryptionKeyOptions } from './encryption/GroupKeyStoreFactory'
import { StorageNodeMetadata, StorageNodeRegistry } from './StorageNodeRegistry'
import { StreamRegistry } from './StreamRegistry'
import { StreamDefinition } from './types'
import { Subscription, SubscriptionOnMessage } from './subscribe/Subscription'
import { StreamIDBuilder } from './StreamIDBuilder'
import { StreamrClientEventEmitter, StreamrClientEvents } from './events'
import { EthereumAddress, ProxyDirection, StreamID, StreamMessage } from 'streamr-client-protocol'
import { MessageStream, MessageStreamOnMessage } from './subscribe/MessageStream'
import { Stream, StreamProperties } from './Stream'
import { SearchStreamsPermissionFilter } from './searchStreams'
import { PermissionAssignment, PermissionQuery } from './permission'
import { MetricsPublisher } from './MetricsPublisher'
import { MessageMetadata } from './index-exports'

let uid: string = process.pid != null
    // Use process id in node uid.
    ? `${process.pid}`
    // Fall back to `uuid()` later (see initContainer). Doing it here will break browser projects
    // that utilize server-side rendering (no `window` while build's target is `web`).
    : ''

/**
 * @category Important
 */
export class StreamrClient implements Context {
    static generateEthereumAccount = Ethereum.generateEthereumAccount.bind(Ethereum)

    /** @internal */
    readonly id
    /** @internal */
    readonly debug

    private container: DependencyContainer
    private node: BrubeckNode
    private ethereum: Ethereum
    private resends: Resends
    private publisher: Publisher
    private subscriber: Subscriber
    private proxyPublishSubscribe: ProxyPublishSubscribe
    private groupKeyStoreFactory: GroupKeyStoreFactory
    private destroySignal: DestroySignal
    private streamRegistry: StreamRegistry
    private storageNodeRegistry: StorageNodeRegistry
    private streamIdBuilder: StreamIDBuilder
    private eventEmitter: StreamrClientEventEmitter

    constructor(options: StreamrClientConfig = {}, parentContainer = rootContainer) {
        const config = createStrictConfig(options)
        const container = parentContainer.createChildContainer()
        initContainer(config, container)

        this.container = container
        this.node = container.resolve<BrubeckNode>(BrubeckNode)
        this.ethereum = container.resolve<Ethereum>(Ethereum)
        this.resends = container.resolve<Resends>(Resends)
        this.publisher = container.resolve<Publisher>(Publisher)
        this.subscriber = container.resolve<Subscriber>(Subscriber)
        this.proxyPublishSubscribe = container.resolve<ProxyPublishSubscribe>(ProxyPublishSubscribe)
        this.groupKeyStoreFactory = container.resolve<GroupKeyStoreFactory>(GroupKeyStoreFactory)
        this.destroySignal = container.resolve<DestroySignal>(DestroySignal)
        this.streamRegistry = container.resolve<StreamRegistry>(StreamRegistry)
        this.storageNodeRegistry = container.resolve<StorageNodeRegistry>(StorageNodeRegistry)
        this.streamIdBuilder = container.resolve<StreamIDBuilder>(StreamIDBuilder)
        this.eventEmitter = container.resolve<StreamrClientEventEmitter>(StreamrClientEventEmitter)
        container.resolve<MetricsPublisher>(MetricsPublisher) // side effect: activates metrics publisher

        const context = container.resolve<Context>(Context as any)
        this.id = context.id
        this.debug = context.debug
    }

    // --------------------------------------------------------------------------------------------
    // Publish
    // --------------------------------------------------------------------------------------------

    /**
     * @category Important
     */
    async publish<T>(
        streamDefinition: StreamDefinition,
        content: T,
        metadata?: MessageMetadata
    ): Promise<StreamMessage<T>> {
        const result = await this.publisher.publish(streamDefinition, content, metadata)
        this.eventEmitter.emit('publish', undefined)
        return result
    }

    async updateEncryptionKey(opts: UpdateEncryptionKeyOptions): Promise<void> {
        if (opts.streamId === undefined) {
            throw new Error('streamId required')
        }
        const streamId = await this.streamIdBuilder.toStreamID(opts.streamId)
        const store = await this.groupKeyStoreFactory.getStore(streamId)
        if (opts.distributionMethod === 'rotate') {
            if (opts.key === undefined) {
                return store.rotateGroupKey()
            } else { // eslint-disable-line no-else-return
                return store.setNextGroupKey(opts.key)
            }
        } else if (opts.distributionMethod === 'rekey') { // eslint-disable-line no-else-return
            return store.rekey(opts.key)
        } else {
            throw new Error(`assertion failed: distribution method ${opts.distributionMethod}`)
        }
    }

    // --------------------------------------------------------------------------------------------
    // Subscribe
    // --------------------------------------------------------------------------------------------

    /**
     * @category Important
     */
    subscribe<T>(
        options: StreamDefinition & { resend: ResendOptions },
        onMessage?: SubscriptionOnMessage<T>
    ): Promise<ResendSubscription<T>>
    subscribe<T>(
        options: StreamDefinition,
        onMessage?: SubscriptionOnMessage<T>
    ): Promise<Subscription<T>>
    async subscribe<T>(
        options: StreamDefinition & { resend?: ResendOptions },
        onMessage?: SubscriptionOnMessage<T>
    ): Promise<Subscription<T> | ResendSubscription<T>> {
        let result
        if (options.resend !== undefined) {
            result = await this.resendSubscribe(options, options.resend, onMessage)
        } else {
            result = await this.subscriber.subscribe(options, onMessage)
        }
        this.eventEmitter.emit('subscribe', undefined)
        return result
    }

    private async resendSubscribe<T>(
        streamDefinition: StreamDefinition,
        resendOptions: ResendOptions,
        onMessage?: SubscriptionOnMessage<T>
    ): Promise<ResendSubscription<T>> {
        const streamPartId = await this.streamIdBuilder.toStreamPartID(streamDefinition)
        const subSession = this.subscriber.getOrCreateSubscriptionSession<T>(streamPartId)
        const sub = new ResendSubscription<T>(subSession, this.resends, resendOptions, this.container)
        if (onMessage) {
            sub.useLegacyOnMessageHandler(onMessage)
        }
        await this.subscriber.addSubscription<T>(sub)
        return sub
    }

    /**
     * Subscribe to all partitions for stream.
     */
    subscribeAll<T>(streamId: StreamID, onMessage?: SubscriptionOnMessage<T>): Promise<MessageStream<T>> {
        return this.subscriber.subscribeAll(streamId, onMessage)
    }

    /**
     * @category Important
     */
    unsubscribe(streamDefinitionOrSubscription?: StreamDefinition | Subscription): Promise<unknown> {
        return this.subscriber.unsubscribe(streamDefinitionOrSubscription)
    }

    /**
     * Get subscriptions matching streamId or streamId + streamPartition
     * @category Important
     */
    getSubscriptions(streamDefinition?: StreamDefinition): Promise<Subscription<unknown>[]> {
        return this.subscriber.getSubscriptions(streamDefinition)
    }

    // --------------------------------------------------------------------------------------------
    // Resend
    // --------------------------------------------------------------------------------------------

    /**
     * Call last/from/range as appropriate based on arguments
     * @category Important
     */
    resend<T>(
        streamDefinition: StreamDefinition,
        options: ResendOptions,
        onMessage?: MessageStreamOnMessage<T>
    ): Promise<MessageStream<T>> {
        return this.resends.resend(streamDefinition, options, onMessage)
    }

    /**
     * Resend for all partitions of a stream.
     */
    resendAll<T>(streamId: StreamID, options: ResendOptions, onMessage?: MessageStreamOnMessage<T>): Promise<MessageStream<T>> {
        return this.resends.resendAll(streamId, options, onMessage)
    }

    waitForStorage(streamMessage: StreamMessage, options?: {
        interval?: number
        timeout?: number
        count?: number
        messageMatchFn?: (msgTarget: StreamMessage, msgGot: StreamMessage) => boolean
    }): Promise<void> {
        return this.resends.waitForStorage(streamMessage, options)
    }

    // --------------------------------------------------------------------------------------------
    // Stream management
    // --------------------------------------------------------------------------------------------

    /**
     * @category Important
     */
    getStream(streamIdOrPath: string): Promise<Stream> {
        return this.streamRegistry.getStream(streamIdOrPath)
    }

    /**
     * @category Important
     */
    createStream(propsOrStreamIdOrPath: StreamProperties | string): Promise<Stream> {
        return this.streamRegistry.createStream(propsOrStreamIdOrPath)
    }

    /**
     * @category Important
     */
    getOrCreateStream(props: { id: string, partitions?: number }): Promise<Stream> {
        return this.streamRegistry.getOrCreateStream(props)
    }

    updateStream(props: StreamProperties): Promise<Stream> {
        return this.streamRegistry.updateStream(props)
    }

    deleteStream(streamIdOrPath: string): Promise<void> {
        return this.streamRegistry.deleteStream(streamIdOrPath)
    }

    searchStreams(term: string | undefined, permissionFilter: SearchStreamsPermissionFilter | undefined): AsyncGenerator<Stream> {
        return this.streamRegistry.searchStreams(term, permissionFilter)
    }

    // --------------------------------------------------------------------------------------------
    // Permissions
    // --------------------------------------------------------------------------------------------

    getStreamPublishers(streamIdOrPath: string): AsyncGenerator<EthereumAddress> {
        return this.streamRegistry.getStreamPublishers(streamIdOrPath)
    }

    getStreamSubscribers(streamIdOrPath: string): AsyncGenerator<EthereumAddress> {
        return this.streamRegistry.getStreamSubscribers(streamIdOrPath)
    }

    hasPermission(query: PermissionQuery): Promise<boolean> {
        return this.streamRegistry.hasPermission(query)
    }

    getPermissions(streamIdOrPath: string): Promise<PermissionAssignment[]> {
        return this.streamRegistry.getPermissions(streamIdOrPath)
    }

    grantPermissions(streamIdOrPath: string, ...assignments: PermissionAssignment[]): Promise<void> {
        return this.streamRegistry.grantPermissions(streamIdOrPath, ...assignments)
    }

    revokePermissions(streamIdOrPath: string, ...assignments: PermissionAssignment[]): Promise<void> {
        return this.streamRegistry.revokePermissions(streamIdOrPath, ...assignments)
    }

    setPermissions(...items: {
        streamId: string,
        assignments: PermissionAssignment[]
    }[]): Promise<void> {
        return this.streamRegistry.setPermissions(...items)
    }

    isStreamPublisher(streamIdOrPath: string, userAddress: EthereumAddress): Promise<boolean> {
        return this.streamRegistry.isStreamPublisher(streamIdOrPath, userAddress)
    }
    
    isStreamSubscriber(streamIdOrPath: string, userAddress: EthereumAddress): Promise<boolean> {
        return this.streamRegistry.isStreamSubscriber(streamIdOrPath, userAddress)
    }

    // --------------------------------------------------------------------------------------------
    // Storage
    // --------------------------------------------------------------------------------------------

    setStorageNodeMetadata(metadata: StorageNodeMetadata | undefined): Promise<void> {
        return this.storageNodeRegistry.setStorageNodeMetadata(metadata)
    }

    getStorageNodeMetadata(nodeAddress: EthereumAddress): Promise<StorageNodeMetadata> {
        return this.storageNodeRegistry.getStorageNodeMetadata(nodeAddress)
    }
    
    addStreamToStorageNode(streamIdOrPath: string, nodeAddress: EthereumAddress): Promise<void> {
        return this.storageNodeRegistry.addStreamToStorageNode(streamIdOrPath, nodeAddress)
    }
    
    removeStreamFromStorageNode(streamIdOrPath: string, nodeAddress: EthereumAddress): Promise<void> {
        return this.storageNodeRegistry.removeStreamFromStorageNode(streamIdOrPath, nodeAddress)
    }
    
    isStoredStream(streamIdOrPath: string, nodeAddress: EthereumAddress): Promise<boolean> {
        return this.storageNodeRegistry.isStoredStream(streamIdOrPath, nodeAddress)
    }
    
    getStoredStreams(nodeAddress: EthereumAddress): Promise<{ streams: Stream[], blockNumber: number }> {
        return this.storageNodeRegistry.getStoredStreams(nodeAddress)
    }
    
    getStorageNodes(streamIdOrPath?: string): Promise<EthereumAddress[]> {
        return this.storageNodeRegistry.getStorageNodes(streamIdOrPath)
    }

    // --------------------------------------------------------------------------------------------
    // Authentication
    // --------------------------------------------------------------------------------------------

    getAddress(): Promise<EthereumAddress> {
        return this.ethereum.getAddress()
    }

    // --------------------------------------------------------------------------------------------
    // Network node
    // --------------------------------------------------------------------------------------------

    /**
     * Get started network node
     */
    getNode(): Promise<NetworkNodeStub> {
        return this.node.getNode()
    }

    openProxyConnections(streamDefinition: StreamDefinition, nodeIds: string[], direction: ProxyDirection): Promise<void> {
        return this.proxyPublishSubscribe.openProxyConnections(streamDefinition, nodeIds, direction)
    }

    closeProxyConnections(streamDefinition: StreamDefinition, nodeIds: string[], direction: ProxyDirection): Promise<void> {
        return this.proxyPublishSubscribe.closeProxyConnections(streamDefinition, nodeIds, direction)
    }

    // --------------------------------------------------------------------------------------------
    // Lifecycle
    // --------------------------------------------------------------------------------------------

    connect = pOnce(async () => {
        await this.node.startNode()
        const tasks = [
            this.publisher.start(),
        ]

        await Promise.allSettled(tasks)
        await Promise.all(tasks)
    })

    destroy = pOnce(async () => {
        this.eventEmitter.removeAllListeners()
        this.connect.reset() // reset connect (will error on next call)
        const tasks = [
            this.destroySignal.destroy().then(() => undefined),
            this.publisher.stop(),
            this.subscriber.stop(),
            this.groupKeyStoreFactory.stop()
        ]

        await Promise.allSettled(tasks)
        await Promise.all(tasks)
    })

    // --------------------------------------------------------------------------------------------
    // Logging
    // --------------------------------------------------------------------------------------------

    /** @internal */
    enableDebugLogging(prefix = 'Streamr*'): void { // eslint-disable-line class-methods-use-this
        Debug.enable(prefix)
    }

    /** @internal */
    disableDebugLogging(): void { // eslint-disable-line class-methods-use-this
        Debug.disable()
    }

    // --------------------------------------------------------------------------------------------
    // Events
    // --------------------------------------------------------------------------------------------

    on<T extends keyof StreamrClientEvents>(eventName: T, listener: StreamrClientEvents[T]): void {
        this.eventEmitter.on(eventName, listener as any)
    }

    once<T extends keyof StreamrClientEvents>(eventName: T, listener: StreamrClientEvents[T]): void {
        this.eventEmitter.once(eventName, listener as any)
    }

    off<T extends keyof StreamrClientEvents>(eventName: T, listener: StreamrClientEvents[T]): void {
        this.eventEmitter.off(eventName, listener as any)
    }
}

/**
 * @internal
 */
export function initContainer(
    config: StrictStreamrClientConfig, 
    c: DependencyContainer
): Context {
    uid = uid || `${uuid().slice(-4)}${uuid().slice(0, 4)}`
    const id = counterId(`StreamrClient:${uid}${config.id ? `:${config.id}` : ''}`)
    const debug = Debug(id)
    // @ts-expect-error not in types
    if (!debug.inspectOpts) {
        // @ts-expect-error not in types
        debug.inspectOpts = {}
    }
    // @ts-expect-error not in types
    Object.assign(debug.inspectOpts, {
        // @ts-expect-error not in types
        ...debug.inspectOpts,
        ...config.debug.inspectOpts
    })
    debug('create')

    const rootContext = {
        id,
        debug
    }

    c.register(Context as any, {
        useValue: rootContext
    })

    c.register(BrubeckContainer, {
        useValue: c
    })

    // associate values to config tokens
    const configTokens: [symbol, object][] = [
        [ConfigInjectionToken.Root, config],
        [ConfigInjectionToken.Auth, config.auth],
        [ConfigInjectionToken.Ethereum, config],
        [ConfigInjectionToken.Network, config.network],
        [ConfigInjectionToken.Connection, config],
        [ConfigInjectionToken.Subscribe, config],
        [ConfigInjectionToken.Publish, config],
        [ConfigInjectionToken.Encryption, config],
        [ConfigInjectionToken.Cache, config.cache],
    ]

    configTokens.forEach(([token, useValue]) => {
        c.register(token, { useValue })
    })

    return rootContext
}
