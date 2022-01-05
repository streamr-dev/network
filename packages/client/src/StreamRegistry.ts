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
import { NotFoundError, ValidationError } from './authFetch'
import { StreamListQuery } from './StreamEndpoints'
import {
    SIDLike,
    SPID,
    StreamID,
    isKeyExchangeStream,
    EthereumAddress,
    getPathFromStreamID,
} from 'streamr-client-protocol'
import { AddressZero, MaxInt256 } from '@ethersproject/constants'
import { StreamIDBuilder } from './StreamIDBuilder'
import { getAddressAndPathFromStreamID, getAddressFromStreamID } from 'streamr-client-protocol/dist/src/utils/StreamID'

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
@scoped(Lifecycle.ContainerScoped)
export class StreamRegistry implements Context {
    id
    debug
    streamRegistryContract?: StreamRegistryContract
    streamRegistryContractReadonly: StreamRegistryContract
    sideChainProvider: Provider
    sideChainSigner?: Signer

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
        this.sideChainProvider = this.ethereum.getSidechainProvider()
        this.streamRegistryContractReadonly = new Contract(this.config.streamRegistrySidechainAddress,
            StreamRegistryArtifact, this.sideChainProvider) as StreamRegistryContract
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
        if (!this.sideChainSigner || !this.streamRegistryContract) {
            this.sideChainSigner = await this.ethereum.getSidechainSigner()
            this.streamRegistryContract = new Contract(this.config.streamRegistrySidechainAddress,
                StreamRegistryArtifact, this.sideChainSigner) as StreamRegistryContract
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
        await this.connectToStreamRegistryContract()
        return this._createOrUpdateStream(this.streamRegistryContract!.createStream, completeProps)
    }

    async updateStream(props: StreamProperties): Promise<Stream> {
        this.debug('updateStream %o', props)
        await this.connectToStreamRegistryContract()
        return this._createOrUpdateStream(async (path: string, metadata: string) => {
            const streamId = this.streamIdBuilder.toStreamID(path)
            const userAddress: string = (await this.ethereum.getAddress()).toLowerCase()
            const id = toStreamID(userAddress + path)
            return this.streamRegistryContract!.updateStreamMetadata(id, metadata)
        }, props)
    }

    async _createOrUpdateStream(contractFunction: Function, properties: StreamProperties): Promise<Stream> {
        this.debug('_createOrUpdateStream %o', properties)
        const streamId = await this.streamIdBuilder.toStreamID(properties.id)
        const addressAndPath = getAddressAndPathFromStreamID(streamId)
        if (addressAndPath === undefined) {
            throw new Error(`full or path-only stream ids not supported: "${properties.id}"`)
        }

        const [address, path] = addressAndPath
        const userAddress = await this.ethereum.getAddress()
        if (address.toLowerCase() !== userAddress.toLowerCase()) { // TODO: add check for ENS??
            throw new Error(`authenticated user "${userAddress}" cannot create/update stream "${streamId}"`)
        }

        const normalisedProperties = {
            ...properties,
            id: streamId
        }
        const tx = await contractFunction(path, JSON.stringify(normalisedProperties))
        await tx.wait()
        return new Stream(normalisedProperties, this.container)
    }

    async grantPermission(streamId: string, permission: StreamPermission, recievingUser: string) {
        const id = toStreamID(streamId)
        this.debug('Granting Permission %o for user %s on stream %s', permission, recievingUser, id)
        await this.connectToStreamRegistryContract()
        const tx = await this.streamRegistryContract!.grantPermission(id, recievingUser,
            StreamRegistry.streamPermissionToSolidityType(permission))
        await tx.wait()
    }

    async grantPublicPermission(streamId: string, permission: StreamPermission) {
        const id = toStreamID(streamId)
        this.debug('Granting PUBLIC Permission %o on stream %s', permission, id)
        await this.connectToStreamRegistryContract()
        const tx = await this.streamRegistryContract!.grantPublicPermission(id,
            StreamRegistry.streamPermissionToSolidityType(permission))
        await tx.wait()
    }

