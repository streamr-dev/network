import { Contract } from '@ethersproject/contracts'
import { Signer } from '@ethersproject/abstract-signer'
import type { StreamRegistry as StreamRegistryContract } from './ethereumArtifacts/StreamRegistry.d'
import StreamRegistryArtifact from './ethereumArtifacts/StreamRegistryAbi.json'
import fetch from 'node-fetch'
import { BigNumber } from '@ethersproject/bignumber'
import { Provider } from '@ethersproject/providers'
import { scoped, Lifecycle, inject, DependencyContainer } from 'tsyringe'
import { BrubeckContainer } from './Container'
import Ethereum from './Ethereum'
import { instanceId } from './utils'
import { Context } from './utils/Context'
import { Config, StrictStreamrClientConfig } from './Config'
import { Stream, StreamPermission, StreamPermissions, StreamProperties } from './Stream'
import { NotFoundError } from './authFetch'
import { SearchStreamsOptions } from './StreamEndpoints'
import {
    SIDLike,
    SPID,
    StreamID,
    EthereumAddress,
    StreamIDUtils, toStreamID,
} from 'streamr-client-protocol'
import { AddressZero, MaxInt256 } from '@ethersproject/constants'
import { StreamIDBuilder } from './StreamIDBuilder'

export type PermissionQueryResult = {
    id: string
    userAddress: string
} & ChainPermissions

export type ChainPermissions = {
    canEdit: boolean
    canDelete: boolean
    publishExpiration: BigNumber
    subscribeExpiration: BigNumber
    canGrant: boolean
}

export type StreamPermissionsQueryResult = {
    id: string
    metadata: string
    permissions: PermissionQueryResult[]
}

export type StreamQueryResult = {
    id: string,
    metadata: string
}

export type AllStreamsQueryResult = {
    streams: StreamQueryResult[]
}

export type FilteredStreamListQueryResult = {
    streams: StreamPermissionsQueryResult[]
}

export type SingleStreamQueryResult = {
    stream: StreamPermissionsQueryResult | null
}

interface PermissionsAssignment {
    address: EthereumAddress,
    permissions: StreamPermission[]
}

export type PublicPermissionId = 'public'
const PUBLIC_PERMISSION_ID: PublicPermissionId = 'public'
const PUBLIC_PERMISSION_ADDRESS = '0x0000000000000000000000000000000000000000'

@scoped(Lifecycle.ContainerScoped)
export class StreamRegistry implements Context {
    id
    debug
    streamRegistryContract?: StreamRegistryContract
    streamRegistryContractReadonly: StreamRegistryContract
    chainProvider: Provider
    chainSigner?: Signer

