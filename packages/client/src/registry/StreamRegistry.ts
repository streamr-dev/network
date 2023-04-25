import { ContractTransaction } from '@ethersproject/contracts'
import type { StreamRegistryV4 as StreamRegistryContract } from '../ethereumArtifacts/StreamRegistryV4'
import StreamRegistryArtifact from '../ethereumArtifacts/StreamRegistryV4Abi.json'
import { BigNumber } from '@ethersproject/bignumber'
import { Provider } from '@ethersproject/providers'
import { delay, inject, Lifecycle, scoped } from 'tsyringe'
import { getStreamRegistryChainProviders, getStreamRegistryOverrides } from '../Ethereum'
import { until } from '../utils/promises'
import { ConfigInjectionToken, StrictStreamrClientConfig } from '../Config'
import { Stream, StreamMetadata } from '../Stream'
import { NotFoundError } from '../HttpUtil'
import { StreamID, StreamIDUtils } from '@streamr/protocol'
import { StreamIDBuilder } from '../StreamIDBuilder'
import { SynchronizedGraphQLClient } from '../utils/SynchronizedGraphQLClient'
import { searchStreams as _searchStreams, SearchStreamsPermissionFilter, SearchStreamsOrderBy } from './searchStreams'
import { filter, map } from '../utils/GeneratorUtils'
import { ObservableContract, queryAllReadonlyContracts, waitForTx, initContractEventGateway } from '../utils/contract'
import {
    ChainPermissions,
    convertChainPermissionsToStreamPermissions,
    convertStreamPermissionsToChainPermission,
    isPublicPermissionAssignment,
    isPublicPermissionQuery,
    PermissionAssignment,
    PermissionQuery,
    PermissionQueryResult,
    PUBLIC_PERMISSION_ADDRESS,
    StreamPermission,
    streamPermissionToSolidityType
} from '../permission'
import { StreamRegistryCached } from './StreamRegistryCached'
import { Authentication, AuthenticationInjectionToken } from '../Authentication'
import { ContractFactory } from '../ContractFactory'
import { EthereumAddress, isENSName, Logger, toEthereumAddress } from '@streamr/utils'
import { toStreamID } from '@streamr/protocol'
import { LoggerFactory } from '../utils/LoggerFactory'
import { StreamFactory } from './../StreamFactory'
import { GraphQLQuery } from '../utils/GraphQLClient'
import { collect } from '../utils/iterators'
import { StreamrClientEventEmitter } from '../events'

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
    userAddress: EthereumAddress
}

export interface StreamCreationEvent {
    readonly streamId: StreamID
    readonly metadata: StreamMetadata
    readonly blockNumber: number
}

const streamContractErrorProcessor = (err: any, streamId: StreamID, registry: string): never => {
    if (err.reason?.code === 'CALL_EXCEPTION') {
        throw new NotFoundError('Stream not found: id=' + streamId)
    } else {
        throw new Error(`Could not reach the ${registry} Smart Contract: ${err.message}`)
    }
}

@scoped(Lifecycle.ContainerScoped)
export class StreamRegistry {

    private contractFactory: ContractFactory
    private streamIdBuilder: StreamIDBuilder
    private streamFactory: StreamFactory
    private graphQLClient: SynchronizedGraphQLClient
    private streamRegistryCached: StreamRegistryCached
    private authentication: Authentication
    private config: Pick<StrictStreamrClientConfig, 'contracts' | '_timeouts'>
    private readonly logger: Logger
    private streamRegistryContract?: ObservableContract<StreamRegistryContract>
    private streamRegistryContractsReadonly: ObservableContract<StreamRegistryContract>[]

