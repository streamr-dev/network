import 'reflect-metadata'
import './utils/PatchTsyringe'

import { DhtAddress } from '@streamr/dht'
import { ProxyDirection } from '@streamr/trackerless-network'
import { DEFAULT_PARTITION_COUNT, EthereumAddress, HexString, Logger, StreamID, TheGraphClient, toEthereumAddress, toUserId } from '@streamr/utils'
import type { Overrides } from 'ethers'
import EventEmitter from 'eventemitter3'
import merge from 'lodash/merge'
import omit from 'lodash/omit'
import { container as rootContainer } from 'tsyringe'
import { PublishMetadata, Publisher } from '../src/publish/Publisher'
import { Authentication, AuthenticationInjectionToken, SignerWithProvider, createAuthentication } from './Authentication'
import {
    ConfigInjectionToken,
    NetworkPeerDescriptor,
    StreamrClientConfig,
    StrictStreamrClientConfig,
    createStrictConfig,
    redactConfig
} from './Config'
import { DestroySignal } from './DestroySignal'
import { Message, convertStreamMessageToMessage } from './Message'
import { MetricsPublisher } from './MetricsPublisher'
import { NetworkNodeFacade } from './NetworkNodeFacade'
import { RpcProviderSource } from './RpcProviderSource'
import { Stream } from './Stream'
import { StreamIDBuilder } from './StreamIDBuilder'
import { StreamMetadata, getPartitionCount } from './StreamMetadata'
import { StreamrClientError } from './StreamrClientError'
import { ChainEventPoller } from './contracts/ChainEventPoller'
import { ContractFactory } from './contracts/ContractFactory'
import { Operator } from './contracts/Operator'
import { OperatorRegistry } from './contracts/OperatorRegistry'
import { StorageNodeMetadata, StorageNodeRegistry } from './contracts/StorageNodeRegistry'
import { StreamRegistry } from './contracts/StreamRegistry'
import { StreamStorageRegistry } from './contracts/StreamStorageRegistry'
import { SearchStreamsOrderBy, SearchStreamsPermissionFilter, toInternalSearchStreamsPermissionFilter } from './contracts/searchStreams'
import { GroupKey } from './encryption/GroupKey'
import { LocalGroupKeyStore, UpdateEncryptionKeyOptions } from './encryption/LocalGroupKeyStore'
import { PublisherKeyExchange } from './encryption/PublisherKeyExchange'
import { generateEthereumAccount as _generateEthereumAccount, getEthersOverrides as _getEthersOverrides } from './ethereumUtils'
import { StreamrClientEventEmitter, StreamrClientEvents } from './events'
import { PermissionAssignment, PermissionQuery, toInternalPermissionAssignment, toInternalPermissionQuery } from './permission'
import { MessageListener, MessageStream } from './subscribe/MessageStream'
import { ResendOptions, Resends, toInternalResendOptions } from './subscribe/Resends'
import { Subscriber } from './subscribe/Subscriber'
import { Subscription, SubscriptionEvents } from './subscribe/Subscription'
import { initResendSubscription } from './subscribe/resendSubscription'
import { waitForStorage } from './subscribe/waitForStorage'
import { StreamDefinition } from './types'
import { map } from './utils/GeneratorUtils'
import { LoggerFactory } from './utils/LoggerFactory'
import { addStreamToStorageNode } from './utils/addStreamToStorageNode'
import { pOnce } from './utils/promises'
import { convertPeerDescriptorToNetworkPeerDescriptor, createTheGraphClient } from './utils/utils'

// TODO: this type only exists to enable tsdoc to generate proper documentation
export type SubscribeOptions = StreamDefinition & ExtraSubscribeOptions

// TODO: this type only exists to enable tsdoc to generate proper documentation
export interface ExtraSubscribeOptions {
    resend?: ResendOptions

    /**
     * Subscribe raw with validation, permission checking, ordering, gap filling,
     * and decryption _disabled_.
     */
    raw?: boolean