    constructor(
        context: Context,
        @inject(Ethereum) private ethereum: Ethereum,
        @inject(StreamIDBuilder) private streamIdBuilder: StreamIDBuilder,
        @inject(BrubeckContainer) private container: DependencyContainer,
        @inject(Config.Root) private config: StrictStreamrClientConfig
    ) {
        this.id = instanceId(this)
        this.debug = context.debug.extend(this.id)
        this.debug('create')
        this.chainProvider = this.ethereum.getStreamRegistryChainProvider()
        this.streamRegistryContractReadonly = new Contract(this.config.streamRegistryChainAddress,
            StreamRegistryArtifact, this.chainProvider) as StreamRegistryContract
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

    async createStream(props: StreamProperties | SIDLike): Promise<Stream> {
        this.debug('createStream %o', props)
        let completeProps: StreamProperties
        if ((props as StreamProperties).id) {
            completeProps = props as StreamProperties
        } else {
            const sid = SPID.parse(props as SIDLike)
            completeProps = { id: sid.streamId, ...sid }
        }
        completeProps.partitions ??= 1

        const streamId = await this.streamIdBuilder.toStreamID(completeProps.id)
        await this.ensureStreamIdInNamespaceOfAuthenticatedUser(streamId)

        const normalizedProperties = {
            ...completeProps,
            id: streamId
        }
        await this.connectToStreamRegistryContract()
        const tx = await this.streamRegistryContract!.createStream(
            StreamIDUtils.getPath(streamId)!,
            JSON.stringify(normalizedProperties)
        )
        await tx.wait()
        return new Stream(normalizedProperties, this.container)
    }

    private async ensureStreamIdInNamespaceOfAuthenticatedUser(streamId: StreamID): Promise<void> {
        const address = StreamIDUtils.getAddress(streamId)
        const userAddress = await this.ethereum.getAddress()
        if (address === undefined || address.toLowerCase() !== userAddress.toLowerCase()) { // TODO: add check for ENS??
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
        const tx = await this.streamRegistryContract!.updateStreamMetadata(streamId, JSON.stringify(normalizedProperties))
        await tx.wait()
        return new Stream(normalizedProperties, this.container)
    }

    async grantPermission(streamIdOrPath: string, permission: StreamPermission, receivingUser: string) {
        const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
        this.debug('Granting Permission %o for user %s on stream %s', permission, receivingUser, streamId)
        await this.connectToStreamRegistryContract()
        const tx = await this.streamRegistryContract!.grantPermission(streamId, receivingUser,
            StreamRegistry.streamPermissionToSolidityType(permission))
        await tx.wait()
    }

    async grantPublicPermission(streamIdOrPath: string, permission: StreamPermission) {
        const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
        this.debug('Granting PUBLIC Permission %o on stream %s', permission, streamId)
        await this.connectToStreamRegistryContract()
        const tx = await this.streamRegistryContract!.grantPublicPermission(streamId,
            StreamRegistry.streamPermissionToSolidityType(permission))
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
        const publishExpiration = publish ? MaxInt256 : 0
        const subscribeExpiration = subscribe ? MaxInt256 : 0
        const tx = await this.streamRegistryContract!.setPermissionsForUser(streamId, receivingUser,
            edit, deletePermission, publishExpiration, subscribeExpiration, share)
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
        const transformedPermission = permissions.map(StreamRegistry.convertStreamPermissionToChainPermission)
        const tx = await this.streamRegistryContract!.setPermissions(streamId, users, transformedPermission)
        await tx.wait()
    }

    async revokePermission(streamIdOrPath: string, permission: StreamPermission, receivingUser: string) {
        const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
        this.debug('Revoking permission %o for user %s on stream %s', permission, receivingUser, streamId)
        await this.connectToStreamRegistryContract()
        const tx = await this.streamRegistryContract!.revokePermission(streamId, receivingUser,
            StreamRegistry.streamPermissionToSolidityType(permission))
        await tx.wait()
    }

    async revokeAllMyPermission(streamIdOrPath: string) {
        const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
        this.debug('Revoking all permissions user %s on stream %s', await this.ethereum.getAddress(), streamId)
        await this.connectToStreamRegistryContract()
        const tx = await this.streamRegistryContract!.revokeAllPermissionsForUser(streamId, await this.ethereum.getAddress())
        await tx.wait()
    }

    async revokeAllUserPermission(streamIdOrPath: string, userId: EthereumAddress) {
        const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
        this.debug('Revoking all permissions user %s on stream %s', userId, streamId)
        await this.connectToStreamRegistryContract()
        const tx = await this.streamRegistryContract!.revokeAllPermissionsForUser(streamId, userId)
        await tx.wait()
    }

    async revokePublicPermission(streamIdOrPath: string, permission: StreamPermission) {
        const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
        this.debug('Revoking PUBLIC Permission %o on stream %s', permission, streamId)
        await this.connectToStreamRegistryContract()
        const tx = await this.streamRegistryContract!.revokePublicPermission(streamId,
            StreamRegistry.streamPermissionToSolidityType(permission))
        await tx.wait()
    }

    async revokeAllPublicPermissions(streamIdOrPath: string) {
        const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
        this.debug('Revoking all PUBLIC Permissions stream %s', streamId)
        await this.connectToStreamRegistryContract()
        const tx = await this.streamRegistryContract!.revokeAllPermissionsForUser(streamId,
            AddressZero)
        await tx.wait()
    }

    async deleteStream(streamIdOrPath: string) {
        const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
        this.debug('Deleting stream %s', streamId)
        await this.connectToStreamRegistryContract()
        const tx = await this.streamRegistryContract!.deleteStream(streamId)
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

    private async sendStreamQuery(gqlQuery: string): Promise<Object> {
        this.debug('GraphQL query: %s', gqlQuery)
        const res = await fetch(this.config.theGraphUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                accept: '*/*',
            },
            body: gqlQuery
        })
        const resText = await res.text()
        let resJson
        try {
            resJson = JSON.parse(resText)
        } catch {
            throw new Error(`GraphQL query failed with "${resText}", check that your theGraphUrl="${this.config.theGraphUrl}" is correct`)
        }
        this.debug('GraphQL response: %o', resJson)
        if (!resJson.data) {
            if (resJson.errors && resJson.errors.length > 0) {
                throw new Error('GraphQL query failed: ' + JSON.stringify(resJson.errors.map((e: any) => e.message)))
            } else {
                throw new Error('GraphQL query failed')
            }
        }
        return resJson.data
    }

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
        const response = await this.sendStreamQuery(
            StreamRegistry.buildGetStreamWithPermissionsQuery(streamId)
        ) as { stream: StreamPermissionsQueryResult }
        if (!response.stream) {
            throw new NotFoundError('Stream not found: id=' + streamId)
        }
        return this.parseStream(streamId, response.stream.metadata)
    }

