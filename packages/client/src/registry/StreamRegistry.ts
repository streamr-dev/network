import { Contract, ContractTransaction } from '@ethersproject/contracts'
import type { StreamRegistryV3 as StreamRegistryContract } from '../ethereumArtifacts/StreamRegistryV3'
import StreamRegistryArtifact from '../ethereumArtifacts/StreamRegistryV3Abi.json'
import { BigNumber } from '@ethersproject/bignumber'
import { Provider } from '@ethersproject/providers'
import { scoped, Lifecycle, inject, delay, DependencyContainer } from 'tsyringe'
import { BrubeckContainer } from '../Container'
import { EthereumConfig, getAllStreamRegistryChainProviders, getStreamRegistryOverrides } from '../Ethereum'
import { instanceId } from '../utils/utils'
import { until } from '../utils/promises'
import { Context } from '../utils/Context'
import { ConfigInjectionToken, StrictStreamrClientConfig } from '../Config'
import { Stream, StreamProperties } from '../Stream'
import { ErrorCode, NotFoundError } from '../HttpUtil'
import {
    StreamID,
    EthereumAddress,
    StreamIDUtils, 
    KeyExchangeStreamIDUtils
} from 'streamr-client-protocol'
import { StreamIDBuilder } from '../StreamIDBuilder'
import { omit } from 'lodash'
import { createWriteContract, SynchronizedGraphQLClient } from '../utils/SynchronizedGraphQLClient'
import { searchStreams as _searchStreams, SearchStreamsPermissionFilter } from './searchStreams'
import { filter, map } from '../utils/GeneratorUtils'
import { ObservableContract, waitForTx, withErrorHandlingAndLogging } from '../utils/contract'
import {
    StreamPermission,
    convertChainPermissionsToStreamPermissions,
    convertStreamPermissionsToChainPermission,
    isPublicPermissionAssignment,
    isPublicPermissionQuery,
    PermissionAssignment,
    PermissionQuery,
    PermissionQueryResult,
    PUBLIC_PERMISSION_ADDRESS,
    SingleStreamQueryResult,
    streamPermissionToSolidityType,
    ChainPermissions
} from '../permission'
import { StreamRegistryCached } from './StreamRegistryCached'
import { Authentication, AuthenticationInjectionToken } from '../Authentication'

export type StreamQueryResult = {
    id: string,
    metadata: string
}

type StreamPublisherOrSubscriberItem = {
    id: string
    userAddress: EthereumAddress
}

const streamContractErrorProcessor = (err: any, streamId: StreamID, registry: string): never => {
    if (err.errors) {
        if (err.errors.some((e: any) => e.reason?.code === 'CALL_EXCEPTION')) {
            throw new NotFoundError('Stream not found: id=' + streamId)
        } else {
            throw new Error(`Could not reach the ${registry} Smart Contract: ${err.errors[0]}`)
        }
    } else {
        throw new Error(err)
    }
}

@scoped(Lifecycle.ContainerScoped)
export class StreamRegistry implements Context {
    readonly id
    readonly debug
    private streamRegistryContract?: ObservableContract<StreamRegistryContract>
    private streamRegistryContractsReadonly: ObservableContract<StreamRegistryContract>[]

    constructor(
        context: Context,
        @inject(StreamIDBuilder) private streamIdBuilder: StreamIDBuilder,
        @inject(BrubeckContainer) private container: DependencyContainer,
        @inject(ConfigInjectionToken.Root) private config: StrictStreamrClientConfig,
        @inject(SynchronizedGraphQLClient) private graphQLClient: SynchronizedGraphQLClient,
        @inject(delay(() => StreamRegistryCached)) private streamRegistryCached: StreamRegistryCached,
        @inject(AuthenticationInjectionToken) private authentication: Authentication,
        @inject(ConfigInjectionToken.Ethereum) private ethereumConfig: EthereumConfig
    ) {
        this.id = instanceId(this)
        this.debug = context.debug.extend(this.id)
        this.debug('create')
        const chainProviders = getAllStreamRegistryChainProviders(ethereumConfig)
        this.streamRegistryContractsReadonly = chainProviders.map((provider: Provider) => {
            return withErrorHandlingAndLogging<StreamRegistryContract>(
                new Contract(this.config.streamRegistryChainAddress, StreamRegistryArtifact, provider),
                'streamRegistry'
            )
        })
    }

