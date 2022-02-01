import { Contract, Overrides } from '@ethersproject/contracts'
import { Signer } from '@ethersproject/abstract-signer'
import type { StreamRegistry as StreamRegistryContract } from './ethereumArtifacts/StreamRegistry.d'
import StreamRegistryArtifact from './ethereumArtifacts/StreamRegistryAbi.json'
import { BigNumber } from '@ethersproject/bignumber'
import { Provider } from '@ethersproject/providers'
import { scoped, Lifecycle, inject, DependencyContainer } from 'tsyringe'
import { BrubeckContainer } from './Container'
import Ethereum from './Ethereum'
import { instanceId, until } from './utils'
import { Context } from './utils/Context'
import { Config, StrictStreamrClientConfig } from './Config'
import { Stream, StreamPermission, StreamPermissions, StreamProperties } from './Stream'
import { NotFoundError } from './authFetch'
import {
    StreamID,
    EthereumAddress,
    StreamIDUtils, toStreamID,
} from 'streamr-client-protocol'
import { AddressZero, MaxInt256 } from '@ethersproject/constants'
import { StreamIDBuilder } from './StreamIDBuilder'
import { GraphQLClient } from './utils/GraphQLClient'
import { fetchSearchStreamsResultFromTheGraph, SearchStreamsPermissionFilter, SearchStreamsResultItem } from './searchStreams'
import { filter, map } from './utils/GeneratorUtils'

type PermissionQueryResult = {
    id: string
    userAddress: string
} & ChainPermissions

/** @internal */
export type ChainPermissions = {
    canEdit: boolean
    canDelete: boolean
    publishExpiration: BigNumber
    subscribeExpiration: BigNumber
    canGrant: boolean
}

type StreamPermissionsQueryResult = {
    id: string
    metadata: string
    permissions: PermissionQueryResult[]
}

/** @internal */
export type StreamQueryResult = {
    id: string,
    metadata: string
}

/** @internal */
export type SingleStreamQueryResult = {
    stream: StreamPermissionsQueryResult | null
}

type StreamPublisherOrSubscriberItem = {
    id: string
    userAddress: string
}

interface PermissionsAssignment {
    address: EthereumAddress,
    permissions: StreamPermission[]
}

export type PublicPermissionId = 'public'
const PUBLIC_PERMISSION_ID: PublicPermissionId = 'public'
/** @internal */
export const PUBLIC_PERMISSION_ADDRESS = '0x0000000000000000000000000000000000000000'

@scoped(Lifecycle.ContainerScoped)
export class StreamRegistry implements Context {
    id
    debug
    streamRegistryContract?: StreamRegistryContract
    streamRegistryContractReadonly: StreamRegistryContract
    chainProvider: Provider
    chainSigner?: Signer
    defaultOverrides: Overrides

    constructor(
        context: Context,
        @inject(Ethereum) private ethereum: Ethereum,
        @inject(StreamIDBuilder) private streamIdBuilder: StreamIDBuilder,
        @inject(BrubeckContainer) private container: DependencyContainer,
        @inject(Config.Root) private config: StrictStreamrClientConfig,
        @inject(GraphQLClient) private graphQLClient: GraphQLClient
    ) {
        this.id = instanceId(this)
        this.debug = context.debug.extend(this.id)
        this.debug('create')
        this.chainProvider = this.ethereum.getStreamRegistryChainProvider()
        this.streamRegistryContractReadonly = new Contract(this.config.streamRegistryChainAddress,
            StreamRegistryArtifact, this.chainProvider) as StreamRegistryContract
        const streamRegistryChainName = this.config.streamRegistryChainRPC?.name
        this.defaultOverrides = this.config.ethereumNetworks && streamRegistryChainName
            ? this.config.ethereumNetworks[streamRegistryChainName]?.overrides ?? {} : {}
    }

    private parseStream(id: StreamID, propsString: string): Stream {
        const parsedProps: StreamProperties = Stream.parseStreamPropsFromJson(propsString)
        return new Stream({ ...parsedProps, id }, this.container)
    }

    // --------------------------------------------------------------------------------------------
    // Read from the StreamRegistry contract
    // --------------------------------------------------------------------------------------------

    async getStreamFromContract(streamIdOrPath: string): Promise<Stream> {
        const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
        this.debug('getStream %s', streamId)
        try {
            const propertiesString = await this.streamRegistryContractReadonly.getStreamMetadata(streamId) || '{}'
            return this.parseStream(streamId, propertiesString)
        } catch (error) {
            this.debug(error)
        }
        throw new NotFoundError('Stream: id=' + streamId)
    }