    async getAllStreams(pagesize: number = 1000): Promise<Stream[]> {
        this.debug('Getting all streams from thegraph')
        let results: Stream[] = []
        let lastResultSize = pagesize
        let lastID: string | undefined
        do {
            // eslint-disable-next-line no-await-in-loop
            const queryResponse = await this.sendStreamQuery(StreamRegistry.buildGetAllStreamsQuery(pagesize, lastID)) as AllStreamsQueryResult
            if (queryResponse.streams.length === 0) {
                break
            }
            const resStreams: Stream[] = []
            queryResponse.streams.forEach(({ id, metadata }) => {
                try {
                    // toStreamID isn't strictly needed here since we are iterating over a result set from the Graph
                    // (we could just cast). _If_ this ever throws, one of our core assumptions is wrong.
                    const stream = this.parseStream(toStreamID(id), metadata)
                    resStreams.push(stream)
                } catch (err) {
                    this.debug(`Skipping stream ${id} cannot parse metadata: ${metadata}`)
                }
            })
            results = results.concat(resStreams)
            lastResultSize = queryResponse.streams.length
            lastID = queryResponse.streams[queryResponse.streams.length - 1].id
        } while (lastResultSize === pagesize)
        return results
    }

    /**
     * The user addresses are in lowercase format
     */
    async getAllPermissionsForStream(streamIdOrPath: string): Promise<Record<EthereumAddress|PublicPermissionId, StreamPermission[]>> {
        const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
        this.debug('Getting all permissions for stream %s', streamId)
        const response = await this.sendStreamQuery(StreamRegistry.buildGetStreamWithPermissionsQuery(streamId)) as SingleStreamQueryResult
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
        const now = Date.now()
        const permissions = []
        if (permissionResult.canEdit) {
            permissions.push(StreamPermission.EDIT)
        }
        if (permissionResult.canDelete) {
            permissions.push(StreamPermission.DELETE)
        }
        if (BigNumber.from(permissionResult.publishExpiration).gt(now)) {
            permissions.push(StreamPermission.PUBLISH)
        }
        if (BigNumber.from(permissionResult.subscribeExpiration).gt(now)) {
            permissions.push(StreamPermission.SUBSCRIBE)
        }
        if (permissionResult.canGrant) {
            permissions.push(StreamPermission.GRANT)
        }
        return {
            address: permissionResult.userAddress,
            permissions
        }
    }

    async searchStreams(term: string, opts: SearchStreamsOptions = {}): Promise<Stream[]> {
        this.debug('Getting all streams from thegraph that match filter %s %o', term, opts)
        const response = await this.sendStreamQuery(StreamRegistry.buildSearchStreamsQuery(term, opts)) as FilteredStreamListQueryResult
        return response.streams.map((s) => this.parseStream(toStreamID(s.id), s.metadata))
    }