    /**
     * Subscribe on behalf of a contract implementing the [ERC-1271](https://eips.ethereum.org/EIPS/eip-1271) standard.
     * The streamr client wallet address must be an authorized signer for the contract.
     */
    erc1271Contract?: HexString
}

const logger = new Logger(module)

/**
 * The main API used to interact with Streamr.
 *
 * @category Important
 */
export class StreamrClient {
    static readonly generateEthereumAccount = _generateEthereumAccount

    public readonly id: string
    private readonly publisher: Publisher
    private readonly subscriber: Subscriber
    private readonly resends: Resends
    private readonly node: NetworkNodeFacade
    private readonly rpcProviderSource: RpcProviderSource
    private readonly streamRegistry: StreamRegistry
    private readonly streamStorageRegistry: StreamStorageRegistry
    private readonly storageNodeRegistry: StorageNodeRegistry
    private readonly operatorRegistry: OperatorRegistry
    private readonly contractFactory: ContractFactory
    private readonly localGroupKeyStore: LocalGroupKeyStore
    private readonly chainEventPoller: ChainEventPoller
    private readonly theGraphClient: TheGraphClient
    private readonly streamIdBuilder: StreamIDBuilder
    private readonly config: StrictStreamrClientConfig
    private readonly authentication: Authentication
    private readonly eventEmitter: StreamrClientEventEmitter
    private readonly destroySignal: DestroySignal
    private readonly loggerFactory: LoggerFactory