    private parseStream(id: StreamID, metadata: string): Stream {
        const props: StreamProperties = Stream.parsePropertiesFromMetadata(metadata)
        return new Stream({ ...props, id }, this.container)
    }

    // --------------------------------------------------------------------------------------------
    // Send transactions to the StreamRegistry contract
    // --------------------------------------------------------------------------------------------

    private async connectToStreamRegistryContract(): Promise<void> {
        if (!this.streamRegistryContract) {
            const chainSigner = await this.authentication.getStreamRegistryChainSigner()
            this.streamRegistryContract = createWriteContract<StreamRegistryContract>(
                this.config.streamRegistryChainAddress,
                StreamRegistryArtifact,
                chainSigner,
                'streamRegistry',
                this.graphQLClient
            )
        }
    }

    async getOrCreateStream(props: { id: string, partitions?: number }): Promise<Stream> {
        this.debug('getOrCreateStream %o', {
            props,
        })
        try {
            return await this.getStream(props.id)
        } catch (err: any) {
            // If stream does not exist, attempt to create it
            if (err.errorCode === ErrorCode.NOT_FOUND) {
                const stream = await this.createStream(props)
                this.debug('created stream: %s %o', props.id, stream.toObject())
                return stream
            }
            throw err
        }
    }

    async createStream(propsOrStreamIdOrPath: StreamProperties | string): Promise<Stream> {
        const props = typeof propsOrStreamIdOrPath === 'object' ? propsOrStreamIdOrPath : { id: propsOrStreamIdOrPath }
        props.partitions ??= 1

        const ethersOverrides = getStreamRegistryOverrides(this.ethereumConfig)

        const streamId = await this.streamIdBuilder.toStreamID(props.id)
        const metadata = StreamRegistry.formMetadata(props)

        const domainAndPath = StreamIDUtils.getDomainAndPath(streamId)
        if (domainAndPath === undefined) {
            throw new Error(`stream id "${streamId}" not valid`)
        }
        const [domain, path] = domainAndPath

        await this.connectToStreamRegistryContract()
        if (StreamIDUtils.isENSAddress(domain)) {
            /*
                The call to createStreamWithENS delegates the ENS ownership check, and therefore the
                call doesn't fail e.g. if the user doesn't own the ENS name. To see whether the stream
                creation succeeeds, we need to poll the chain for stream existence. If the polling timeouts, we don't
                know what the actual error was. (Most likely it has nothing to do with timeout
                -> we don't use the error from until(), but throw an explicit error instead.)
            */
            await waitForTx(this.streamRegistryContract!.createStreamWithENS(domain, path, metadata, ethersOverrides))
            try {
                await until(
                    async () => this.streamExistsOnChain(streamId),
                    // eslint-disable-next-line no-underscore-dangle
                    this.config._timeouts.jsonRpc.timeout,
                    // eslint-disable-next-line no-underscore-dangle
                    this.config._timeouts.jsonRpc.retryInterval
                )
            } catch (e) {
                throw new Error(`unable to create stream "${streamId}"`)
            }
        } else {
            await this.ensureStreamIdInNamespaceOfAuthenticatedUser(domain, streamId)
            await waitForTx(this.streamRegistryContract!.createStream(path, metadata, ethersOverrides))
        }
        return new Stream({
            ...props,
            id: streamId
        }, this.container)
    }

    private async ensureStreamIdInNamespaceOfAuthenticatedUser(address: EthereumAddress, streamId: StreamID): Promise<void> {
        const userAddress = await this.authentication.getAddress()
        if (address.toLowerCase() !== userAddress.toLowerCase()) {
            throw new Error(`stream id "${streamId}" not in namespace of authenticated user "${userAddress}"`)
        }
    }