    async getStreamPublishers(streamIdOrPath: string, pagesize: number = 1000) {
        const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
        return this.getStreamPublishersOrSubscribersList(streamId, pagesize, StreamRegistry
            .buildGetStreamPublishersQuery)
    }
    async getStreamSubscribers(streamIdOrPath: string, pagesize: number = 1000) {
        const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
        return this.getStreamPublishersOrSubscribersList(streamId, pagesize, StreamRegistry
            .buildGetStreamSubscribersQuery)
    }

    async getStreamPublishersOrSubscribersList(streamIdOrPath: string, pagesize: number = 1000, queryMethod: Function): Promise<EthereumAddress[]> {
        const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
        this.debug('Getting stream publishers for stream id %s', streamId)
        let results: EthereumAddress[] = []
        let lastResultSize = pagesize
        let lastID: string | undefined
        do {
            // eslint-disable-next-line no-await-in-loop
            const response = await this.sendStreamQuery(queryMethod(streamId, pagesize, lastID)) as SingleStreamQueryResult
            if (!response.stream) {
                throw new NotFoundError('stream not found: id: ' + streamId)
            }
            const resStreams = response.stream.permissions.map((permission) => permission.userAddress)
            if (resStreams.length === 0) {
                break
            }
            results = results.concat(resStreams)
            lastResultSize = resStreams.length
            lastID = response.stream.permissions[resStreams.length - 1].id
        } while (lastResultSize === pagesize)
        return results
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

    // --------------------------------------------------------------------------------------------
    // GraphQL query builders
    // --------------------------------------------------------------------------------------------

    // graphql over fetch:
    // https://stackoverflow.com/questions/44610310/node-fetch-post-request-using-graphql-query

    private static buildGetAllStreamsQuery(pagesize: number, lastId?: string): string {
        const startIDFilter = lastId ? `, where: { id_gt: "${lastId}"  }` : ''
        const query = `{
            streams (first:${pagesize}${startIDFilter}) {
                 id,
                 metadata
            }
        }`
        return JSON.stringify({ query })
    }

    private static buildGetStreamWithPermissionsQuery(streamId: StreamID): string {
        const query = `{
            stream (id: "${streamId}") {
                id,
                metadata,
                permissions {
                    id,
                    userAddress,
                    canEdit,
                    canDelete,
                    publishExpiration,
                    subscribeExpiration,
                    canGrant,
                }
            }
        }`
        return JSON.stringify({ query })
    }

    private static buildSearchStreamsQuery(term: string, opts: SearchStreamsOptions): string {
        // the metadata field contains all stream properties (including the id property),
        // so there is no need search over other fields in the where clause
        const query = `
            query ($term: String!, $first: Int, $skip: Int, $orderBy: String, $orderDirection: String) {
                streams (
                    where: {
                        metadata_contains: $term
                    }
                    first: $first
                    skip: $skip
                    orderBy: $orderBy
                    orderDirection: $orderDirection
                ) {
                    id,
                    metadata
                }
            }`
        const variables = {
            term,
            first: opts.max,
            skip: opts.offset,
            orderBy: (opts.order !== undefined) ? 'id' : undefined,
            orderDirection: opts.order,
        }
        return JSON.stringify({ query, variables })
    }

    private static buildGetStreamPublishersQuery(streamId: StreamID, pagesize: number, lastId?: string): string {
        const startIDFilter = lastId ? `, id_gt: "${lastId}"` : ''
        const query = `{
            stream (id: "${streamId}") {
                permissions (first:${pagesize}, where: {publishExpiration_gt: "${Date.now()}"${startIDFilter}}) {
                    id, userAddress,
                }
            }
        }`
        return JSON.stringify({ query })
    }

    private static buildGetStreamSubscribersQuery(streamId: StreamID, pagesize: number, lastId?: string): string {
        const startIDFilter = lastId ? `, id_gt: "${lastId}"` : ''
        const query = `{
            stream (id: "${streamId}") {
                permissions (first:${pagesize}, where: {subscribeExpiration_gt: "${Date.now()}"${startIDFilter}}) {
                    userAddress,
                }
            }
        }`
        return JSON.stringify({ query })
    }
}

