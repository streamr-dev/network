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
import { ProxyDirection } from '@streamr/protocol'
import { MessageStream, MessageListener } from './subscribe/MessageStream'
import { Stream, StreamMetadata } from './Stream'
import { SearchStreamsPermissionFilter } from './registry/searchStreams'
import { PermissionAssignment, PermissionQuery } from './permission'
import { MetricsPublisher } from './MetricsPublisher'
import { PublishMetadata } from '../src/publish/Publisher'
import { initContainer } from './Container'
import { Authentication, AuthenticationInjectionToken } from './Authentication'
import { StreamStorageRegistry } from './registry/StreamStorageRegistry'
import { GroupKey } from './encryption/GroupKey'
import { PublisherKeyExchange } from './encryption/PublisherKeyExchange'
import { EthereumAddress, toEthereumAddress } from '@streamr/utils'
import { LoggerFactory } from './utils/LoggerFactory'
import { convertStreamMessageToMessage, Message } from './Message'
import { ErrorCode } from './HttpUtil'
import { omit } from 'lodash'

/**
 * The main API used to interact with Streamr.
 *
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

    /**
     * Instantiates a new {@link StreamrClient} instance.
     *
     * @param options - configuration options to use
     * @param parentContainer - provide a custom dependency injection container, used mostly for testing purposes
     */
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
     * Publishes a message to a stream partition in the network.
     *
     * @category Important
     *
     * @param streamDefinition - the stream or stream partition to publish the message to
     * @param content - the content / payload of the message
     * @param metadata - provide additional metadata to be included in the message or to control the publishing process
     * @returns if successful, the unencrypted published message including metadata
     */
    async publish<T>(
        streamDefinition: StreamDefinition,
        content: T,
        metadata?: PublishMetadata
    ): Promise<Message> {
        const result = await this.publisher.publish(streamDefinition, content, metadata)
        this.eventEmitter.emit('publish', undefined)
        return convertStreamMessageToMessage(result)
    }

    /**
     * Manually update the current encryption key of a given stream.
     *
     * @remarks Only affects the encryption key used when acting as publisher.
     *
     * @param opts - provide the options according to which the encryption key is updated, e.g., stream id,
     * distribution method and so forth.
     * @returns if successful, a resolved promise
     */
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

    /**
     * Adds an encryption key to the key store.
     *
     * @remarks Keys will be added to the store automatically by the client as encountered. This method can be used to
     * manually add some known keys into the store.
     *
     * @param key - the key to be added
     * @param streamIdOrPath - defines which stream this key is for
     * @returns if successful, a resolved promise
     */
    async addEncryptionKey(key: GroupKey, streamIdOrPath: string): Promise<void> {
        const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
        await this.groupKeyStore.add(key, streamId)
    }

    // --------------------------------------------------------------------------------------------
    // Subscribe
    // --------------------------------------------------------------------------------------------

    /**
     * Subscribes to a stream partition in the network.
     *
     * @category Important
     *
     * @param options - the stream or stream partition to subscribe to,
     * additionally a resend can be performed by providing resend options
     * @param onMessage - callback will be invoked for each message received in subscription
     * @returns if successful, a {@link Subscription} that can be used to manage the subscription etc.
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
     * Unsubscribes from a stream or stream partition in the network.
     *
     * @remarks no-op if subscription does not exist
     *
     * @category Important
     *
     * @param streamDefinitionOrSubscription - the stream or stream partition to unsubscribe from, leave as `undefined`
     * to unsubscribe from all existing subscriptions.
     * @returns if successful, a resolved promise
     */
    unsubscribe(streamDefinitionOrSubscription?: StreamDefinition | Subscription): Promise<unknown> {
        return this.subscriber.unsubscribe(streamDefinitionOrSubscription)
    }

    /**
     * Returns a list of subscriptions matching the given criteria.
     *
     * @category Important
     *
     * @param streamDefinition - the stream or stream partition to look for, leave as `undefined` to get all
     * subscriptions
     */
    getSubscriptions(streamDefinition?: StreamDefinition): Promise<Subscription<unknown>[]> {
        return this.subscriber.getSubscriptions(streamDefinition)
    }

    // --------------------------------------------------------------------------------------------
    // Resend
    // --------------------------------------------------------------------------------------------

    /**
     * Performs a resend of stored historical data.
     *
     * @category Important
     *
     * @remarks The given stream needs to be assigned to at least one storage node, otherwise this method will outright
     * reject.
     *
     * @param streamDefinition - the stream partition for which data should be resent
     * @param options - defines the kind of resend that should be performed
     * @param onMessage - callback will be invoked for each message retrieved
     * @returns if successful, a {@link MessageStream} that provides an alternative way of handling messages
     * (via async iterator)
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

    /**
     * Waits for a message to be stored by a storage node.
     *
     * @param message - the message to be awaited for
     * @param options - additional options for controlling waiting and message matching
     * @returns resolved promise if message was found in storage before timeout, otherwise rejects
     */
    waitForStorage(message: Message, options?: {
        /**
         * Determines how often should storage node be polled.
         */
        interval?: number
        /**
         * Timeout after which to give up if message was not seen.
         */
        timeout?: number

        /**
         * Controls size of internal resend used in polling.
         */
        count?: number

        /**
         * Used to set a custom message equality operator.
         * @param msgTarget - message being waited for (i.e. `message`)
         * @param msgGot - candidate message polled from storage node
         */
        messageMatchFn?: (msgTarget: Message, msgGot: Message) => boolean
    }): Promise<void> {
        return this.resends.waitForStorage(message, options)
    }

    // --------------------------------------------------------------------------------------------
    // Stream management
    // --------------------------------------------------------------------------------------------

    /**
     * Gets a stream.
     *
     * @category Important
     *
     * @param streamIdOrPath - the stream id to look for
     * @returns if found, the {@link Stream} object, otherwise rejects
     */
    getStream(streamIdOrPath: string): Promise<Stream> {
        return this.streamRegistry.getStream(streamIdOrPath)
    }

    /**
     * Creates a new stream.
     *
     * @category Important
     *
     * @param propsOrStreamIdOrPath - the stream id to be used for the new stream, and optionally, any
     * associated metadata
     * @returns if the stream is successfully created, returns an associated {@link Stream} object
     */
    async createStream(propsOrStreamIdOrPath: Partial<StreamMetadata> & { id: string } | string): Promise<Stream> {
        const props = typeof propsOrStreamIdOrPath === 'object' ? propsOrStreamIdOrPath : { id: propsOrStreamIdOrPath }
        const streamId = await this.streamIdBuilder.toStreamID(props.id)
        return this.streamRegistry.createStream(streamId, {
            partitions: 1,
            ...omit(props, 'id')
        })
    }

    /**
     * Gets a stream, creating a new one as a side effect if one does not exist.
     *
     * @category Important
     *
     * @param props - the stream id to get or create. Field `partitions` is only used if creation is necessary.
     * @returns if successful, the {@link Stream} object associated with the stream
     */
    async getOrCreateStream(props: { id: string, partitions?: number }): Promise<Stream> {
        try {
            return await this.getStream(props.id)
        } catch (err: any) {
            if (err.errorCode === ErrorCode.NOT_FOUND) {
                return this.createStream(props)
            }
            throw err
        }
    }

    /**
     * Updates the metadata of a stream.
     *
     * @param props - the stream id and the metadata fields to be updated
     * @returns if successful, the updated {@link Stream} object
     */
    async updateStream(props: Partial<StreamMetadata> & { id: string }): Promise<Stream> {
        const streamId = await this.streamIdBuilder.toStreamID(props.id)
        return this.streamRegistry.updateStream(streamId, omit(props, 'id'))
    }

    /**
     * Deletes a stream.
     *
     * @param streamIdOrPath - the stream id of the stream to be deleted
     * @returns if successful, a resolved promise
     */
    deleteStream(streamIdOrPath: string): Promise<void> {
        return this.streamRegistry.deleteStream(streamIdOrPath)
    }

    /**
     * Searches for streams based on given criteria.
     *
     * @param term - a search term that should be contained in either the stream id or metadata of a result
     * @param permissionFilter - check that given permissions should be in effect
     * @returns an async iterable collection of matching {@link Stream} results (automatic paging)
     */
    searchStreams(term: string | undefined, permissionFilter: SearchStreamsPermissionFilter | undefined): AsyncIterable<Stream> {
        return this.streamRegistry.searchStreams(term, permissionFilter)
    }

    // --------------------------------------------------------------------------------------------
    // Permissions
    // --------------------------------------------------------------------------------------------

    /**
     * Gets all valid publishers of a stream.
     *
     * @param streamIdOrPath - the stream id
     * @returns async iterable collection of {@link EthereumAddress} (automatic paging)
     */
    getStreamPublishers(streamIdOrPath: string): AsyncIterable<EthereumAddress> {
        return this.streamRegistry.getStreamPublishers(streamIdOrPath)
    }

    /**
     * Gets all valid subscribers of a stream.
     *
     * @param streamIdOrPath - the stream id
     * @returns async iterable collection of {@link EthereumAddress} (automatic paging)
     */
    getStreamSubscribers(streamIdOrPath: string): AsyncIterable<EthereumAddress> {
        return this.streamRegistry.getStreamSubscribers(streamIdOrPath)
    }

    /**
     * Checks whether the given permission is in effect.
     *
     * @param query - defines the permission to be checked
     * @returns resolves with true/false, rejects if the check could not be performed
     */
    hasPermission(query: PermissionQuery): Promise<boolean> {
        return this.streamRegistry.hasPermission(query)
    }

    /**
     * Returns a list of all permissions in effect for a given stream.
     *
     * @param streamIdOrPath - the stream id
     */
    getPermissions(streamIdOrPath: string): Promise<PermissionAssignment[]> {
        return this.streamRegistry.getPermissions(streamIdOrPath)
    }

    /**
     * Grants a permission on a given stream.
     *
     * @param streamIdOrPath - the stream id
     * @param assignments - defines the permission(s) to be granted
     * @returns if successful, a resolved promise
     */
    grantPermissions(streamIdOrPath: string, ...assignments: PermissionAssignment[]): Promise<void> {
        return this.streamRegistry.grantPermissions(streamIdOrPath, ...assignments)
    }

    /**
     * Revokes a permission on a given stream.
     *
     * @param streamIdOrPath - the stream id
     * @param assignments - defines the permission(s) to be revoked
     * @returns if successful, a resolved promise
     */
    revokePermissions(streamIdOrPath: string, ...assignments: PermissionAssignment[]): Promise<void> {
        return this.streamRegistry.revokePermissions(streamIdOrPath, ...assignments)
    }

    /**
     * Sets a list of permissions to be in effect.
     *
     * @remarks Can be used to set the permissions of multiple streams in one transaction. Great for doing bulk
     * operations and thus saving gas costs. Notice that the behaviour is _set_, therefore any existing permissions not
     * re-defined will be removed.
     *
     * @param items - a list of permissions to be set
     * @returns if successful, a resolved promise
     */
    setPermissions(...items: {
        streamId: string
        assignments: PermissionAssignment[]
    }[]): Promise<void> {
        return this.streamRegistry.setPermissions(...items)
    }

    /**
     * Checks whether a given (user) address is a valid publisher of a stream.
     *
     * @param streamIdOrPath - the stream id
     * @param userAddress - the Ethereum address of the user
     * @returns resolves with true/false, rejects if check could not be performed
     */
    async isStreamPublisher(streamIdOrPath: string, userAddress: string): Promise<boolean> {
        return this.streamRegistry.isStreamPublisher(streamIdOrPath, toEthereumAddress(userAddress))
    }

    /**
     * Checks whether a given (user) address is a valid subscriber of a stream.
     *
     * @param streamIdOrPath - the stream id
     * @param userAddress - the Ethereum address of the user
     * @returns resolves with true/false, rejects if check could not be performed
     */
    async isStreamSubscriber(streamIdOrPath: string, userAddress: string): Promise<boolean> {
        return this.streamRegistry.isStreamSubscriber(streamIdOrPath, toEthereumAddress(userAddress))
    }

    // --------------------------------------------------------------------------------------------
    // Storage
    // --------------------------------------------------------------------------------------------

    /**
     * Adds (or assigns) a stream to a storage node.
     *
     * @param streamIdOrPath - the stream id
     * @param nodeAddress - Ethereum address of the storage node
     * @returns if successful, a resolved promise
     */
    async addStreamToStorageNode(streamIdOrPath: string, nodeAddress: string): Promise<void> {
        return this.streamStorageRegistry.addStreamToStorageNode(streamIdOrPath, toEthereumAddress(nodeAddress))
    }

    /**
     * Removes (or unassigns) a stream from a storage node.
     *
     * @param streamIdOrPath - the stream id
     * @param nodeAddress - Ethereum address of the storage node
     * @returns if successful, a resolved promise
     */
    async removeStreamFromStorageNode(streamIdOrPath: string, nodeAddress: string): Promise<void> {
        return this.streamStorageRegistry.removeStreamFromStorageNode(streamIdOrPath, toEthereumAddress(nodeAddress))
    }

    /**
     * Checks whether a stream is being stored by a storage node.
     *
     * @param streamIdOrPath - the stream id
     * @param nodeAddress - Ethereum address of the storage node
     * @returns resolves with true/false, rejects if check could not be performed
     */
    async isStoredStream(streamIdOrPath: string, nodeAddress: string): Promise<boolean> {
        return this.streamStorageRegistry.isStoredStream(streamIdOrPath, toEthereumAddress(nodeAddress))
    }

    /**
     * Gets the full list of streams being stored by a storage node.
     *
     * @param nodeAddress - Ethereum address of the storage node
     * @returns a list of {@link Stream} being stored as well as `blockNumber` of result (i.e. smart contract state)
     */
    async getStoredStreams(nodeAddress: string): Promise<{ streams: Stream[], blockNumber: number }> {
        return this.streamStorageRegistry.getStoredStreams(toEthereumAddress(nodeAddress))
    }

    /**
     * Gets a list of storage nodes.
     *
     * @param streamIdOrPath - if given, returns storage nodes storing the stream in question, otherwise returns full
     * list of all known storage nodes
     * @returns a list of {@link EthereumAddress} corresponding to storage nodes
     */
    async getStorageNodes(streamIdOrPath?: string): Promise<EthereumAddress[]> {
        return this.streamStorageRegistry.getStorageNodes(streamIdOrPath)
    }

    /**
     * Sets the metadata of a storage node in the storage node registry.
     *
     * @remarks Acts on behalf of the wallet associated with the current {@link StreamrClient} instance.
     *
     * @param metadata - metadata to be set. If left `undefined`, effectively removes the storage node from the
     * registry
     */
    setStorageNodeMetadata(metadata: StorageNodeMetadata | undefined): Promise<void> {
        return this.storageNodeRegistry.setStorageNodeMetadata(metadata)
    }

    /**
     * Gets the metadata of a storage node from the storage node registry.
     *
     * @param nodeAddress - Ethereum address of the storage node
     * @returns the metadata of the storage node, rejects if the storage node is not found
     */
    async getStorageNodeMetadata(nodeAddress: string): Promise<StorageNodeMetadata> {
        return this.storageNodeRegistry.getStorageNodeMetadata(toEthereumAddress(nodeAddress))
    }

    // --------------------------------------------------------------------------------------------
    // Authentication
    // --------------------------------------------------------------------------------------------

    /**
     * Gets the Ethereum address of the wallet associated with the current {@link StreamrClient} instance.
     */
    getAddress(): Promise<EthereumAddress> {
        return this.authentication.getAddress()
    }

    // --------------------------------------------------------------------------------------------
    // Network node
    // --------------------------------------------------------------------------------------------

    /**
     * Gets the network node
     * @deprecated This in an internal method
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

    /**
     * Used to manually initialize the network stack and connect to the network.
     *
     * @remarks Connecting is handled automatically by the client. Generally this method need not be called by the user.
     */
    connect(): Promise<void> {
        // eslint-disable-next-line no-underscore-dangle
        return this._connect()
    }

    private _connect = pOnce(async () => {
        await this.node.startNode()
    })

    /**
     * Destroys an instance of a {@link StreamrClient} by disconnecting from peers, clearing any pending tasks, and
     * freeing up resources. This should be called once a user is done with the instance.
     *
     * @remarks As the name implies, the client instance (or any streams or subscriptions returned by it) should _not_
     * be used after calling this method.
     */
    destroy(): Promise<void> {
        // eslint-disable-next-line no-underscore-dangle
        return this._destroy()
    }

    private _destroy = pOnce(async () => {
        this.eventEmitter.removeAllListeners()
        // eslint-disable-next-line no-underscore-dangle
        this._connect.reset() // reset connect (will error on next call)
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

    /**
     * Adds an event listener to the client.
     * @param eventName - event name, see {@link StreamrClientEvents} for options
     * @param listener - the callback function
     */
    on<T extends keyof StreamrClientEvents>(eventName: T, listener: StreamrClientEvents[T]): void {
        this.eventEmitter.on(eventName, listener as any)
    }

    /**
     * Adds a "once" event listener to the client.
     * @param eventName - event name, see {@link StreamrClientEvents} for options
     * @param listener - the callback function
     */
    once<T extends keyof StreamrClientEvents>(eventName: T, listener: StreamrClientEvents[T]): void {
        this.eventEmitter.once(eventName, listener as any)
    }

    /**
     * Removes an event listener from the client.
     * @param eventName - event name, see {@link StreamrClientEvents} for options
     * @param listener - the callback function to remove
     */
    off<T extends keyof StreamrClientEvents>(eventName: T, listener: StreamrClientEvents[T]): void {
        this.eventEmitter.off(eventName, listener as any)
    }
}