    constructor(
        contractFactory: ContractFactory,
        @inject(LoggerFactory) loggerFactory: LoggerFactory,
        @inject(StreamIDBuilder) streamIdBuilder: StreamIDBuilder,
        streamFactory: StreamFactory,
        @inject(SynchronizedGraphQLClient) graphQLClient: SynchronizedGraphQLClient,
        @inject(delay(() => StreamRegistryCached)) streamRegistryCached: StreamRegistryCached,
        @inject(StreamrClientEventEmitter) eventEmitter: StreamrClientEventEmitter,
        @inject(AuthenticationInjectionToken) authentication: Authentication,
        @inject(ConfigInjectionToken) config: Pick<StrictStreamrClientConfig, 'contracts' | '_timeouts'>
    ) {
        this.contractFactory = contractFactory
        this.streamIdBuilder = streamIdBuilder
        this.streamFactory = streamFactory
        this.graphQLClient = graphQLClient
        this.streamRegistryCached = streamRegistryCached
        this.authentication = authentication
        this.config = config
        this.logger = loggerFactory.createLogger(module)
        const chainProviders = getStreamRegistryChainProviders(config)
        this.streamRegistryContractsReadonly = chainProviders.map((provider: Provider) => {
            return this.contractFactory.createReadContract<StreamRegistryContract>(
                toEthereumAddress(this.config.contracts.streamRegistryChainAddress),
                StreamRegistryArtifact,
                provider,
                'streamRegistry'
            )
        })
        initContractEventGateway({
            sourceName: 'StreamCreated', 
            sourceEmitter: this.streamRegistryContractsReadonly[0],
            targetName: 'createStream',
            targetEmitter: eventEmitter,
            transformation: (streamId: string, metadata: string, extra: any) => ({
                streamId: toStreamID(streamId),
                metadata: Stream.parseMetadata(metadata),
                blockNumber: extra.blockNumber
            }),
            loggerFactory
        })
    }

    private parseStream(id: StreamID, metadata: string): Stream {
        const props = Stream.parseMetadata(metadata)
        return this.streamFactory.createStream(id, props)
    }

    private async connectToContract(): Promise<void> {
        if (!this.streamRegistryContract) {
            const chainSigner = await this.authentication.getStreamRegistryChainSigner()
            this.streamRegistryContract = this.contractFactory.createWriteContract<StreamRegistryContract>(
                toEthereumAddress(this.config.contracts.streamRegistryChainAddress),
                StreamRegistryArtifact,
                chainSigner,
                'streamRegistry'
            )
        }
    }