    async updateStream(props: StreamProperties): Promise<Stream> {
        const streamId = await this.streamIdBuilder.toStreamID(props.id)
        await this.connectToStreamRegistryContract()
        const ethersOverrides = getStreamRegistryOverrides(this.ethereumConfig)
        await waitForTx(this.streamRegistryContract!.updateStreamMetadata(
            streamId,
            StreamRegistry.formMetadata(props),
            ethersOverrides
        ))
        return new Stream({
            ...props,
            id: streamId
        }, this.container)
    }

    async deleteStream(streamIdOrPath: string): Promise<void> {
        const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
        this.debug('Deleting stream %s', streamId)
        await this.connectToStreamRegistryContract()
        const ethersOverrides = getStreamRegistryOverrides(this.ethereumConfig)
        await waitForTx(this.streamRegistryContract!.deleteStream(
            streamId,
            ethersOverrides
        ))
    }

    private async streamExistsOnChain(streamIdOrPath: string): Promise<boolean> {
        const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
        this.debug('Checking if stream exists on chain %s', streamId)
        return Promise.any([
            ...this.streamRegistryContractsReadonly.map((contract: StreamRegistryContract) => {
                return contract.exists(streamId)
            })
        ])
    }

    async getStream(streamIdOrPath: string): Promise<Stream> {
        const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
        this.debug('Getting stream %s', streamId)
        if (KeyExchangeStreamIDUtils.isKeyExchangeStream(streamId)) {
            return new Stream({ id: streamId, partitions: 1 }, this.container)
        }
        let metadata
        try {
            metadata = await this.queryAllReadonlyContracts((contract: StreamRegistryContract) => {
                return contract.getStreamMetadata(streamId)
            })
        } catch (err) {
            return streamContractErrorProcessor(err, streamId, 'StreamRegistry')
        }
        return this.parseStream(streamId, metadata)
    }

    searchStreams(term: string | undefined, permissionFilter: SearchStreamsPermissionFilter | undefined): AsyncGenerator<Stream> {
        return _searchStreams(
            term, 
            permissionFilter,
            this.graphQLClient,
            (id: StreamID, metadata: string) => this.parseStream(id, metadata),
            this.debug)
    }

    getStreamPublishers(streamIdOrPath: string): AsyncGenerator<EthereumAddress> {
        return this.getStreamPublishersOrSubscribersList(streamIdOrPath, 'publishExpiration')
    }

    getStreamSubscribers(streamIdOrPath: string): AsyncGenerator<EthereumAddress> {
        return this.getStreamPublishersOrSubscribersList(streamIdOrPath, 'subscribeExpiration')
    }

    private async* getStreamPublishersOrSubscribersList(streamIdOrPath: string, fieldName: string): AsyncGenerator<EthereumAddress> {
        const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
        this.debug(`Get stream ${fieldName}s for stream id ${streamId}`)
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
    ): string {
        const query = `
        {
            permissions (first: ${pageSize}, where: {stream: "${streamId}" ${fieldName}_gt: "${Date.now()}" id_gt: "${lastId}"}) {
                id
                userAddress
                stream {
                    id
                }
            }
        }`
        return JSON.stringify({ query })
    }

    private static formMetadata(props: StreamProperties): string {
        return JSON.stringify(omit(props, 'id'))
    }

