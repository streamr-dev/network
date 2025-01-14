import {
    EthereumAddress,
    GraphQLQuery,
    Logger,
    StreamID,
    StreamIDUtils,
    TheGraphClient,
    UserID,
    collect,
    isENSName,
    isEthereumAddressUserId,
    toEthereumAddress,
    toStreamID,
    toUserId,
    until
} from '@streamr/utils'
import { ContractTransactionResponse } from 'ethers'
import { intersection } from 'lodash'
import { Lifecycle, inject, scoped } from 'tsyringe'
import { Authentication, AuthenticationInjectionToken } from '../Authentication'
import { ConfigInjectionToken, StrictStreamrClientConfig } from '../Config'
import { RpcProviderSource } from '../RpcProviderSource'
import { StreamIDBuilder } from '../StreamIDBuilder'
import { StreamMetadata, parseMetadata } from '../StreamMetadata'
import { StreamrClientError } from '../StreamrClientError'
import type { StreamRegistryV5 as StreamRegistryContract } from '../ethereumArtifacts/StreamRegistryV5'
import StreamRegistryArtifact from '../ethereumArtifacts/StreamRegistryV5Abi.json'
import { getEthersOverrides } from '../ethereumUtils'
import { StreamrClientEventEmitter } from '../events'
import {
    ChainPermissions,
    InternalPermissionAssignment,
    InternalPermissionQuery,
    PUBLIC_PERMISSION_USER_ID,
    PermissionQueryResult,
    StreamPermission,
    convertChainPermissionsToStreamPermissions,
    convertStreamPermissionsToChainPermission,
    isPublicPermissionAssignment,
    isPublicPermissionQuery,
    streamPermissionToSolidityType
} from '../permission'
import { filter, map } from '../utils/GeneratorUtils'
import { LoggerFactory } from '../utils/LoggerFactory'
import { createCacheMap, Mapping } from '../utils/Mapping'
import { ChainEventPoller } from './ChainEventPoller'
import { ContractFactory } from './ContractFactory'
import { ObservableContract, initContractEventGateway, waitForTx } from './contract'
import {
    InternalSearchStreamsPermissionFilter,
    SearchStreamsOrderBy,
    searchStreams as _searchStreams
} from './searchStreams'

/*
 * On-chain registry of stream metadata and permissions.
 *
 * Does not support system streams (the key exchange stream)
 */

export interface StreamQueryResult {
    id: string
    metadata: string
}

interface StreamPublisherOrSubscriberItem {
    id: string
    userId: string
}

export interface StreamCreationEvent {
    readonly streamId: StreamID
    readonly metadata: StreamMetadata
    readonly blockNumber: number
}

const validatePermissionAssignments = (assignments: InternalPermissionAssignment[]): void | never => {
    for (const assignment of assignments) {
        // In the StreamRegistry v5 contract, these permissions can only be assigned to users
        // who have EthereumAddress as their userId. Also public permission is not allowed
        // for these users.
        const ADMIN_PERMISSION_TYPES = [StreamPermission.EDIT, StreamPermission.DELETE, StreamPermission.GRANT]
        const adminPermissions = intersection(assignment.permissions, ADMIN_PERMISSION_TYPES)
        if (adminPermissions.length > 0) {
            const createError = (prefix: string) => {
                return new StreamrClientError(
                    `${prefix} is not supported for permission types: ${adminPermissions.map((p) => p.toUpperCase()).join(', ')}`,
                    'UNSUPPORTED_OPERATION'
                )
            }
            if (isPublicPermissionAssignment(assignment)) {
                throw createError('Public permission')
            } else if (!isEthereumAddressUserId(assignment.userId)) {
                throw createError('Non-Ethereum user id')
            }
        }
    }
}

const streamContractErrorProcessor = (err: any, streamId: StreamID, registry: string): never => {
    if (err.reason?.code === 'CALL_EXCEPTION') {
        throw new StreamrClientError('Stream not found: id=' + streamId, 'STREAM_NOT_FOUND')
    } else {
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        throw new Error(`Could not reach the ${registry} Smart Contract: ${err.message}`)
    }
}

const invalidateCache = (
    cache: { invalidate: (predicate: (key: StreamID | [StreamID, ...any[]]) => boolean) => void },
    streamId: StreamID
): void => {
    cache.invalidate((key) => {
        const cachedStreamId = Array.isArray(key) ? key[0] : key
        return cachedStreamId === streamId
    })
}