    async setPermissionsForUser(streamId: string, recievingUser: string, edit: boolean, deletePermission: boolean,
        publish: boolean, subscribe: boolean, share: boolean) {
        const id = toStreamID(streamId)
        this.debug(`Setting permissions for user ${recievingUser} on stream ${id}:
        edit: ${edit}, delete: ${deletePermission}, publish: ${publish}, subscribe: ${subscribe}, share: ${share}`)
        await this.connectToStreamRegistryContract()
        const publishExpiration = publish ? MaxInt256 : 0
        const subscribeExpiration = subscribe ? MaxInt256 : 0
        const tx = await this.streamRegistryContract!.setPermissionsForUser(id, recievingUser,
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

    async setPermissions(streamId: string, users: string[], permissions: StreamPermissions[]) {
        const id = toStreamID(streamId)
        this.debug(`Setting permissions for stream ${id} for ${users.length} users`)
        await this.connectToStreamRegistryContract()
        const transformedPermission = permissions.map(StreamRegistry.convertStreamPermissionToChainPermission)
        const tx = await this.streamRegistryContract!.setPermissions(id, users, transformedPermission)
        await tx.wait()
    }

    async revokePermission(streamId: string, permission: StreamPermission, recievingUser: string) {
        const id = toStreamID(streamId)
        this.debug('Revoking permission %o for user %s on stream %s', permission, recievingUser, id)
        await this.connectToStreamRegistryContract()
        const tx = await this.streamRegistryContract!.revokePermission(id, recievingUser,
            StreamRegistry.streamPermissionToSolidityType(permission))
        await tx.wait()
    }

    async revokeAllMyPermission(streamId: string) {
        const id = toStreamID(streamId)
        this.debug('Revoking all permissions user %s on stream %s', await this.ethereum.getAddress(), id)
        await this.connectToStreamRegistryContract()
        const tx = await this.streamRegistryContract!.revokeAllPermissionsForUser(id, await this.ethereum.getAddress())
        await tx.wait()
    }
    async revokeAllUserPermission(streamId: string, userId: EthereumAddress) {
        const id = toStreamID(streamId)
        this.debug('Revoking all permissions user %s on stream %s', userId, id)
        await this.connectToStreamRegistryContract()
        const tx = await this.streamRegistryContract!.revokeAllPermissionsForUser(id, userId)
        await tx.wait()
    }

    async revokePublicPermission(streamId: string, permission: StreamPermission) {
        const id = toStreamID(streamId)
        this.debug('Revoking PUBLIC Permission %o on stream %s', permission, id)
        await this.connectToStreamRegistryContract()
        const tx = await this.streamRegistryContract!.revokePublicPermission(id,
            StreamRegistry.streamPermissionToSolidityType(permission))
        await tx.wait()
    }

    async revokeAllPublicPermissions(streamId: string) {
        const id = toStreamID(streamId)
        this.debug('Revoking all PUBLIC Permissions stream %s', id)
        await this.connectToStreamRegistryContract()
        const tx = await this.streamRegistryContract!.revokeAllPermissionsForUser(id,
            AddressZero)
        await tx.wait()
    }

    async deleteStream(streamId: string) {
        const id = toStreamID(streamId)
        this.debug('Deleting stream %s', id)
        await this.connectToStreamRegistryContract()
        const tx = await this.streamRegistryContract!.deleteStream(id)
        await tx.wait()
    }

    async streamExists(streamId: string): Promise<boolean> {
        const id = toStreamID(streamId)
        this.debug('Checking if stream exists %s', id)
        this.connectToStreamRegistryContract()
        return this.streamRegistryContractReadonly!.exists(id)
    }

    async streamExistsOnTheGraph(streamId: string): Promise<boolean> {
        const id = toStreamID(streamId)
        this.debug('Checking if stream exists on theGraph %s', id)
        try {
            await this.getStreamFromGraph(id)
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

    async getStream(streamId: string): Promise<Stream> {
        const id = toStreamID(streamId)
        this.debug('Getting stream %s', id)
        if (isKeyExchangeStream(id)) {
            return new Stream({ id, partitions: 1 }, this.container)
        }
        let metadata
        try {
            metadata = await this.streamRegistryContractReadonly.getStreamMetadata(id)
        } catch { throw new NotFoundError('Stream not found: id=' + id) }
        return this.parseStream(id, metadata)
    }

    async getStreamFromGraph(streamId: string): Promise<Stream> {
        const id = toStreamID(streamId)
        this.debug('Getting stream %s from theGraph', id)
        if (isKeyExchangeStream(id)) {
            return new Stream({ id, partitions: 1 }, this.container)
        }
        const response = await this.sendStreamQuery(
            StreamRegistry.buildGetStremWithPermissionsQuery(id)
        ) as { stream: StreamPermissionsQueryResult }
        if (!response.stream) { throw new NotFoundError('Stream not found: id=' + id) }
        const { id: id2, metadata } = response.stream
        return this.parseStream(toStreamID(id2), metadata)
    }

    async getAllStreams(pagesize: number = 1000): Promise<Stream[]> {
        this.debug('Getting all streams from thegraph')
        let results: Stream[] = []
        let lastResultSize = pagesize
        let lastID: string | undefined
        do {
            // eslint-disable-next-line no-await-in-loop
            const queryResponse = await this.sendStreamQuery(StreamRegistry.buildGetAllStreamsQuery(pagesize, lastID)) as AllStreamsQueryResult
            // const resStreams = queryResponse.streams.map(({ id, metadata }) => this.parseStream(id, metadata))
            if (queryResponse.streams.length === 0) {
                break
            }
            const resStreams: Stream[] = []
            queryResponse.streams.forEach(({ id, metadata }) => {
                try {
                    const stream = this.parseStream(toStreamID(id), metadata)
                    resStreams.push(stream)
                } catch (err) { this.debug(`Skipping stream ${id} cannot parse metadata: ${metadata}`) }
            })
            results = results.concat(resStreams)
            lastResultSize = queryResponse.streams.length
            lastID = queryResponse.streams[queryResponse.streams.length - 1].id
        } while (lastResultSize === pagesize)
        return results
    }

    async getAllPermissionsForStream(streamid: string): Promise<StreamPermissions[]> {
        const id = toStreamID(streamid)
        this.debug('Getting all permissions for stream %s', id)
        const response = await this.sendStreamQuery(StreamRegistry.buildGetStremWithPermissionsQuery(id)) as SingleStreamQueryResult
        if (!response.stream) {
            throw new NotFoundError('stream not found: id: ' + id)
        }
        const now = Date.now()
        return response.stream.permissions.map((permissionResult) => ({
            canEdit: permissionResult.canEdit,
            canDelete: permissionResult.canDelete,
            canPublish: BigNumber.from(permissionResult.publishExpiration).gt(now),
            canSubscribe: BigNumber.from(permissionResult.subscribeExpiration).gt(now),
            canGrant: permissionResult.canGrant
        }))
    }

    async listStreams(filter: StreamListQuery = {}): Promise<Stream[]> {
        this.debug('Getting all streams from thegraph that match filter %o', filter)
        const response = await this.sendStreamQuery(StreamRegistry.buildGetFilteredStreamListQuery(filter)) as FilteredStreamListQueryResult
        return response.streams.map((streamobj) => this.parseStream(toStreamID(streamobj.id), streamobj.metadata))
    }

    async getStreamPublishers(streamId: string, pagesize: number = 1000) {
        const id = toStreamID(streamId)
        return this.getStreamPublishersOrSubscribersList(id, pagesize, StreamRegistry
            .buildGetStreamPublishersQuery)
    }
    async getStreamSubscribers(streamId: string, pagesize: number = 1000) {
        const id = toStreamID(streamId)
        return this.getStreamPublishersOrSubscribersList(id, pagesize, StreamRegistry
            .buildGetStreamSubscribersQuery)
    }

    async getStreamPublishersOrSubscribersList(streamId: string, pagesize: number = 1000, queryMethod: Function): Promise<EthereumAddress[]> {
        const id = toStreamID(streamId)
        this.debug('Getting stream publishers for stream id %s', id)
        let results: EthereumAddress[] = []
        let lastResultSize = pagesize
        let lastID: string | undefined
        do {
            // eslint-disable-next-line no-await-in-loop
            const response = await this.sendStreamQuery(queryMethod(id, pagesize, lastID)) as SingleStreamQueryResult
            if (!response.stream) {
                throw new NotFoundError('stream not found: id: ' + id)
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

    async isStreamPublisher(streamId: string, userAddress: EthereumAddress): Promise<boolean> {
        const id = toStreamID(streamId)
        this.debug('Checking isStreamPublisher for stream %s for address %s', id, userAddress)
        // const response = await this.sendStreamQuery(StreamRegistry.buildIsPublisherQuery(streamId, userAddress)) as SingleStreamQueryResult
        let response
        try {
            response = await this.streamRegistryContractReadonly.hasPermission(id, userAddress,
                StreamRegistry.streamPermissionToSolidityType(StreamPermission.PUBLISH))
        } catch {
            throw new NotFoundError('stream not found: id: ' + id)
        }
        return response
    }

    async isStreamSubscriber(streamId: string, userAddress: EthereumAddress): Promise<boolean> {
        const id = toStreamID(streamId)
        this.debug('Checking isStreamSubscriber for stream %s for address %s', id, userAddress)
        let response
        try {
            response = await this.streamRegistryContractReadonly.hasPermission(id, userAddress,
                StreamRegistry.streamPermissionToSolidityType(StreamPermission.SUBSCRIBE))
        } catch {
            throw new NotFoundError('stream not found: id: ' + id)
        }
        return response
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

    private static buildGetStremWithPermissionsQuery(streamid: StreamID): string {
        const query = `{
            stream (id: "${streamid}") {
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

    private static buildGetFilteredStreamListQuery(filter: StreamListQuery): string {
        const nameparam = filter.name ? `metadata_contains: "name\\\\\\":\\\\\\"${filter.name}"` : ''
        const maxparam = filter.max ? `, first: ${filter.max}` : ''
        const offsetparam = filter.offset ? `, skip: ${filter.offset}` : ''
        const orderByParam = filter.sortBy ? `, orderBy: ${filter.sortBy}` : ''
        const ascDescParama = filter.order ? `, orderDirection: ${filter.order}` : ''
        const query = `{
            streams (where: {${nameparam}}${maxparam}${offsetparam}${orderByParam}${ascDescParama}) {
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