    private static buildGetStreamWithPermissionsQuery(streamId: StreamID): string {
        const query = `
        {
            stream (id: "${streamId}") {
                id
                metadata
                permissions {
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
        return JSON.stringify({ query })
    }

    // --------------------------------------------------------------------------------------------
    // Permissions
    // --------------------------------------------------------------------------------------------

    /* eslint-disable no-else-return */
    async hasPermission(query: PermissionQuery): Promise<boolean> {
        const streamId = await this.streamIdBuilder.toStreamID(query.streamId)
        return this.queryAllReadonlyContracts((contract) => {
            const permissionType = streamPermissionToSolidityType(query.permission)
            if (isPublicPermissionQuery(query)) {
                return contract.hasPublicPermission(streamId, permissionType)
            } else if (query.allowPublic) {
                return contract.hasPermission(streamId, query.user, permissionType)
            } else {
                return contract.hasDirectPermission(streamId, query.user, permissionType)
            }
        })
    }

    async getPermissions(streamIdOrPath: string): Promise<PermissionAssignment[]> {
        const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
        const response = await this.graphQLClient.sendQuery(StreamRegistry.buildGetStreamWithPermissionsQuery(streamId)) as SingleStreamQueryResult
        if (!response.stream) {
            throw new NotFoundError('stream not found: id: ' + streamId)
        }
        const assignments: PermissionAssignment[] = []
        response.stream.permissions
            .forEach((permissionResult: PermissionQueryResult) => {
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
        return this.updatePermissions(streamIdOrPath, (streamId: StreamID, user: EthereumAddress|undefined, solidityType: BigNumber) => {
            return (user === undefined)
                ? this.streamRegistryContract!.grantPublicPermission(streamId, solidityType, getStreamRegistryOverrides(this.ethereumConfig))
                : this.streamRegistryContract!.grantPermission(streamId, user, solidityType, getStreamRegistryOverrides(this.ethereumConfig))
        }, ...assignments)
    }

    async revokePermissions(streamIdOrPath: string, ...assignments: PermissionAssignment[]): Promise<void> {
        return this.updatePermissions(streamIdOrPath, (streamId: StreamID, user: EthereumAddress|undefined, solidityType: BigNumber) => {
            return (user === undefined)
                ? this.streamRegistryContract!.revokePublicPermission(streamId, solidityType, getStreamRegistryOverrides(this.ethereumConfig))
                : this.streamRegistryContract!.revokePermission(streamId, user, solidityType, getStreamRegistryOverrides(this.ethereumConfig))
        }, ...assignments)
    }

    private async updatePermissions(
        streamIdOrPath: string,
        createTransaction: (streamId: StreamID, user: EthereumAddress|undefined, solidityType: BigNumber) => Promise<ContractTransaction>,
        ...assignments: PermissionAssignment[]
    ): Promise<void> {
        const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
        this.streamRegistryCached.clearStream(streamId)
        await this.connectToStreamRegistryContract()
        for (const assignment of assignments) {
            for (const permission of assignment.permissions) {
                const solidityType = streamPermissionToSolidityType(permission)
                const user = isPublicPermissionAssignment(assignment) ? undefined : assignment.user
                const txToSubmit = createTransaction(streamId, user, solidityType)
                // eslint-disable-next-line no-await-in-loop
                await waitForTx(txToSubmit)
            }
        }
    }

    async setPermissions(...items: {
        streamId: string,
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
        await this.connectToStreamRegistryContract()
        const ethersOverrides = getStreamRegistryOverrides(this.ethereumConfig)
        const txToSubmit = this.streamRegistryContract!.setPermissionsMultipleStreans(
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
            return await this.queryAllReadonlyContracts((contract) => {
                return contract.hasPermission(streamId, userAddress, streamPermissionToSolidityType(StreamPermission.PUBLISH))
            })
        } catch (err) {
            return streamContractErrorProcessor(err, streamId, 'StreamPermission')
        }
    }

    async isStreamSubscriber(streamIdOrPath: string, userAddress: EthereumAddress): Promise<boolean> {
        const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
        try {
            return await this.queryAllReadonlyContracts((contract) => {
                return contract.hasPermission(streamId, userAddress, streamPermissionToSolidityType(StreamPermission.SUBSCRIBE))
            })
        } catch (err) {
            return streamContractErrorProcessor(err, streamId, 'StreamPermission')
        }
    }

    // --------------------------------------------------------------------------------------------
    // Helpers
    // --------------------------------------------------------------------------------------------

    private queryAllReadonlyContracts<T>(call: (contract: StreamRegistryContract) => Promise<T>): any {
        return Promise.any([
            ...this.streamRegistryContractsReadonly.map((contract: StreamRegistryContract) => {
                return call(contract)
            })
        ])
    }
}