@scoped(Lifecycle.ContainerScoped)
export class StreamRegistry {
    private streamRegistryContract?: ObservableContract<StreamRegistryContract>
    private readonly streamRegistryContractReadonly: ObservableContract<StreamRegistryContract>
    private readonly contractFactory: ContractFactory
    private readonly rpcProviderSource: RpcProviderSource
    private readonly theGraphClient: TheGraphClient
    private readonly streamIdBuilder: StreamIDBuilder
    /** @internal */
    private readonly config: Pick<StrictStreamrClientConfig, 'contracts' | 'cache' | '_timeouts'>
    private readonly authentication: Authentication
    private readonly logger: Logger
    private readonly metadataCache: Mapping<StreamID, StreamMetadata>
    private readonly publisherCache: Mapping<[StreamID, UserID], boolean>
    private readonly subscriberCache: Mapping<[StreamID, UserID], boolean>
    private readonly publicSubscribePermissionCache: Mapping<StreamID, boolean>

    /** @internal */
    constructor(
        contractFactory: ContractFactory,
        rpcProviderSource: RpcProviderSource,
        theGraphClient: TheGraphClient,
        streamIdBuilder: StreamIDBuilder,
        @inject(ConfigInjectionToken) config: Pick<StrictStreamrClientConfig, 'contracts' | 'cache' | '_timeouts'>,
        @inject(AuthenticationInjectionToken) authentication: Authentication,
        eventEmitter: StreamrClientEventEmitter,
        loggerFactory: LoggerFactory
    ) {
        this.contractFactory = contractFactory
        this.rpcProviderSource = rpcProviderSource
        this.theGraphClient = theGraphClient
        this.streamIdBuilder = streamIdBuilder
        this.config = config
        this.authentication = authentication
        this.logger = loggerFactory.createLogger(module)
        this.streamRegistryContractReadonly = this.contractFactory.createReadContract<StreamRegistryContract>(
            toEthereumAddress(this.config.contracts.streamRegistryChainAddress),
            StreamRegistryArtifact,
            this.rpcProviderSource.getProvider(),
            'streamRegistry'
        )
        const chainEventPoller = new ChainEventPoller(
            this.rpcProviderSource.getSubProviders().map((p) => {
                return contractFactory.createEventContract(
                    toEthereumAddress(this.config.contracts.streamRegistryChainAddress),
                    StreamRegistryArtifact,
                    p
                )
            }),
            config.contracts.pollInterval
        )
        initContractEventGateway({
            sourceName: 'StreamCreated',
            sourceEmitter: chainEventPoller,
            targetName: 'streamCreated',
            targetEmitter: eventEmitter,
            transformation: (streamId: string, metadata: string, blockNumber: number) => ({
                streamId: toStreamID(streamId),
                metadata: parseMetadata(metadata),
                blockNumber
            }),
            loggerFactory
        })
        this.metadataCache = createCacheMap({
            valueFactory: (streamId) => {
                return this.getStreamMetadata_nonCached(streamId)
            },
            ...config.cache
        })
        this.publisherCache = createCacheMap({
            valueFactory: ([streamId, userId]) => {
                return this.isStreamPublisherOrSubscriber_nonCached(streamId, userId, StreamPermission.PUBLISH)
            },
            ...config.cache
        })
        this.subscriberCache = createCacheMap({
            valueFactory: ([streamId, userId]) => {
                return this.isStreamPublisherOrSubscriber_nonCached(streamId, userId, StreamPermission.SUBSCRIBE)
            },
            ...config.cache
        })
        this.publicSubscribePermissionCache = createCacheMap({
            valueFactory: (streamId) => {
                return this.hasPermission({
                    streamId,
                    public: true,
                    permission: StreamPermission.SUBSCRIBE
                })
            },
            ...config.cache
        })
    }

    private async connectToContract(): Promise<void> {
        if (this.streamRegistryContract === undefined) {
            const chainSigner = await this.authentication.getTransactionSigner(this.rpcProviderSource)
            this.streamRegistryContract = this.contractFactory.createWriteContract<StreamRegistryContract>(
                toEthereumAddress(this.config.contracts.streamRegistryChainAddress),
                StreamRegistryArtifact,
                chainSigner,
                'streamRegistry'
            )
        }
    }