    constructor(
        config: StreamrClientConfig = {},
        /** @internal */
        parentContainer = rootContainer
    ) {
        const strictConfig = createStrictConfig(config)
        const authentication = createAuthentication(strictConfig)
        redactConfig(strictConfig)
        const container = parentContainer.createChildContainer()
        container.register(AuthenticationInjectionToken, { useValue: authentication })
        container.register(ConfigInjectionToken, { useValue: strictConfig })
        const theGraphClient = createTheGraphClient(container.resolve<StreamrClientEventEmitter>(StreamrClientEventEmitter), strictConfig)
        container.register(TheGraphClient, { useValue: theGraphClient })
        this.id = strictConfig.id
        this.config = strictConfig
        this.authentication = authentication
        this.theGraphClient = theGraphClient
        this.publisher = container.resolve<Publisher>(Publisher)
        this.subscriber = container.resolve<Subscriber>(Subscriber)
        this.resends = container.resolve<Resends>(Resends)
        this.node = container.resolve<NetworkNodeFacade>(NetworkNodeFacade)
        this.rpcProviderSource = container.resolve(RpcProviderSource)
        this.streamRegistry = container.resolve<StreamRegistry>(StreamRegistry)
        this.streamStorageRegistry = container.resolve<StreamStorageRegistry>(StreamStorageRegistry)
        this.storageNodeRegistry = container.resolve<StorageNodeRegistry>(StorageNodeRegistry)
        this.operatorRegistry = container.resolve<OperatorRegistry>(OperatorRegistry)
        this.contractFactory = container.resolve<ContractFactory>(ContractFactory)
        this.localGroupKeyStore = container.resolve<LocalGroupKeyStore>(LocalGroupKeyStore)
        this.chainEventPoller = container.resolve<ChainEventPoller>(ChainEventPoller)
        this.streamIdBuilder = container.resolve<StreamIDBuilder>(StreamIDBuilder)
        this.eventEmitter = container.resolve<StreamrClientEventEmitter>(StreamrClientEventEmitter)
        this.destroySignal = container.resolve<DestroySignal>(DestroySignal)
        this.loggerFactory = container.resolve<LoggerFactory>(LoggerFactory)
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
     * @param content - the content (the payload) of the message (must be JSON serializable)
     * @param metadata - provide additional metadata to be included in the message or to control the publishing process
     * @returns the published message (note: the field {@link Message.content} is encrypted if the stream is private)
     */
    async publish(
        streamDefinition: StreamDefinition,
        content: unknown,
        metadata?: PublishMetadata
    ): Promise<Message> {
        const result = await this.publisher.publish(streamDefinition, content, metadata)
        this.eventEmitter.emit('messagePublished', result)
        return convertStreamMessageToMessage(result)
    }

    /**
     * Manually updates the encryption key used when publishing messages to a given stream.
     */
    async updateEncryptionKey(opts: UpdateEncryptionKeyOptions): Promise<void> {
        if (opts.streamId === undefined) {
            throw new Error('streamId required')
        }
        if (opts.key !== undefined && this.config.encryption.litProtocolEnabled) {
            throw new StreamrClientError('cannot pass "key" when Lit Protocol is enabled', 'UNSUPPORTED_OPERATION')
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
     * Adds an encryption key for a given publisher to the key store.
     *
     * @remarks Keys will be added to the store automatically by the client as encountered. This method can be used to
     * manually add some known keys into the store.
     */
    async addEncryptionKey(key: GroupKey, publisherId: HexString): Promise<void> {
        await this.localGroupKeyStore.set(key.id, toUserId(publisherId), key.data)
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
     * @returns a {@link Subscription} that can be used to manage the subscription etc.
     */
    async subscribe(
        options: SubscribeOptions,
        onMessage?: MessageListener
    ): Promise<Subscription> {
        if ((options.raw === true) && (options.resend !== undefined)) {
            throw new Error('Raw subscriptions are not supported for resend')
        }
        const streamPartId = await this.streamIdBuilder.toStreamPartID(options)
        const eventEmitter = new EventEmitter<SubscriptionEvents>()
        const sub = new Subscription(
            streamPartId,
            options.raw ?? false,
            options.erc1271Contract !== undefined ? toEthereumAddress(options.erc1271Contract) : undefined,
            eventEmitter,
            this.loggerFactory
        )
        if (options.resend !== undefined) {
            initResendSubscription(
                sub,
                options.resend,
                this.resends,
                (streamId: StreamID) => this.streamStorageRegistry.getStorageNodes(streamId),
                this.config,
                eventEmitter,
                this.loggerFactory
            )
        }
        await this.subscriber.add(sub)
        if (onMessage !== undefined) {
            sub.useLegacyOnMessageHandler(onMessage)
        }
        this.eventEmitter.emit('streamPartSubscribed', undefined)
        return sub
    }

    /**
     * Unsubscribes from streams or stream partitions in the network.
     *
     * @remarks no-op if subscription does not exist
     *
     * @category Important
     *
     * @param streamDefinitionOrSubscription - leave as `undefined` to unsubscribe from all existing subscriptions.
     */
    async unsubscribe(streamDefinitionOrSubscription?: StreamDefinition | Subscription): Promise<unknown> {
        if (streamDefinitionOrSubscription instanceof Subscription) {
            const sub = streamDefinitionOrSubscription
            return this.subscriber.remove(sub)
        } else {
            const subs = await this.getSubscriptions(streamDefinitionOrSubscription)
            return Promise.allSettled(subs.map((sub) => this.subscriber.remove(sub)))
        }
    }

    /**
     * Returns a list of subscriptions matching the given criteria.
     *
     * @category Important
     *
     * @param streamDefinition - leave as `undefined` to get all subscriptions
     */
    async getSubscriptions(streamDefinition?: StreamDefinition): Promise<Subscription[]> {
        const matcher = (streamDefinition !== undefined)
            ? await this.streamIdBuilder.getMatcher(streamDefinition)
            : () => true
        return this.subscriber.getSubscriptions().filter((s) => matcher(s.streamPartId))
    }

    // --------------------------------------------------------------------------------------------
    // Resend
    // --------------------------------------------------------------------------------------------

    /**
     * Performs a resend of stored historical data.
     *
     * @category Important
     *
     * @param streamDefinition - the stream partition for which data should be resent
     * @param options - defines the kind of resend that should be performed
     * @param onMessage - callback will be invoked for each message retrieved
     * @returns a {@link MessageStream} that provides an alternative way of iterating messages. Rejects if the stream is
     * not stored (i.e. is not assigned to a storage node).
     */
    async resend(
        streamDefinition: StreamDefinition,
        options: ResendOptions,
        onMessage?: MessageListener
    ): Promise<MessageStream> {
        const streamPartId = await this.streamIdBuilder.toStreamPartID(streamDefinition)
        const getStorageNodes = (streamId: StreamID) => this.streamStorageRegistry.getStorageNodes(streamId)
        const pipeline = await this.resends.resend(streamPartId, toInternalResendOptions(options), getStorageNodes)
        const messageStream = new MessageStream(pipeline)
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
     * @returns rejects if message was found in storage before timeout
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
         * @internal
         */
        messageMatchFn?: (msgTarget: Message, msgGot: Message) => boolean
    }): Promise<void> {
        const defaultOptions = {
            // eslint-disable-next-line no-underscore-dangle
            interval: this.config._timeouts.storageNode.retryInterval,
            // eslint-disable-next-line no-underscore-dangle
            timeout: this.config._timeouts.storageNode.timeout,
            count: 100
        }
        return waitForStorage(message, merge(defaultOptions, options), this.resends, this.streamStorageRegistry)
    }

    // --------------------------------------------------------------------------------------------
    // Stream management
    // --------------------------------------------------------------------------------------------

    /**
     * Gets a stream.
     *
     * @category Important
     *
     * @returns rejects if the stream is not found
     */
    async getStream(streamIdOrPath: string): Promise<Stream> {
        const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
        // Check if the stream exists by querying its metadata. Throws an error if no metadata is found,
        // indicating the stream doesn't exist. As a side-effect this populates StreamRegistry's metadata
        // cache for future use, such as stream.getPartitionCount() calls.
        await this.streamRegistry.getStreamMetadata(streamId)
        return new Stream(streamId, this)
    }

    /**
     * Creates a new stream.
     *
     * @category Important
     *
     * @param propsOrStreamIdOrPath - the stream id to be used for the new stream, and optionally, any
     * associated metadata
     *
     * @remarks when creating a stream with an ENS domain, the returned promise can take several minutes to settle
     */
    async createStream(propsOrStreamIdOrPath: StreamMetadata & { id: string } | string): Promise<Stream> {
        const props = typeof propsOrStreamIdOrPath === 'object' ? propsOrStreamIdOrPath : { id: propsOrStreamIdOrPath }
        const streamId = await this.streamIdBuilder.toStreamID(props.id)
        const metadata = merge({ partitions: DEFAULT_PARTITION_COUNT }, omit(props, 'id') )
        await this.streamRegistry.createStream(streamId, metadata)
        return new Stream(streamId, this)
    }

    /**
     * Gets a stream, creating one if it does not exist.
     *
     * @category Important
     *
     * @param props - the stream id to get or create. Field `partitions` is only used if creating the stream.
     *
     * @remarks when creating a stream with an ENS domain, the returned promise can take several minutes to settle
     */
    async getOrCreateStream(props: { id: string, partitions?: number }): Promise<Stream> {
        try {
            return await this.getStream(props.id)
        } catch (err: any) {
            if (err.code === 'STREAM_NOT_FOUND') {
                return this.createStream(props)
            }
            throw err
        }
    }

    /**
     * Returns the metadata of a stream.
     */
    async getStreamMetadata(streamIdOrPath: string): Promise<StreamMetadata> {
        const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
        return this.streamRegistry.getStreamMetadata(streamId)
    }

    /**
     * Updates the metadata of a stream.
     */
    async setStreamMetadata(streamIdOrPath: string, metadata: StreamMetadata): Promise<void> {
        const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
        await this.streamRegistry.setStreamMetadata(streamId, metadata)
    }

    /**
     * Deletes a stream.
     */
    deleteStream(streamIdOrPath: string): Promise<void> {
        return this.streamRegistry.deleteStream(streamIdOrPath)
    }

    /**
     * Searches for streams based on given criteria.
     *
     * @param term - a search term that should be part of the stream id of a result
     * @param permissionFilter - permissions that should be in effect for a result
     * @param orderBy - the default is ascending order by stream id field
     */
    searchStreams(
        term: string | undefined,
        permissionFilter: SearchStreamsPermissionFilter | undefined,
        orderBy: SearchStreamsOrderBy = { field: 'id', direction: 'asc' }
    ): AsyncIterable<Stream> {
        logger.debug('Search for streams', { term, permissionFilter })
        if ((term === undefined) && (permissionFilter === undefined)) {
            throw new Error('Requires a search term or a permission filter')
        }
        const streamIds = this.streamRegistry.searchStreams(
            term,
            (permissionFilter !== undefined) ? toInternalSearchStreamsPermissionFilter(permissionFilter) : undefined,
            orderBy
        )
        return map(streamIds, (id) => new Stream(id, this))
    }

    // --------------------------------------------------------------------------------------------
    // Permissions
    // --------------------------------------------------------------------------------------------

    /**
     * Gets all user ids that have {@link StreamPermission.PUBLISH} permission to the stream.
     */
    getStreamPublishers(streamIdOrPath: string): AsyncIterable<HexString> {
        return this.streamRegistry.getStreamPublishers(streamIdOrPath)
    }

    /**
     * Gets all user ids that have {@link StreamPermission.SUBSCRIBE} permission to the stream.
     */
    getStreamSubscribers(streamIdOrPath: string): AsyncIterable<HexString> {
        return this.streamRegistry.getStreamSubscribers(streamIdOrPath)
    }

    /**
     * Checks whether the given permission is in effect.
     */
    async hasPermission(query: PermissionQuery): Promise<boolean> {
        return this.streamRegistry.hasPermission(await toInternalPermissionQuery(query, this.streamIdBuilder))
    }

    /**
     * Returns the list of all permissions in effect for a given stream.
     */
    getPermissions(streamIdOrPath: string): Promise<PermissionAssignment[]> {
        return this.streamRegistry.getPermissions(streamIdOrPath)
    }

    /**
     * Grants permissions on a given stream.
     */
    grantPermissions(streamIdOrPath: string, ...assignments: PermissionAssignment[]): Promise<void> {
        return this.streamRegistry.grantPermissions(streamIdOrPath, ...assignments.map(toInternalPermissionAssignment))
    }

    /**
     * Revokes permissions on a given stream.
     */
    revokePermissions(streamIdOrPath: string, ...assignments: PermissionAssignment[]): Promise<void> {
        return this.streamRegistry.revokePermissions(streamIdOrPath, ...assignments.map(toInternalPermissionAssignment))
    }

    /**
     * Sets a list of permissions to be in effect.
     *
     * @remarks Can be used to set the permissions of multiple streams in one transaction. Great for doing bulk
     * operations and saving gas costs. Notice that the behaviour is overwriting, therefore any existing permissions not
     * defined will be removed (per stream).
     */
    setPermissions(...items: {
        streamId: string
        assignments: PermissionAssignment[]
    }[]): Promise<void> {
        return this.streamRegistry.setPermissions(...items.map((item) => (
            { ...item, assignments: item.assignments.map(toInternalPermissionAssignment) }
        )))
    }

    /**
     * Checks whether a given ethereum address has {@link StreamPermission.PUBLISH} permission to a stream.
     */
    async isStreamPublisher(streamIdOrPath: string, userId: HexString): Promise<boolean> {
        const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
        return this.streamRegistry.isStreamPublisher(streamId, toUserId(userId))
    }

    /**
     * Checks whether a given ethereum address has {@link StreamPermission.SUBSCRIBE} permission to a stream.
     */
    async isStreamSubscriber(streamIdOrPath: string, userId: HexString): Promise<boolean> {
        const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
        return this.streamRegistry.isStreamSubscriber(streamId, toUserId(userId))
    }

    // --------------------------------------------------------------------------------------------
    // Storage
    // --------------------------------------------------------------------------------------------

    /**
     * Assigns a stream to a storage node.
     *
     * @param opts - control how long to wait for storage node to pick up on assignment
     * @returns If opts.wait=true, the promise resolves when the storage node acknowledges the assignment and
     * is therefore ready to store published messages. If we don't receive the acknowledgment within the `timeout`,
     * the promise rejects, but the assignment may still succeed later.
     */
    async addStreamToStorageNode(
        streamIdOrPath: string,
        storageNodeAddress: HexString,
        opts: { wait: boolean, timeout?: number } = { wait: false }
    ): Promise<void> {
        const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
        await addStreamToStorageNode(
            streamId,
            toEthereumAddress(storageNodeAddress),
            opts,
            getPartitionCount(await this.streamRegistry.getStreamMetadata(streamId)),
            this.subscriber,
            this.streamRegistry,
            this.streamStorageRegistry,
            this.loggerFactory,
            this.config
        )
    }

    /**
     * Unassigns a stream from a storage node.
     */
    async removeStreamFromStorageNode(streamIdOrPath: string, storageNodeAddress: HexString): Promise<void> {
        return this.streamStorageRegistry.removeStreamFromStorageNode(streamIdOrPath, toEthereumAddress(storageNodeAddress))
    }

    /**
     * Checks whether a stream is assigned to a storage node.
     */
    async isStoredStream(streamIdOrPath: string, storageNodeAddress: HexString): Promise<boolean> {
        return this.streamStorageRegistry.isStoredStream(streamIdOrPath, toEthereumAddress(storageNodeAddress))
    }

    /**
     * Gets all streams assigned to a storage node.
     *
     * @returns a list of {@link Stream} as well as `blockNumber` of result (i.e. blockchain state)
     */
    async getStoredStreams(storageNodeAddress: HexString): Promise<{ streams: Stream[], blockNumber: number }> {
        const queryResult = await this.streamStorageRegistry.getStoredStreams(toEthereumAddress(storageNodeAddress))
        for (const stream of queryResult.streams) {
            this.streamRegistry.populateMetadataCache(stream.id, stream.metadata)
        }
        return {
            streams: queryResult.streams.map((item) => new Stream(item.id, this)),
            blockNumber: queryResult.blockNumber
        }
    }

    /**
     * Gets a list of storage nodes.
     *
     * @param streamIdOrPath - if a stream is given, returns the list of storage nodes the stream has been assigned to;
     * leave as `undefined` to return all storage nodes
     */
    async getStorageNodes(streamIdOrPath?: string): Promise<HexString[]> {
        return this.streamStorageRegistry.getStorageNodes(streamIdOrPath)
    }

    /**
     * Sets the metadata of a storage node in the storage node registry.
     *
     * @remarks Acts on behalf of the wallet associated with the current {@link StreamrClient} instance.
     *
     * @param metadata - if `undefined`, removes the storage node from the registry
     */
    setStorageNodeMetadata(metadata: StorageNodeMetadata | undefined): Promise<void> {
        return this.storageNodeRegistry.setStorageNodeMetadata(metadata)
    }

    /**
     * Gets the metadata of a storage node from the storage node registry.
     *
     * @returns rejects if the storage node is not found
     */
    async getStorageNodeMetadata(storageNodeAddress: HexString): Promise<StorageNodeMetadata> {
        return this.storageNodeRegistry.getStorageNodeMetadata(toEthereumAddress(storageNodeAddress))
    }

    // --------------------------------------------------------------------------------------------
    // Authentication
    // --------------------------------------------------------------------------------------------

    /**
     * Gets the Signer associated with the current {@link StreamrClient} instance.
     */
    getSigner(): Promise<SignerWithProvider> {
        return this.authentication.getTransactionSigner(this.rpcProviderSource)
    }

    /**
     * Gets the user id (i.e. Ethereum address) of the wallet associated with the current {@link StreamrClient} instance.
     */
    async getUserId(): Promise<HexString> {
        return await this.authentication.getUserId()
    }

    /**
     * Alias to {@link getUserId|getUserId()}
     */
    getAddress(): Promise<HexString> {
        return this.getUserId()
    }

    // --------------------------------------------------------------------------------------------
    // Network node
    // --------------------------------------------------------------------------------------------

    /**
     * @deprecated This in an internal method
     * @hidden
     */
    getNode(): NetworkNodeFacade {
        return this.node
    }

    async inspect(node: NetworkPeerDescriptor, streamDefinition: StreamDefinition): Promise<boolean> {
        const streamPartId = await this.streamIdBuilder.toStreamPartID(streamDefinition)
        // TODO: right now if the node is not joined to the stream partition, the below will return false instantly.
        // It would be better if it actually joined the stream partition for us (and maybe left when we are done?).
        return this.node.inspect(node, streamPartId)
    }

    async setProxies(
        streamDefinition: StreamDefinition,
        nodes: NetworkPeerDescriptor[],
        direction: ProxyDirection,
        connectionCount?: number
    ): Promise<void> {
        const streamPartId = await this.streamIdBuilder.toStreamPartID(streamDefinition)
        await this.node.setProxies(streamPartId, nodes, direction, connectionCount)
    }

    /**
     * Used to set known entry points for a stream partition. If entry points are not set they
     * will be automatically discovered from the Streamr Network.
    */
    async setStreamPartitionEntryPoints(streamDefinition: StreamDefinition, entryPoints: NetworkPeerDescriptor[]): Promise<void> {
        const streamPartId = await this.streamIdBuilder.toStreamPartID(streamDefinition)
        await this.node.setStreamPartEntryPoints(streamPartId, entryPoints)
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
            this.unsubscribe()
        ]

        await Promise.allSettled(tasks)
        await Promise.all(tasks)
    })

    async getPeerDescriptor(): Promise<NetworkPeerDescriptor> {
        return convertPeerDescriptorToNetworkPeerDescriptor(await this.node.getPeerDescriptor())
    }

    /**
     * Get the network-level node id of the client.
     */
    async getNodeId(): Promise<DhtAddress> {
        return this.node.getNodeId()
    }

    /**
     * Get diagnostic info about the underlying network. Useful for debugging issues.
     *
     * @remarks returned object's structure can change without semver considerations
     */
    async getDiagnosticInfo(): Promise<Record<string, unknown>> {
        return this.node.getDiagnosticInfo()
    }

    /**
     * @deprecated This in an internal method
     * @hidden
     */
    getConfig(): StrictStreamrClientConfig {
        return this.config
    }

    /**
     * Get overrides for transaction options. Use as a parameter when submitting
     * transactions via ethers library.
     *
     * The {@link https://docs.ethers.org/v6/api/contract/#Overrides Overrides} type is from the `ethers` library.
     */
    getEthersOverrides(): Promise<Overrides> {
        return _getEthersOverrides(this.rpcProviderSource, this.config)
    }

    /**
     * @deprecated This in an internal method
     * @hidden
     */
    getOperator(operatorContractAddress: EthereumAddress): Operator {
        return new Operator(
            operatorContractAddress,
            this.contractFactory,
            this.rpcProviderSource,
            this.chainEventPoller,
            this.theGraphClient,
            this.authentication,
            this.destroySignal,
            this.loggerFactory,
            () => this.getEthersOverrides()
        )
    }

    /** 
     * Discover operators that have been recently online on a given stream.
     *
     * The API may change soon (NET-1374).
     * 
     * @internal
     */
    findOperators(streamId: StreamID): Promise<NetworkPeerDescriptor[]> {
        return this.operatorRegistry.findOperatorsOnStream(streamId, 10, 1)
    } 

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
     * Adds an event listener to the client that is invoked only once.
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