    async hasPermission(streamIdOrPath: string, userAddress: EthereumAddress, permission: StreamPermission) {
        const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
        return this.streamRegistryContractReadonly.hasPermission(streamId, userAddress,
            StreamRegistry.streamPermissionToSolidityType(permission))
    }

    async hasPublicPermission(streamIdOrPath: string, permission: StreamPermission) {
        const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
        return this.streamRegistryContractReadonly.hasPublicPermission(streamId,
            StreamRegistry.streamPermissionToSolidityType(permission))
    }

    async hasDirectPermission(streamIdOrPath: string, userAddess: EthereumAddress, permission: StreamPermission) {
        const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
        return this.streamRegistryContractReadonly.hasDirectPermission(streamId, userAddess,
            StreamRegistry.streamPermissionToSolidityType(permission))
    }

    async getPermissionsForUser(streamIdOrPath: string, userAddress?: EthereumAddress): Promise<StreamPermissions> {
        const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
        await this.connectToStreamRegistryContract()
        this.debug('Getting permissions for stream %s for user %s', streamId, userAddress)
        const permissions = await this.streamRegistryContractReadonly!.getPermissionsForUser(streamId, userAddress || AddressZero)
        return {
            canEdit: permissions.canEdit,
            canDelete: permissions.canDelete,
            canPublish: BigNumber.from(permissions.publishExpiration).gt(Date.now()),
            canSubscribe: BigNumber.from(permissions.subscribeExpiration).gt(Date.now()),
            canGrant: permissions.canGrant
        }
    }

    // --------------------------------------------------------------------------------------------
    // Send transactions to the StreamRegistry contract
    // --------------------------------------------------------------------------------------------

    private async connectToStreamRegistryContract() {
        if (!this.chainSigner || !this.streamRegistryContract) {
            this.chainSigner = await this.ethereum.getStreamRegistryChainSigner()
            this.streamRegistryContract = new Contract(this.config.streamRegistryChainAddress,
                StreamRegistryArtifact, this.chainSigner) as StreamRegistryContract
        }
    }

    async createStream(propsOrStreamIdOrPath: StreamProperties | string): Promise<Stream> {
        const props = typeof propsOrStreamIdOrPath === 'object' ? propsOrStreamIdOrPath : { id: propsOrStreamIdOrPath }
        props.partitions ??= 1

        const ethersOverrides = this.defaultOverrides

        const streamId = await this.streamIdBuilder.toStreamID(props.id)

        const normalizedProperties = {
            ...props,
            id: streamId
        }

        const domainAndPath = StreamIDUtils.getDomainAndPath(streamId)
        if (domainAndPath === undefined) {
            throw new Error(`stream id "${streamId}" not valid`)
        }
        const [domain, path] = domainAndPath

        await this.connectToStreamRegistryContract()
        let tx
        if (StreamIDUtils.isENSAddress(domain)) {
            tx = await this.streamRegistryContract!.createStreamWithENS(domain, path, JSON.stringify(normalizedProperties), ethersOverrides)
            /*
                The call to createStreamWithENS delegates the ENS ownership check, and therefore the
                call doesn't fail e.g. if the user doesn't own the ENS name. To see whether the stream
                creation succeeeds, we need to poll The Graph. If the polling timeouts, we don'
                know what the actual error was. (Most likely it has anything to do with timeout
                -> we don't use the error from until(), but throw an explicit error instead.)
            */
        } else {
            await this.ensureStreamIdInNamespaceOfAuthenticatedUser(domain, streamId)
            tx = await this.streamRegistryContract!.createStream(path, JSON.stringify(normalizedProperties), ethersOverrides)
        }
        await tx.wait()
        try {
            await until(async () => { return this.streamExistsOnTheGraph(streamId) }, 20000, 500)
        } catch (e) {
            throw new Error(`unable to create stream "${streamId}"`)
        }

        return new Stream(normalizedProperties, this.container)
    }

    private async ensureStreamIdInNamespaceOfAuthenticatedUser(address: EthereumAddress, streamId: StreamID): Promise<void> {
        const userAddress = await this.ethereum.getAddress()
        if (address.toLowerCase() !== userAddress.toLowerCase()) {
            throw new Error(`stream id "${streamId}" not in namespace of authenticated user "${userAddress}"`)
        }
    }