    async createStream(streamId: StreamID, metadata: StreamMetadata): Promise<void> {
        const ethersOverrides = await getEthersOverrides(this.rpcProviderSource, this.config)

        const domainAndPath = StreamIDUtils.getDomainAndPath(streamId)
        if (domainAndPath === undefined) {
            throw new Error(`stream id "${streamId}" not valid`)
        }
        const [domain, path] = domainAndPath

        await this.connectToContract()
        if (isENSName(domain)) {
            /*
                The call to createStreamWithENS delegates the ENS ownership check, and therefore the
                call doesn't fail e.g. if the user doesn't own the ENS name. To see whether the stream
                creation succeeeds, we need to poll the chain for stream existence. If the polling timeouts, we don't
                know what the actual error was. (Most likely it has nothing to do with timeout
                -> we don't use the error from until(), but throw an explicit error instead.)
            */
            await waitForTx(
                this.streamRegistryContract!.createStreamWithENS(
                    domain,
                    path,
                    JSON.stringify(metadata),
                    ethersOverrides
                )
            )
            try {
                await until(
                    async () => this.streamExistsOnChain(streamId),
                    // eslint-disable-next-line no-underscore-dangle
                    this.config._timeouts.ensStreamCreation.timeout,
                    // eslint-disable-next-line no-underscore-dangle
                    this.config._timeouts.ensStreamCreation.retryInterval
                )
            } catch {
                throw new Error(`unable to create stream "${streamId}"`)
            }
        } else {
            await this.ensureStreamIdInNamespaceOfAuthenticatedUser(domain, streamId)
            await waitForTx(this.streamRegistryContract!.createStream(path, JSON.stringify(metadata), ethersOverrides))
        }
        this.populateMetadataCache(streamId, metadata)
    }

    private async ensureStreamIdInNamespaceOfAuthenticatedUser(
        address: EthereumAddress,
        streamId: StreamID
    ): Promise<void> {
        const userAddress = toEthereumAddress(await this.authentication.getUserId())
        if (address !== userAddress) {
            throw new Error(`stream id "${streamId}" not in namespace of authenticated user "${userAddress}"`)
        }
    }

    async setStreamMetadata(streamId: StreamID, metadata: StreamMetadata): Promise<void> {
        await this.connectToContract()
        const ethersOverrides = await getEthersOverrides(this.rpcProviderSource, this.config)
        await waitForTx(
            this.streamRegistryContract!.updateStreamMetadata(streamId, JSON.stringify(metadata), ethersOverrides)
        )
        this.populateMetadataCache(streamId, metadata)
    }

    async deleteStream(streamIdOrPath: string): Promise<void> {
        const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
        await this.connectToContract()
        const ethersOverrides = await getEthersOverrides(this.rpcProviderSource, this.config)
        await waitForTx(this.streamRegistryContract!.deleteStream(streamId, ethersOverrides))
        invalidateCache(this.metadataCache, streamId)
        this.invalidatePermissionCaches(streamId)
    }

    private async streamExistsOnChain(streamIdOrPath: string): Promise<boolean> {
        const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
        this.logger.debug('Check if stream exists on chain', { streamId })
        return this.streamRegistryContractReadonly.exists(streamId)
    }

    private async getStreamMetadata_nonCached(streamId: StreamID): Promise<StreamMetadata> {
        let metadata: string
        try {
            metadata = await this.streamRegistryContractReadonly.getStreamMetadata(streamId)
        } catch (err) {
            return streamContractErrorProcessor(err, streamId, 'StreamRegistry')
        }
        return parseMetadata(metadata)
    }

    async *searchStreams(
        term: string | undefined,
        permissionFilter: InternalSearchStreamsPermissionFilter | undefined,
        orderBy: SearchStreamsOrderBy
    ): AsyncGenerator<StreamID> {
        const queryResult = _searchStreams(term, permissionFilter, orderBy, this.theGraphClient)
        for await (const item of queryResult) {
            const id = toStreamID(item.stream.id)
            this.populateMetadataCache(id, parseMetadata(item.stream.metadata))
            yield id
        }
    }

    getStreamPublishers(streamIdOrPath: string): AsyncIterable<UserID> {
        return this.getStreamPublishersOrSubscribersList(streamIdOrPath, 'publishExpiration')
    }

    getStreamSubscribers(streamIdOrPath: string): AsyncIterable<UserID> {
        return this.getStreamPublishersOrSubscribersList(streamIdOrPath, 'subscribeExpiration')
    }

