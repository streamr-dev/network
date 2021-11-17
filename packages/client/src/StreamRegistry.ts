import { Contract } from '@ethersproject/contracts'
// import { Wallet } from '@ethersproject/wallet'
import { Signer } from '@ethersproject/abstract-signer'
import debug from 'debug'
import type { StreamRegistry as StreamRegistryContract } from './ethereumArtifacts/StreamRegistry.d'
import StreamRegistryArtifact from './ethereumArtifacts/StreamRegistryAbi.json'
// import { Provider } from '@ethersproject/abstract-provider'
import fetch from 'node-fetch'
// import { BigNumber, ethers } from 'ethers'
import { BigNumber } from '@ethersproject/bignumber'
import { Provider } from '@ethersproject/providers'
import { scoped, Lifecycle, inject, DependencyContainer } from 'tsyringe'
import { BrubeckContainer } from './Container'
import Ethereum from './Ethereum'
import { instanceId } from './utils'
import { Context } from './utils/Context'
import { Config, StrictStreamrClientConfig } from './Config'
import { Stream, StreamOperation, StreamPermissions, StreamProperties } from './Stream'
import { NotFoundError, ValidationError } from './authFetch'
import { EthereumAddress } from './types'
import { StreamListQuery } from './StreamEndpoints'
import { SIDLike, SPID } from 'streamr-client-protocol'
import { AddressZero, MaxInt256 } from '@ethersproject/constants'

// const { ValidationError } = Errors
const KEY_EXCHANGE_STREAM_PREFIX = 'SYSTEM/keyexchange'

// const fetch = require('node-fetch');
const log = debug('StreamrClient::StreamRegistry')

export type PermissionQueryResult = {
    id: string
    userAddress: string
    edit: boolean
    canDelete: boolean
    publishExpiration: BigNumber
    subscribeExpiration: BigNumber
    share: boolean
}

export type StreamPermissionsQueryResult = {
    id: string
    metadata: string
    permissions: [PermissionQueryResult]
}

export type StreamQueryResult = {
    id: string,
    metadata: string
}

export type AllStreamsQueryResult = {
    streams: [StreamQueryResult]
}