    async updateStream(props: StreamProperties): Promise<Stream> {
        const streamId = await this.streamIdBuilder.toStreamID(props.id)
        const normalizedProperties = {
            ...props,
            id: streamId
        }
        await this.connectToStreamRegistryContract()
        const ethersOverrides = this.defaultOverrides
        const tx = await this.streamRegistryContract!.updateStreamMetadata(
            streamId,
            JSON.stringify(normalizedProperties),
            ethersOverrides
        )
        await tx.wait()
        return new Stream(normalizedProperties, this.container)
    }

    async grantPermission(streamIdOrPath: string, permission: StreamPermission, receivingUser: string) {
        const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
        this.debug('Granting Permission %o for user %s on stream %s', permission, receivingUser, streamId)
        await this.connectToStreamRegistryContract()
        const ethersOverrides = this.defaultOverrides
        const tx = await this.streamRegistryContract!.grantPermission(
            streamId,
            receivingUser,
            StreamRegistry.streamPermissionToSolidityType(permission),
            ethersOverrides
        )
        await tx.wait()
    }

    async grantPublicPermission(streamIdOrPath: string, permission: StreamPermission) {
        const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
        this.debug('Granting PUBLIC Permission %o on stream %s', permission, streamId)
        await this.connectToStreamRegistryContract()
        const ethersOverrides = this.defaultOverrides
        const tx = await this.streamRegistryContract!.grantPublicPermission(
            streamId,
            StreamRegistry.streamPermissionToSolidityType(permission),
            ethersOverrides
        )
        await tx.wait()
    }

    async setPermissionsForUser(
        streamIdOrPath: string,
        receivingUser: string,
        edit: boolean,
        deletePermission: boolean,
        publish: boolean,
        subscribe: boolean,
        share: boolean
    ) {
        const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
        this.debug(`Setting permissions for user ${receivingUser} on stream ${streamId}:
        edit: ${edit}, delete: ${deletePermission}, publish: ${publish}, subscribe: ${subscribe}, share: ${share}`)
        await this.connectToStreamRegistryContract()
        const ethersOverrides = this.defaultOverrides
        const publishExpiration = publish ? MaxInt256 : 0
        const subscribeExpiration = subscribe ? MaxInt256 : 0
        const tx = await this.streamRegistryContract!.setPermissionsForUser(
            streamId,
            receivingUser,
            edit,
            deletePermission,
            publishExpiration,
            subscribeExpiration,
            share,
            ethersOverrides
        )
        await tx.wait()
    }

    static convertStreamPermissionToChainPermission(permission: StreamPermissions): ChainPermissions {
        return {
            ...permission,
            publishExpiration: permission.canPublish ? MaxInt256 : BigNumber.from(0),
            subscribeExpiration: permission.canSubscribe ? MaxInt256 : BigNumber.from(0)
        }
    }

    async setPermissions(streamIdOrPath: string, users: string[], permissions: StreamPermissions[]) {
        const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
        this.debug(`Setting permissions for stream ${streamId} for ${users.length} users`)
        await this.connectToStreamRegistryContract()
        const ethersOverrides = this.defaultOverrides
        const transformedPermission = permissions.map(StreamRegistry.convertStreamPermissionToChainPermission)
        const tx = await this.streamRegistryContract!.setPermissions(streamId, users, transformedPermission, ethersOverrides)
        await tx.wait()
    }

    async revokePermission(streamIdOrPath: string, permission: StreamPermission, receivingUser: string) {
        const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
        this.debug('Revoking permission %o for user %s on stream %s', permission, receivingUser, streamId)
        await this.connectToStreamRegistryContract()
        const ethersOverrides = this.defaultOverrides
        const tx = await this.streamRegistryContract!.revokePermission(
            streamId,
            receivingUser,
            StreamRegistry.streamPermissionToSolidityType(permission),
            ethersOverrides
        )
        await tx.wait()
    }

    async revokeAllMyPermission(streamIdOrPath: string) {
        const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
        this.debug('Revoking all permissions user %s on stream %s', await this.ethereum.getAddress(), streamId)
        await this.connectToStreamRegistryContract()
        const ethersOverrides = this.defaultOverrides
        const tx = await this.streamRegistryContract!.revokeAllPermissionsForUser(streamId, await this.ethereum.getAddress(), ethersOverrides)
        await tx.wait()
    }