    private async *getStreamPublishersOrSubscribersList(
        streamIdOrPath: string,
        fieldName: string
    ): AsyncIterable<UserID> {
        const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
        const backendResults = this.theGraphClient.queryEntities<StreamPublisherOrSubscriberItem>(
            (lastId: string, pageSize: number) =>
                StreamRegistry.buildStreamPublishersOrSubscribersQuery(streamId, fieldName, lastId, pageSize)
        )
        /*
         * There can be orphaned permission entities if a stream is deleted (currently
         * we don't remove the assigned permissions, see ETH-222)
         * TODO remove the filtering when ETH-222 has been implemented, and remove also
         * stream result field in buildStreamPublishersOrSubscribersQuery as it is
         * no longer needed
         */
        const validItems = filter<StreamPublisherOrSubscriberItem>(backendResults, (p) => (p as any).stream !== null)
        yield* map<StreamPublisherOrSubscriberItem, UserID>(validItems, (item) => toUserId(item.userId))
    }

    private static buildStreamPublishersOrSubscribersQuery(
        streamId: StreamID,
        fieldName: string,
        lastId: string,
        pageSize: number
    ): GraphQLQuery {
        const query = `
        {
            streamPermissions (
                first: ${pageSize}
                orderBy: "id"
                where: {
                    id_gt: "${lastId}"
                    stream: "${streamId}"
                    ${fieldName}_gt: "${Math.round(Date.now() / 1000)}"
                }
            ) {
                id
                userId
                stream {
                    id
                }
            }
        }`
        return { query }
    }

    // --------------------------------------------------------------------------------------------
    // Permissions
    // --------------------------------------------------------------------------------------------

    async hasPermission(query: InternalPermissionQuery): Promise<boolean> {
        if (isPublicPermissionQuery(query)) {
            const permissionType = streamPermissionToSolidityType(query.permission)
            return this.streamRegistryContractReadonly.hasPublicPermission(query.streamId, permissionType)
        } else {
            const chainPermissions = query.allowPublic
                ? await this.streamRegistryContractReadonly.getPermissionsForUserId(query.streamId, query.userId)
                : await this.streamRegistryContractReadonly.getDirectPermissionsForUserId(query.streamId, query.userId)
            const permissions = convertChainPermissionsToStreamPermissions(chainPermissions)
            return permissions.includes(query.permission)
        }
    }

    async getPermissions(streamIdOrPath: string): Promise<InternalPermissionAssignment[]> {
        const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
        const queryResults = await collect(
            this.theGraphClient.queryEntities<PermissionQueryResult>(
                (lastId: string, pageSize: number) => {
                    const query = `{
                    stream (id: "${streamId}") {
                        id
                        metadata
                        permissions(first: ${pageSize} orderBy: "id" where: { id_gt: "${lastId}"}) {
                            id
                            userId
                            canEdit
                            canDelete
                            publishExpiration
                            subscribeExpiration
                            canGrant
                        }
                    }
                }`
                    return { query }
                },
                (response: any) => {
                    if (response.stream !== null) {
                        return response.stream.permissions
                    } else {
                        throw new StreamrClientError('Stream not found: id=' + streamId, 'STREAM_NOT_FOUND')
                    }
                }
            )
        )
        const assignments: InternalPermissionAssignment[] = []
        queryResults.forEach((permissionResult: PermissionQueryResult) => {
            const permissions = convertChainPermissionsToStreamPermissions(permissionResult)
            /*
             * There can be query results, which don't contain any permissions. That happens if a
             * user revokes all permissions from a stream. Currently we don't remove these empty assignments
             * from The Graph index. TODO remove the "permission.length > 0" if/when we implement the
             * empty assignments cleanup in The Graph.
             */
            if (permissions.length > 0) {
                if (permissionResult.userId === PUBLIC_PERMISSION_USER_ID) {
                    assignments.push({
                        public: true,
                        permissions
                    })
                } else {
                    assignments.push({
                        userId: toUserId(permissionResult.userId),
                        permissions
                    })
                }
            }
        })
        return assignments
    }

    async grantPermissions(streamIdOrPath: string, ...assignments: InternalPermissionAssignment[]): Promise<void> {
        validatePermissionAssignments(assignments)
        const overrides = await getEthersOverrides(this.rpcProviderSource, this.config)
        return this.updatePermissions(
            streamIdOrPath,
            (streamId: StreamID, userId: UserID | undefined, solidityType: bigint) => {
                return userId === undefined
                    ? this.streamRegistryContract!.grantPublicPermission(streamId, solidityType, overrides)
                    : this.streamRegistryContract!.grantPermissionForUserId(streamId, userId, solidityType, overrides)
            },
            ...assignments
        )
    }