export type FilteredStreamListQueryResult = {
    streams: [StreamPermissionsQueryResult]
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
        @inject(BrubeckContainer) private container: DependencyContainer,
        @inject(Config.Root) private config: StrictStreamrClientConfig
    ) {
        log('creating StreamRegistryOnchain')
        this.id = instanceId(this)
        this.debug = context.debug.extend(this.id)
        this.sideChainProvider = this.ethereum.getSidechainProvider()
        this.streamRegistryContractReadonly = new Contract(this.config.streamRegistrySidechainAddress,
            StreamRegistryArtifact, this.sideChainProvider) as StreamRegistryContract
    }

    parseStream(id: string, propsString: string): Stream {
        const parsedProps: StreamProperties = Stream.parseStreamPropsFromJson(propsString)
        return new Stream({ ...parsedProps, id }, this.container)
    }

    // --------------------------------------------------------------------------------------------
    // Read from the StreamRegistry contract
    // --------------------------------------------------------------------------------------------

    async getStreamFromContract(id: string): Promise<Stream> {
        this.debug('getStream %s', id)
        try {
            const propertiesString = await this.streamRegistryContractReadonly.getStreamMetadata(id) || '{}'
            return this.parseStream(id, propertiesString)
        } catch (error) {
            log(error)
        }
        throw new NotFoundError('Stream: id=' + id)
    }

    async hasPermission(streamId: string, userAddess: EthereumAddress, operation: StreamOperation) {
        return this.streamRegistryContractReadonly.hasPermission(streamId, userAddess,
            StreamRegistry.streamOperationToSolidityType(operation))
    }

    async hasPublicPermission(streamId: string, operation: StreamOperation) {
        return this.streamRegistryContractReadonly.hasPublicPermission(streamId,
            StreamRegistry.streamOperationToSolidityType(operation))
    }

    async hasDirectPermission(streamId: string, userAddess: EthereumAddress, operation: StreamOperation) {
        return this.streamRegistryContractReadonly.hasDirectPermission(streamId, userAddess,
            StreamRegistry.streamOperationToSolidityType(operation))
    }

    async getPermissionsForUser(streamId: string, userAddress?: EthereumAddress): Promise<StreamPermissions> {
        await this.connectToStreamRegistryContract()
        log('Getting permissions for stream %s for user %s', streamId, userAddress)
        const permissions = await this.streamRegistryContract!.getPermissionsForUser(streamId, userAddress || AddressZero)
        return {
            edit: permissions.edit,
            canDelete: permissions.canDelete,
            publishExpiration: BigNumber.from(permissions.publishExpiration).gt(Date.now()),
            subscribeExpiration: BigNumber.from(permissions.subscribeExpiration).gt(Date.now()),
            share: permissions.share
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
        log('createStream %o', props)
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
        log('updateStream %o', props)
        await this.connectToStreamRegistryContract()
        return this._createOrUpdateStream(async (path: string, metadata: string) => {
            const userAddress: string = (await this.ethereum.getAddress()).toLowerCase()
            const id = userAddress + path
            return this.streamRegistryContract!.updateStreamMetadata(id, metadata)
        }, props)
    }

    async _createOrUpdateStream(contractFunction: Function, props: StreamProperties): Promise<Stream> {
        log('updateStream %o', props)

        const properties = props
        const userAddress: string = (await this.ethereum.getAddress()).toLowerCase()
        log('creating/registering stream onchain')
        // const a = this.ethereum.getAddress()
        let path = '/'
        if (properties && properties.id && properties.id.includes('/')) {
            path = properties.id.slice(properties.id.indexOf('/'), properties.id.length)
        }

        if (properties && properties.id && !properties.id.startsWith('/') && !properties.id.startsWith(userAddress)) {
            throw new ValidationError('Validation')
            // TODO add check for ENS??
        }
        const id = userAddress + path
        properties.id = id
        const propsJsonStr : string = JSON.stringify(properties)
        const tx = await contractFunction(path, propsJsonStr)
        await tx.wait()
        return new Stream(properties, this.container)
    }

    async grantPermission(streamId: string, operation: StreamOperation, recievingUser: string) {
        log('Granting Permission %o for user %s on stream %s', operation, recievingUser, streamId)
        await this.connectToStreamRegistryContract()
        const tx = await this.streamRegistryContract!.grantPermission(streamId, recievingUser,
            StreamRegistry.streamOperationToSolidityType(operation))
        await tx.wait()
    }

    async grantPublicPermission(streamId: string, operation: StreamOperation) {
        log('Granting PUBLIC Permission %o on stream %s', operation, streamId)
        await this.connectToStreamRegistryContract()
        const tx = await this.streamRegistryContract!.grantPublicPermission(streamId,
            StreamRegistry.streamOperationToSolidityType(operation))
        await tx.wait()
    }

    async setPermissions(streamId: string, recievingUser: string, edit: boolean, deletePermission: boolean,
        publish: boolean, subscribe: boolean, share: boolean) {
        log(`Setting Permissions for user ${recievingUser} on stream ${streamId}:
        edit: ${edit}, delete: ${deletePermission}, publish: ${publish}, subscribe: ${subscribe}, share: ${share}`)
        await this.connectToStreamRegistryContract()
        const publishExpiration = publish ? MaxInt256 : 0
        const subscribeExpiration = subscribe ? MaxInt256 : 0
        const tx = await this.streamRegistryContract!.setPermissionsForUser(streamId, recievingUser,
            edit, deletePermission, publishExpiration, subscribeExpiration, share)
        await tx.wait()
    }

    async revokePermission(streamId: string, operation: StreamOperation, recievingUser: string) {
        log('Revoking Permission %o for user %s on stream %s', operation, recievingUser, streamId)
        await this.connectToStreamRegistryContract()
        const tx = await this.streamRegistryContract!.revokePermission(streamId, recievingUser,
            StreamRegistry.streamOperationToSolidityType(operation))
        await tx.wait()
    }

    async revokeAllMyPermission(streamId: string) {
        log('Revoking all permissions user %s on stream %s', await this.ethereum.getAddress(), streamId)
        await this.connectToStreamRegistryContract()
        const tx = await this.streamRegistryContract!.revokeAllPermissionsForUser(streamId, await this.ethereum.getAddress())
        await tx.wait()
    }
    async revokeAllUserPermission(streamId: string, userId: EthereumAddress) {
        log('Revoking all permissions user %s on stream %s', userId, streamId)
        await this.connectToStreamRegistryContract()
        const tx = await this.streamRegistryContract!.revokeAllPermissionsForUser(streamId, userId)
        await tx.wait()
    }

    async revokePublicPermission(streamId: string, operation: StreamOperation) {
        log('Revoking PUBLIC Permission %o on stream %s', operation, streamId)
        await this.connectToStreamRegistryContract()
        const tx = await this.streamRegistryContract!.revokePublicPermission(streamId,
            StreamRegistry.streamOperationToSolidityType(operation))
        await tx.wait()
    }

    async revokeAllPublicPermissions(streamId: string) {
        log('Revoking all PUBLIC Permissions stream %s', streamId)
        await this.connectToStreamRegistryContract()
        const tx = await this.streamRegistryContract!.revokeAllPermissionsForUser(streamId,
            AddressZero)
        await tx.wait()
    }

    async deleteStream(streamId: string) {
        log('Deleting stream %s', streamId)
        await this.connectToStreamRegistryContract()
        const tx = await this.streamRegistryContract!.deleteStream(streamId)
        await tx.wait()
    }

    async streamExists(streamId: string): Promise<boolean> {
        log('Checking if stream exists %s', streamId)
        this.connectToStreamRegistryContract()
        return this.streamRegistryContract!.exists(streamId)
    }

    async streamExistsOnTheGraph(streamId: string): Promise<boolean> {
        log('Checking if stream exists on theGraph %s', streamId)
        try {
            await this.getStream(streamId)
            return true
        } catch (err) {
            if (err.errorCode === 'NOT_FOUND') {
                return false
            }
            throw err
        }
    }

    private static streamOperationToSolidityType(operation: StreamOperation): BigNumber {
        switch (operation) {
            case StreamOperation.STREAM_EDIT:
                return BigNumber.from(0)
            case StreamOperation.STREAM_DELETE:
                return BigNumber.from(1)
            case StreamOperation.STREAM_PUBLISH:
                return BigNumber.from(2)
            case StreamOperation.STREAM_SUBSCRIBE:
                return BigNumber.from(3)
            case StreamOperation.STREAM_SHARE:
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
        log('GraphQL query: %s', gqlQuery)
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
        log('GraphQL response: %o', resJson)
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
        log('Getting stream %s', streamId)
        if (streamId.startsWith(KEY_EXCHANGE_STREAM_PREFIX)) {
            return new Stream({ id: streamId, partitions: 1 }, this.container)
        }
        let metadata
        try {
            metadata = await this.streamRegistryContractReadonly.getStreamMetadata(streamId)
        } catch { throw new NotFoundError('Stream not found: id=' + streamId) }
        return this.parseStream(streamId, metadata)
    }

    async getAllStreams(pagesize: number = 1000): Promise<Stream[]> {
        log('Getting all streams from thegraph')
        let results: Stream[] = []
        let lastResultSize = pagesize
        let lastID: string | undefined
        do {
            // eslint-disable-next-line no-await-in-loop
            const queryResponse = await this.sendStreamQuery(StreamRegistry.buildGetAllStreamsQuery(pagesize, lastID)) as AllStreamsQueryResult
            // const resStreams = queryResponse.streams.map(({ id, metadata }) => this.parseStream(id, metadata))
            const resStreams: Stream[] = []
            queryResponse.streams.forEach(({ id, metadata }) => {
                try {
                    const stream = this.parseStream(id, metadata)
                    resStreams.push(stream)
                } catch (err) { log(`Skipping stream ${id} cannot parse metadata: ${metadata}`) }
            })
            results = results.concat(resStreams)
            lastResultSize = queryResponse.streams.length
            lastID = queryResponse.streams[queryResponse.streams.length - 1].id
        } while (lastResultSize === pagesize)
        return results
    }

    async getAllPermissionsForStream(streamid: string): Promise<StreamPermissions[]> {
        log('Getting all permissions for stream %s', streamid)
        const response = await this.sendStreamQuery(StreamRegistry.buildGetStremWithPermissionsQuery(streamid)) as SingleStreamQueryResult
        if (!response.stream) {
            throw new NotFoundError('stream not found: id: ' + streamid)
        }
        return response.stream.permissions.map((permissionResult) => ({
            edit: permissionResult.edit,
            canDelete: permissionResult.canDelete,
            publishExpiration: BigNumber.from(permissionResult.publishExpiration).gt(Date.now()),
            subscribeExpiration: BigNumber.from(permissionResult.subscribeExpiration).gt(Date.now()),
            share: permissionResult.share
        }))
    }

    async listStreams(filter: StreamListQuery = {}): Promise<Stream[]> {
        log('Getting all streams from thegraph that match filter %o', filter)
        const response = await this.sendStreamQuery(StreamRegistry.buildGetFilteredStreamListQuery(filter)) as FilteredStreamListQueryResult
        return response.streams.map((streamobj) => this.parseStream(streamobj.id, streamobj.metadata))
    }

    async getStreamPublishers(streamId: string, pagesize: number = 1000) {
        return this.getStreamPublishersOrSubscribersList(streamId, pagesize, StreamRegistry
            .buildGetStreamPublishersQuery)
    }
    async getStreamSubscribers(streamId: string, pagesize: number = 1000) {
        return this.getStreamPublishersOrSubscribersList(streamId, pagesize, StreamRegistry
            .buildGetStreamSubscribersQuery)
    }

    async getStreamPublishersOrSubscribersList(streamId: string, pagesize: number = 1000, queryMethod: Function): Promise<EthereumAddress[]> {
        log('Getting stream publishers for stream id %s', streamId)
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
            results = results.concat(resStreams)
            lastResultSize = resStreams.length
            lastID = response.stream.permissions[resStreams.length - 1].id
        } while (lastResultSize === pagesize)
        return results
    }

    async isStreamPublisher(streamId: string, userAddress: EthereumAddress): Promise<boolean> {
        log('Checking isStreamPublisher for stream %s for address %s', streamId, userAddress)
        // const response = await this.sendStreamQuery(StreamRegistry.buildIsPublisherQuery(streamId, userAddress)) as SingleStreamQueryResult
        let response
        try {
            response = await this.streamRegistryContractReadonly.hasPermission(streamId, userAddress,
                StreamRegistry.streamOperationToSolidityType(StreamOperation.STREAM_PUBLISH))
        } catch {
            throw new NotFoundError('stream not found: id: ' + streamId)
        }
        return response
    }

    async isStreamSubscriber(streamId: string, userAddress: EthereumAddress): Promise<boolean> {
        log('Checking isStreamSubscriber for stream %s for address %s', streamId, userAddress)
        let response
        try {
            response = await this.streamRegistryContractReadonly.hasPermission(streamId, userAddress,
                StreamRegistry.streamOperationToSolidityType(StreamOperation.STREAM_SUBSCRIBE))
        } catch {
            throw new NotFoundError('stream not found: id: ' + streamId)
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

    private static buildGetStremWithPermissionsQuery(streamid: string): string {
        const query = `{
            stream (id: "${streamid}") {
                id,
                metadata,
                permissions {
                    id,
                    userAddress,
                    edit,
                    canDelete,
                    publishExpiration,
                    subscribeExpiration,
                    share,
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
                    edit,
                    canDelete,
                    publishExpiration,
                    subscribeExpiration,
                    share,
                }
            }
        }`
        return JSON.stringify({ query })
    }

    private static buildGetStreamPublishersQuery(streamId: string, pagesize: number, lastId?: string): string {
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

    private static buildGetStreamSubscribersQuery(streamId: string, pagesize: number, lastId?: string): string {
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