    async revokeAllUserPermission(streamIdOrPath: string, userId: EthereumAddress) {
        const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
        this.debug('Revoking all permissions user %s on stream %s', userId, streamId)
        await this.connectToStreamRegistryContract()
        const ethersOverrides = this.defaultOverrides
        const tx = await this.streamRegistryContract!.revokeAllPermissionsForUser(streamId, userId, ethersOverrides)
        await tx.wait()
    }

    async revokePublicPermission(streamIdOrPath: string, permission: StreamPermission) {
        const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
        this.debug('Revoking PUBLIC Permission %o on stream %s', permission, streamId)
        await this.connectToStreamRegistryContract()
        const ethersOverrides = this.defaultOverrides
        const tx = await this.streamRegistryContract!.revokePublicPermission(
            streamId,
            StreamRegistry.streamPermissionToSolidityType(permission),
            ethersOverrides
        )
        await tx.wait()
    }

    async revokeAllPublicPermissions(streamIdOrPath: string) {
        const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
        this.debug('Revoking all PUBLIC Permissions stream %s', streamId)
        await this.connectToStreamRegistryContract()
        const ethersOverrides = this.defaultOverrides
        const tx = await this.streamRegistryContract!.revokeAllPermissionsForUser(
            streamId,
            AddressZero,
            ethersOverrides
        )
        await tx.wait()
    }

    async deleteStream(streamIdOrPath: string) {
        const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
        this.debug('Deleting stream %s', streamId)
        await this.connectToStreamRegistryContract()
        const ethersOverrides = this.defaultOverrides
        const tx = await this.streamRegistryContract!.deleteStream(streamId, ethersOverrides)
        await tx.wait()
    }

    async streamExists(streamIdOrPath: string): Promise<boolean> {
        const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
        this.debug('Checking if stream exists %s', streamId)
        await this.connectToStreamRegistryContract()
        return this.streamRegistryContractReadonly!.exists(streamId)
    }

    async streamExistsOnTheGraph(streamIdOrPath: string): Promise<boolean> {
        const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
        this.debug('Checking if stream exists on theGraph %s', streamId)
        try {
            await this.getStreamFromGraph(streamId)
            return true
        } catch (err) {
            if (err.errorCode === 'NOT_FOUND') {
                return false
            }
            throw err
        }
    }

    private static streamPermissionToSolidityType(permission: StreamPermission): BigNumber {
        switch (permission) {
            case StreamPermission.EDIT:
                return BigNumber.from(0)
            case StreamPermission.DELETE:
                return BigNumber.from(1)
            case StreamPermission.PUBLISH:
                return BigNumber.from(2)
            case StreamPermission.SUBSCRIBE:
                return BigNumber.from(3)
            case StreamPermission.GRANT:
                return BigNumber.from(4)
            default:
                break
        }
        return BigNumber.from(0)
    }

    // --------------------------------------------------------------------------------------------
    // GraphQL queries
    // --------------------------------------------------------------------------------------------

    async getStream(streamIdOrPath: string): Promise<Stream> {
        const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
        this.debug('Getting stream %s', streamId)
        if (StreamIDUtils.isKeyExchangeStream(streamId)) {
            return new Stream({ id: streamId, partitions: 1 }, this.container)
        }
        let metadata
        try {
            metadata = await this.streamRegistryContractReadonly.getStreamMetadata(streamId)
        } catch {
            throw new NotFoundError('Stream not found: id=' + streamId)
        }
        return this.parseStream(streamId, metadata)
    }

    async getStreamFromGraph(streamIdOrPath: string): Promise<Stream> {
        const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
        this.debug('Getting stream %s from theGraph', streamId)
        if (StreamIDUtils.isKeyExchangeStream(streamId)) {
            return new Stream({ id: streamId, partitions: 1 }, this.container)
        }
        const response = await this.graphQLClient.sendQuery(
            StreamRegistry.buildGetStreamQuery(streamId)
        ) as { stream: StreamPermissionsQueryResult }
        if (!response.stream) {
            throw new NotFoundError('Stream not found: id=' + streamId)
        }
        return this.parseStream(streamId, response.stream.metadata)
    }