    async revokePermissions(streamIdOrPath: string, ...assignments: InternalPermissionAssignment[]): Promise<void> {
        validatePermissionAssignments(assignments)
        const overrides = await getEthersOverrides(this.rpcProviderSource, this.config)
        return this.updatePermissions(
            streamIdOrPath,
            (streamId: StreamID, userId: UserID | undefined, solidityType: bigint) => {
                return userId === undefined
                    ? this.streamRegistryContract!.revokePublicPermission(streamId, solidityType, overrides)
                    : this.streamRegistryContract!.revokePermissionForUserId(streamId, userId, solidityType, overrides)
            },
            ...assignments
        )
    }

    private async updatePermissions(
        streamIdOrPath: string,
        createTransaction: (
            streamId: StreamID,
            userId: UserID | undefined,
            solidityType: bigint
        ) => Promise<ContractTransactionResponse>,
        ...assignments: InternalPermissionAssignment[]
    ): Promise<void> {
        const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
        this.invalidatePermissionCaches(streamId)
        await this.connectToContract()
        for (const assignment of assignments) {
            for (const permission of assignment.permissions) {
                const solidityType = streamPermissionToSolidityType(permission)
                const userId = isPublicPermissionAssignment(assignment) ? undefined : assignment.userId
                const txToSubmit = createTransaction(streamId, userId, solidityType)
                await waitForTx(txToSubmit)
            }
        }
    }

    async setPermissions(
        ...items: {
            streamId: string
            assignments: InternalPermissionAssignment[]
        }[]
    ): Promise<void> {
        const streamIds: StreamID[] = []
        const targets: (UserID | typeof PUBLIC_PERMISSION_USER_ID)[][] = []
        const chainPermissions: ChainPermissions[][] = []
        for (const item of items) {
            validatePermissionAssignments(item.assignments)
            const streamId = await this.streamIdBuilder.toStreamID(item.streamId)
            this.invalidatePermissionCaches(streamId)
            streamIds.push(streamId)
            targets.push(
                item.assignments.map((assignment) => {
                    return isPublicPermissionAssignment(assignment) ? PUBLIC_PERMISSION_USER_ID : assignment.userId
                })
            )
            chainPermissions.push(
                item.assignments.map((assignment) => {
                    return convertStreamPermissionsToChainPermission(assignment.permissions)
                })
            )
        }
        await this.connectToContract()
        const ethersOverrides = await getEthersOverrides(this.rpcProviderSource, this.config)
        const txToSubmit = this.streamRegistryContract!.setMultipleStreamPermissionsForUserIds(
            streamIds,
            targets,
            chainPermissions,
            ethersOverrides
        )
        await waitForTx(txToSubmit)
    }

    private async isStreamPublisherOrSubscriber_nonCached(
        streamId: StreamID,
        userId: UserID,
        permission: StreamPermission
    ): Promise<boolean> {
        try {
            return await this.hasPermission({ streamId, userId, permission, allowPublic: true })
        } catch (err) {
            return streamContractErrorProcessor(err, streamId, 'StreamPermission')
        }
    }

    // --------------------------------------------------------------------------------------------
    // Caching
    // --------------------------------------------------------------------------------------------

    getStreamMetadata(streamId: StreamID): Promise<StreamMetadata> {
        return this.metadataCache.get(streamId)
    }

    isStreamPublisher(streamId: StreamID, userId: UserID): Promise<boolean> {
        return this.publisherCache.get([streamId, userId])
    }

    isStreamSubscriber(streamId: StreamID, userId: UserID): Promise<boolean> {
        return this.subscriberCache.get([streamId, userId])
    }

    hasPublicSubscribePermission(streamId: StreamID): Promise<boolean> {
        return this.publicSubscribePermissionCache.get(streamId)
    }

    populateMetadataCache(streamId: StreamID, metadata: StreamMetadata): void {
        this.metadataCache.set(streamId, metadata)
    }

    invalidatePermissionCaches(streamId: StreamID): void {
        this.logger.trace('Clear permission caches for stream', { streamId })
        invalidateCache(this.publisherCache, streamId)
        invalidateCache(this.subscriberCache, streamId)
        // TODO should also clear cache for hasPublicSubscribePermission?
    }
}