    async createStream(streamId: StreamID, metadata: StreamMetadata): Promise<Stream> {
        const ethersOverrides = getStreamRegistryOverrides(this.config)

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
            await waitForTx(this.streamRegistryContract!.createStreamWithENS(domain, path, JSON.stringify(metadata), ethersOverrides))
            try {
                await until(
                    async () => this.streamExistsOnChain(streamId),
                    // eslint-disable-next-line no-underscore-dangle
                    this.config._timeouts.ensStreamCreation.timeout,
                    // eslint-disable-next-line no-underscore-dangle
                    this.config._timeouts.ensStreamCreation.retryInterval
                )
            } catch (e) {
                throw new Error(`unable to create stream "${streamId}"`)
            }
        } else {
            await this.ensureStreamIdInNamespaceOfAuthenticatedUser(domain, streamId)
            await waitForTx(this.streamRegistryContract!.createStream(path, JSON.stringify(metadata), ethersOverrides))
        }
        return this.streamFactory.createStream(streamId, metadata)
    }

    private async ensureStreamIdInNamespaceOfAuthenticatedUser(address: EthereumAddress, streamId: StreamID): Promise<void> {
        const userAddress = await this.authentication.getAddress()
        if (address !== userAddress) {
            throw new Error(`stream id "${streamId}" not in namespace of authenticated user "${userAddress}"`)
        }
    }

    // TODO maybe we should require metadata to be StreamMetadata instead of Partial<StreamMetadata>
    // Most likely the contract doesn't make any merging (like we do in Stream#update)?
    async updateStream(streamId: StreamID, metadata: Partial<StreamMetadata>): Promise<Stream> {
        await this.connectToContract()
        const ethersOverrides = getStreamRegistryOverrides(this.config)
        await waitForTx(this.streamRegistryContract!.updateStreamMetadata(
            streamId,
            JSON.stringify(metadata),
            ethersOverrides
        ))
        return this.streamFactory.createStream(streamId, metadata)
    }

    async deleteStream(streamIdOrPath: string): Promise<void> {
        const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
        await this.connectToContract()
        const ethersOverrides = getStreamRegistryOverrides(this.config)
        await waitForTx(this.streamRegistryContract!.deleteStream(
            streamId,
            ethersOverrides
        ))
    }

    private async streamExistsOnChain(streamIdOrPath: string): Promise<boolean> {
        const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
        this.logger.debug('Check if stream exists on chain', { streamId })
        return queryAllReadonlyContracts((contract: StreamRegistryContract) => {
            return contract.exists(streamId)
        }, this.streamRegistryContractsReadonly)
    }

    async getStream(streamIdOrPath: string): Promise<Stream> {
        const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
        let metadata
        try {
            metadata = await queryAllReadonlyContracts((contract: StreamRegistryContract) => {
                return contract.getStreamMetadata(streamId)
            }, this.streamRegistryContractsReadonly)
        } catch (err) {
            return streamContractErrorProcessor(err, streamId, 'StreamRegistry')
        }
        return this.parseStream(streamId, metadata)
    }

    searchStreams(
        term: string | undefined,
        permissionFilter: SearchStreamsPermissionFilter | undefined,
        orderBy: SearchStreamsOrderBy
    ): AsyncIterable<Stream> {
        return _searchStreams(
            term,
            permissionFilter,
            orderBy,
            this.graphQLClient,
            (id: StreamID, metadata: string) => this.parseStream(id, metadata),
            this.logger)
    }

    getStreamPublishers(streamIdOrPath: string): AsyncIterable<EthereumAddress> {
        return this.getStreamPublishersOrSubscribersList(streamIdOrPath, 'publishExpiration')
    }

    getStreamSubscribers(streamIdOrPath: string): AsyncIterable<EthereumAddress> {
        return this.getStreamPublishersOrSubscribersList(streamIdOrPath, 'subscribeExpiration')
    }

    private async* getStreamPublishersOrSubscribersList(streamIdOrPath: string, fieldName: string): AsyncIterable<EthereumAddress> {
        const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
        const backendResults = this.graphQLClient.fetchPaginatedResults<StreamPublisherOrSubscriberItem>(
            (lastId: string, pageSize: number) => StreamRegistry.buildStreamPublishersOrSubscribersQuery(streamId, fieldName, lastId, pageSize)
        )
        /*
         * There can be orphaned permission entities if a stream is deleted (currently
         * we don't remove the assigned permissions, see ETH-222)
         * TODO remove the filtering when ETH-222 has been implemented, and remove also
         * stream result field in buildStreamPublishersOrSubscribersQuery as it is
         * no longer needed
         */
        const validItems = filter<StreamPublisherOrSubscriberItem>(backendResults, (p) => (p as any).stream !== null)
        yield* map<StreamPublisherOrSubscriberItem, EthereumAddress>(
            validItems,
            (item) => item.userAddress as EthereumAddress
        )
    }

    private static buildStreamPublishersOrSubscribersQuery(
        streamId: StreamID,
        fieldName: string,
        lastId: string,
        pageSize: number
    ): GraphQLQuery {
        const query = `
        {
            permissions (
                first: ${pageSize}
                orderBy: "id"
                where: {
                    id_gt: "${lastId}"
                    stream: "${streamId}"
                    ${fieldName}_gt: "${Math.round(Date.now() / 1000)}"
                }
            ) {
                id
                userAddress
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

    /* eslint-disable no-else-return */
    async hasPermission(query: PermissionQuery): Promise<boolean> {
        const streamId = await this.streamIdBuilder.toStreamID(query.streamId)
        return queryAllReadonlyContracts((contract) => {
            const permissionType = streamPermissionToSolidityType(query.permission)
            if (isPublicPermissionQuery(query)) {
                return contract.hasPublicPermission(streamId, permissionType)
            } else if (query.allowPublic) {
                return contract.hasPermission(streamId, toEthereumAddress(query.user), permissionType)
            } else {
                return contract.hasDirectPermission(streamId, toEthereumAddress(query.user), permissionType)
            }
        }, this.streamRegistryContractsReadonly)
    }

    async getPermissions(streamIdOrPath: string): Promise<PermissionAssignment[]> {
        const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
        const queryResults = await collect(this.graphQLClient.fetchPaginatedResults<PermissionQueryResult>(
            (lastId: string, pageSize: number) => {
                const query = `{
                    stream (id: "${streamId}") {
                        id
                        metadata
                        permissions(first: ${pageSize} orderBy: "id" where: { id_gt: "${lastId}"}) {
                            id
                            userAddress
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
                    throw new NotFoundError('stream not found: id: ' + streamId)
                }
            }
        ))
        const assignments: PermissionAssignment[] = []
        queryResults.forEach((permissionResult: PermissionQueryResult) => {
            const permissions = convertChainPermissionsToStreamPermissions(permissionResult)
            /*
            * There can be query results, which don't contain any permissions. That happens if a
            * user revokes all permissions from a stream. Currently we don't remove these empty assignments
            * from The Graph index. TODO remove the "permission.length > 0" if/when we implement the
            * empty assignments cleanup in The Graph.
            */
            if (permissions.length > 0) {
                if (permissionResult.userAddress === PUBLIC_PERMISSION_ADDRESS) {
                    assignments.push({
                        public: true,
                        permissions
                    })
                } else {
                    assignments.push({
                        user: permissionResult.userAddress,
                        permissions
                    })
                }
            }
        })
        return assignments
    }

    async grantPermissions(streamIdOrPath: string, ...assignments: PermissionAssignment[]): Promise<void> {
        return this.updatePermissions(streamIdOrPath, (streamId: StreamID, user: EthereumAddress | undefined, solidityType: BigNumber) => {
            return (user === undefined)
                ? this.streamRegistryContract!.grantPublicPermission(streamId, solidityType, getStreamRegistryOverrides(this.config))
                : this.streamRegistryContract!.grantPermission(streamId, user, solidityType, getStreamRegistryOverrides(this.config))
        }, ...assignments)
    }

    async revokePermissions(streamIdOrPath: string, ...assignments: PermissionAssignment[]): Promise<void> {
        return this.updatePermissions(streamIdOrPath, (streamId: StreamID, user: EthereumAddress | undefined, solidityType: BigNumber) => {
            return (user === undefined)
                ? this.streamRegistryContract!.revokePublicPermission(streamId, solidityType, getStreamRegistryOverrides(this.config))
                : this.streamRegistryContract!.revokePermission(streamId, user, solidityType, getStreamRegistryOverrides(this.config))
        }, ...assignments)
    }

    private async updatePermissions(
        streamIdOrPath: string,
        createTransaction: (streamId: StreamID, user: EthereumAddress | undefined, solidityType: BigNumber) => Promise<ContractTransaction>,
        ...assignments: PermissionAssignment[]
    ): Promise<void> {
        const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
        this.streamRegistryCached.clearStream(streamId)
        await this.connectToContract()
        for (const assignment of assignments) {
            for (const permission of assignment.permissions) {
                const solidityType = streamPermissionToSolidityType(permission)
                const user = isPublicPermissionAssignment(assignment) ? undefined : toEthereumAddress(assignment.user)
                const txToSubmit = createTransaction(streamId, user, solidityType)
                // eslint-disable-next-line no-await-in-loop
                await waitForTx(txToSubmit)
            }
        }
    }

    async setPermissions(...items: {
        streamId: string
        assignments: PermissionAssignment[]
    }[]): Promise<void> {
        const streamIds: StreamID[] = []
        const targets: string[][] = []
        const chainPermissions: ChainPermissions[][] = []
        for (const item of items) {
            // eslint-disable-next-line no-await-in-loop
            const streamId = await this.streamIdBuilder.toStreamID(item.streamId)
            this.streamRegistryCached.clearStream(streamId)
            streamIds.push(streamId)
            targets.push(item.assignments.map((assignment) => {
                return isPublicPermissionAssignment(assignment) ? PUBLIC_PERMISSION_ADDRESS : assignment.user
            }))
            chainPermissions.push(item.assignments.map((assignment) => {
                return convertStreamPermissionsToChainPermission(assignment.permissions)
            }))
        }
        await this.connectToContract()
        const ethersOverrides = getStreamRegistryOverrides(this.config)
        const txToSubmit = this.streamRegistryContract!.setPermissionsMultipleStreams(
            streamIds,
            targets,
            chainPermissions,
            ethersOverrides
        )
        await waitForTx(txToSubmit)
    }

    async isStreamPublisher(streamIdOrPath: string, userAddress: EthereumAddress): Promise<boolean> {
        const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
        try {
            return await queryAllReadonlyContracts((contract) => {
                return contract.hasPermission(streamId, userAddress, streamPermissionToSolidityType(StreamPermission.PUBLISH))
            }, this.streamRegistryContractsReadonly)
        } catch (err) {
            return streamContractErrorProcessor(err, streamId, 'StreamPermission')
        }
    }

    async isStreamSubscriber(streamIdOrPath: string, userAddress: EthereumAddress): Promise<boolean> {
        const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
        try {
            return await queryAllReadonlyContracts((contract) => {
                return contract.hasPermission(streamId, userAddress, streamPermissionToSolidityType(StreamPermission.SUBSCRIBE))
            }, this.streamRegistryContractsReadonly)
        } catch (err) {
            return streamContractErrorProcessor(err, streamId, 'StreamPermission')
        }
    }
}
