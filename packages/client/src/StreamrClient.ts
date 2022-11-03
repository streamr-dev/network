import 'reflect-metadata'
import { container as rootContainer } from 'tsyringe'
import { generateEthereumAccount as _generateEthereumAccount } from './Ethereum'
import { pOnce } from './utils/promises'
import { StreamrClientConfig, createStrictConfig, StrictStreamrClientConfig } from './Config'
import { Publisher } from './publish/Publisher'
import { Subscriber } from './subscribe/Subscriber'
import { ProxyPublishSubscribe } from './ProxyPublishSubscribe'
import { ResendOptions, Resends } from './subscribe/Resends'
import { ResendSubscription } from './subscribe/ResendSubscription'
import { NetworkNodeFacade, NetworkNodeStub } from './NetworkNodeFacade'
import { DestroySignal } from './DestroySignal'
import { GroupKeyStore, UpdateEncryptionKeyOptions } from './encryption/GroupKeyStore'
import { StorageNodeMetadata, StorageNodeRegistry } from './registry/StorageNodeRegistry'
import { StreamRegistry } from './registry/StreamRegistry'
import { StreamDefinition } from './types'
import { Subscription } from './subscribe/Subscription'
import { StreamIDBuilder } from './StreamIDBuilder'
import { StreamrClientEventEmitter, StreamrClientEvents } from './events'
import { ProxyDirection, StreamMessage } from 'streamr-client-protocol'
import { MessageStream, MessageListener } from './subscribe/MessageStream'
import { Stream, StreamProperties } from './Stream'
import { SearchStreamsPermissionFilter } from './registry/searchStreams'
import { PermissionAssignment, PermissionQuery } from './permission'
import { MetricsPublisher } from './MetricsPublisher'
import { MessageMetadata } from '../src/publish/Publisher'
import { initContainer } from './Container'
import { Authentication, AuthenticationInjectionToken } from './Authentication'
import { StreamStorageRegistry } from './registry/StreamStorageRegistry'
import { GroupKey } from './encryption/GroupKey'
import { PublisherKeyExchange } from './encryption/PublisherKeyExchange'
import { EthereumAddress, toEthereumAddress } from '@streamr/utils'
import { LoggerFactory } from './utils/LoggerFactory'

/**
 * @category Important
 */
export class StreamrClient {
    static readonly generateEthereumAccount = _generateEthereumAccount

    public readonly id: string
    private readonly config: StrictStreamrClientConfig
    private readonly node: NetworkNodeFacade
    private readonly authentication: Authentication
    private readonly resends: Resends
    private readonly publisher: Publisher
    private readonly subscriber: Subscriber
    private readonly proxyPublishSubscribe: ProxyPublishSubscribe
    private readonly groupKeyStore: GroupKeyStore
    private readonly destroySignal: DestroySignal
    private readonly streamRegistry: StreamRegistry
    private readonly streamStorageRegistry: StreamStorageRegistry
    private readonly storageNodeRegistry: StorageNodeRegistry
    private readonly loggerFactory: LoggerFactory
    private readonly streamIdBuilder: StreamIDBuilder
    private readonly eventEmitter: StreamrClientEventEmitter

    constructor(options: StreamrClientConfig = {}, parentContainer = rootContainer) {
        this.config = createStrictConfig(options)
        const container = parentContainer.createChildContainer()
        initContainer(this.config, container)

        this.id = this.config.id
        this.node = container.resolve<NetworkNodeFacade>(NetworkNodeFacade)
        this.authentication = container.resolve<Authentication>(AuthenticationInjectionToken)
        this.resends = container.resolve<Resends>(Resends)
        this.publisher = container.resolve<Publisher>(Publisher)
        this.subscriber = container.resolve<Subscriber>(Subscriber)
        this.proxyPublishSubscribe = container.resolve<ProxyPublishSubscribe>(ProxyPublishSubscribe)
        this.groupKeyStore = container.resolve<GroupKeyStore>(GroupKeyStore)
        this.destroySignal = container.resolve<DestroySignal>(DestroySignal)
        this.streamRegistry = container.resolve<StreamRegistry>(StreamRegistry)
        this.streamStorageRegistry = container.resolve<StreamStorageRegistry>(StreamStorageRegistry)
        this.storageNodeRegistry = container.resolve<StorageNodeRegistry>(StorageNodeRegistry)
        this.loggerFactory = container.resolve<LoggerFactory>(LoggerFactory)
        this.streamIdBuilder = container.resolve<StreamIDBuilder>(StreamIDBuilder)
        this.eventEmitter = container.resolve<StreamrClientEventEmitter>(StreamrClientEventEmitter)
        container.resolve<PublisherKeyExchange>(PublisherKeyExchange) // side effect: activates publisher key exchange
        container.resolve<MetricsPublisher>(MetricsPublisher) // side effect: activates metrics publisher
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
        const queue = await this.publisher.getGroupKeyQueue(streamId)
        if (opts.distributionMethod === 'rotate') {
            await queue.rotate(opts.key)
        } else if (opts.distributionMethod === 'rekey') {
            await queue.rekey(opts.key)
        } else {
            throw new Error(`assertion failed: distribution method ${opts.distributionMethod}`)
        }
    }