    async* getAllStreams(): AsyncGenerator<Stream> {
        this.debug('Get all streams from thegraph')
        const backendResults = this.graphQLClient.fetchPaginatedResults<StreamQueryResult>(
            (lastId: string, pageSize: number) => StreamRegistry.buildGetAllStreamsQuery(lastId, pageSize)
        )
        for await (const item of backendResults) {
            try {
                // toStreamID isn't strictly needed here since we are iterating over a result set from the Graph
                // (we could just cast). _If_ this ever throws, one of our core assumptions is wrong.
                yield this.parseStream(toStreamID(item.id), item.metadata)
            } catch (err) {
                this.debug(`Skipping stream ${item.id} cannot parse metadata: ${item.metadata}`)
            }
        }
    }

    private static buildGetAllStreamsQuery(lastId: string, pageSize: number): string {
        const query = `
        {
            streams (first: ${pageSize} id_gt: "${lastId}") {
                 id
                 metadata
            }
        }`
        return JSON.stringify({ query })
    }

    /**
     * The user addresses are in lowercase format
     */
    async getAllPermissionsForStream(streamIdOrPath: string): Promise<Record<EthereumAddress|PublicPermissionId, StreamPermission[]>> {
        const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
        this.debug('Getting all permissions for stream %s', streamId)
        const response = await this.graphQLClient.sendQuery(StreamRegistry.buildGetStreamQuery(streamId)) as SingleStreamQueryResult
        if (!response.stream) {
            throw new NotFoundError('stream not found: id: ' + streamId)
        }
        const result: Record<EthereumAddress, StreamPermission[]> = {}
        response.stream.permissions
            .map(StreamRegistry.getPermissionsAssignment)
            .forEach((assignment: PermissionsAssignment) => {
                const key = (assignment.address === PUBLIC_PERMISSION_ADDRESS) ? PUBLIC_PERMISSION_ID : assignment.address
                result[key] = assignment.permissions
            })
        return result
    }

    /* eslint-disable padding-line-between-statements */
    private static getPermissionsAssignment(permissionResult: PermissionQueryResult): PermissionsAssignment {
        return {
            address: permissionResult.userAddress,
            permissions: StreamRegistry.convertChainPermissionsToStreamPermissions(permissionResult)
        }
    }

    /** @internal */
    static convertChainPermissionsToStreamPermissions(chainPermissions: ChainPermissions): StreamPermission[] {
        const now = Date.now()
        const permissions = []
        if (chainPermissions.canEdit) {
            permissions.push(StreamPermission.EDIT)
        }
        if (chainPermissions.canDelete) {
            permissions.push(StreamPermission.DELETE)
        }
        if (BigNumber.from(chainPermissions.publishExpiration).gt(now)) {
            permissions.push(StreamPermission.PUBLISH)
        }
        if (BigNumber.from(chainPermissions.subscribeExpiration).gt(now)) {
            permissions.push(StreamPermission.SUBSCRIBE)
        }
        if (chainPermissions.canGrant) {
            permissions.push(StreamPermission.GRANT)
        }
        return permissions
    }

    searchStreams(term: string | undefined, permissionFilter: SearchStreamsPermissionFilter | undefined): AsyncGenerator<Stream> {
        this.debug('Search streams term=%s permissions=%j', term, permissionFilter)
        return map(
            fetchSearchStreamsResultFromTheGraph(term, permissionFilter, this.graphQLClient),
            (item: SearchStreamsResultItem) => this.parseStream(toStreamID(item.stream.id), item.stream.metadata)
        )
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

    async isStreamPublisher(streamIdOrPath: string, userAddress: EthereumAddress): Promise<boolean> {
        const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
        this.debug('Checking isStreamPublisher for stream %s for address %s', streamId, userAddress)
        try {
            return await this.streamRegistryContractReadonly.hasPermission(streamId, userAddress,
                StreamRegistry.streamPermissionToSolidityType(StreamPermission.PUBLISH))
        } catch {
            throw new NotFoundError('stream not found: id: ' + streamId)
        }
    }

    async isStreamSubscriber(streamIdOrPath: string, userAddress: EthereumAddress): Promise<boolean> {
        const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
        this.debug('Checking isStreamSubscriber for stream %s for address %s', streamId, userAddress)
        try {
            return await this.streamRegistryContractReadonly.hasPermission(streamId, userAddress,
                StreamRegistry.streamPermissionToSolidityType(StreamPermission.SUBSCRIBE))
        } catch {
            throw new NotFoundError('stream not found: id: ' + streamId)
        }
    }

    private static buildGetStreamQuery(streamId: StreamID): string {
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
}