    async addEncryptionKey(key: GroupKey, streamIdOrPath: string): Promise<void> {
        const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
        await this.groupKeyStore.add(key, streamId)
    }

    // --------------------------------------------------------------------------------------------
    // Subscribe
    // --------------------------------------------------------------------------------------------

    /**
     * @category Important
     */
    async subscribe<T>(
        options: StreamDefinition & { resend?: ResendOptions },
        onMessage?: MessageListener<T>
    ): Promise<Subscription<T>> {
        const streamPartId = await this.streamIdBuilder.toStreamPartID(options)
        const sub = (options.resend !== undefined)
            ? new ResendSubscription<T>(
                streamPartId,
                options.resend,
                this.resends,
                this.loggerFactory,
                this.config
            )
            : new Subscription<T>(streamPartId, this.loggerFactory)
        await this.subscriber.add<T>(sub)
        if (onMessage !== undefined) {
            sub.useLegacyOnMessageHandler(onMessage)
        }
        this.eventEmitter.emit('subscribe', undefined)
        return sub
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
    async resend<T>(
        streamDefinition: StreamDefinition,
        options: ResendOptions,
        onMessage?: MessageListener<T>
    ): Promise<MessageStream<T>> {
        const streamPartId = await this.streamIdBuilder.toStreamPartID(streamDefinition)
        const messageStream = await this.resends.resend<T>(streamPartId, options)
        if (onMessage !== undefined) {
            messageStream.useLegacyOnMessageHandler(onMessage)
        }
        return messageStream
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

    searchStreams(term: string | undefined, permissionFilter: SearchStreamsPermissionFilter | undefined): AsyncIterable<Stream> {
        return this.streamRegistry.searchStreams(term, permissionFilter)
    }

    // --------------------------------------------------------------------------------------------
    // Permissions
    // --------------------------------------------------------------------------------------------

    getStreamPublishers(streamIdOrPath: string): AsyncIterable<EthereumAddress> {
        return this.streamRegistry.getStreamPublishers(streamIdOrPath)
    }

    getStreamSubscribers(streamIdOrPath: string): AsyncIterable<EthereumAddress> {
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
        streamId: string
        assignments: PermissionAssignment[]
    }[]): Promise<void> {
        return this.streamRegistry.setPermissions(...items)
    }

    async isStreamPublisher(streamIdOrPath: string, userAddress: string): Promise<boolean> {
        return this.streamRegistry.isStreamPublisher(streamIdOrPath, toEthereumAddress(userAddress))
    }

    async isStreamSubscriber(streamIdOrPath: string, userAddress: string): Promise<boolean> {
        return this.streamRegistry.isStreamSubscriber(streamIdOrPath, toEthereumAddress(userAddress))
    }

    // --------------------------------------------------------------------------------------------
    // Storage
    // --------------------------------------------------------------------------------------------

    async addStreamToStorageNode(streamIdOrPath: string, nodeAddress: string): Promise<void> {
        return this.streamStorageRegistry.addStreamToStorageNode(streamIdOrPath, toEthereumAddress(nodeAddress))
    }

    async removeStreamFromStorageNode(streamIdOrPath: string, nodeAddress: string): Promise<void> {
        return this.streamStorageRegistry.removeStreamFromStorageNode(streamIdOrPath, toEthereumAddress(nodeAddress))
    }

    async isStoredStream(streamIdOrPath: string, nodeAddress: string): Promise<boolean> {
        return this.streamStorageRegistry.isStoredStream(streamIdOrPath, toEthereumAddress(nodeAddress))
    }

    async getStoredStreams(nodeAddress: string): Promise<{ streams: Stream[], blockNumber: number }> {
        return this.streamStorageRegistry.getStoredStreams(toEthereumAddress(nodeAddress))
    }

    async getStorageNodes(streamIdOrPath?: string): Promise<EthereumAddress[]> {
        return this.streamStorageRegistry.getStorageNodes(streamIdOrPath)
    }

    setStorageNodeMetadata(metadata: StorageNodeMetadata | undefined): Promise<void> {
        return this.storageNodeRegistry.setStorageNodeMetadata(metadata)
    }

    async getStorageNodeMetadata(nodeAddress: string): Promise<StorageNodeMetadata> {
        return this.storageNodeRegistry.getStorageNodeMetadata(toEthereumAddress(nodeAddress))
    }

    // --------------------------------------------------------------------------------------------
    // Authentication
    // --------------------------------------------------------------------------------------------

    getAddress(): Promise<EthereumAddress> {
        return this.authentication.getAddress()
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
    })

    destroy = pOnce(async () => {
        this.eventEmitter.removeAllListeners()
        this.connect.reset() // reset connect (will error on next call)
        const tasks = [
            this.destroySignal.destroy().then(() => undefined),
            this.subscriber.unsubscribe(),
            this.groupKeyStore.stop()
        ]

        await Promise.allSettled(tasks)
        await Promise.all(tasks)
    })

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

