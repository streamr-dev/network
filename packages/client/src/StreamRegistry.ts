import { StreamPermission, Stream, StreamProperties, StreamOperation, Config,
    EthereumAddress, StreamListQuery, NotFoundError, StrictStreamrClientConfig, ValidationError } from './index'

import { Contract } from '@ethersproject/contracts'
// import { Wallet } from '@ethersproject/wallet'
import { Signer } from '@ethersproject/abstract-signer'
import debug from 'debug'
import type { StreamRegistry as StreamRegistryContract } from './ethereumArtifacts/StreamRegistry.d'
import StreamRegistryArtifact from './ethereumArtifacts/StreamRegistryAbi.json'
// import { Provider } from '@ethersproject/abstract-provider'
import fetch from 'node-fetch'
// import { BigNumber, ethers } from 'ethers'
import { AddressZero } from '@ethersproject/constants'
import { BigNumber } from '@ethersproject/bignumber'
import { Provider } from '@ethersproject/providers'
import { scoped, Lifecycle, inject, DependencyContainer } from 'tsyringe'
import { BrubeckContainer } from './Container'
import Ethereum from './Ethereum'
import { instanceId } from './utils'
import { Context } from './utils/Context'

// const { ValidationError } = Errors

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

    async getPermissionsForUser(streamId: string, userAddress?: EthereumAddress): Promise<StreamPermission> {
        log('Getting permissions for stream %s for user %s', streamId, userAddress)
        const permissions = await this.streamRegistryContractReadonly.getPermissionsForUser(streamId, userAddress || AddressZero)
        return {
            streamId,
            userAddress: userAddress || AddressZero,
            edit: permissions?.edit || false,
            canDelete: permissions?.canDelete || false,
            publishExpiration: permissions?.publishExpiration || BigNumber.from(0),
            subscribeExpiration: permissions?.subscribeExpiration || BigNumber.from(0),
            share: permissions?.share || false
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

    async createStream(props?: Partial<StreamProperties> & { id: string }): Promise<Stream> {
        log('createStream %o', props)
        return this._createOrUpdateStream(this.streamRegistryContract!.createStream, props)
    }

    async updateStream(props?: Partial<StreamProperties> & { id: string }): Promise<Stream> {
        log('updateStream %o', props)
        return this._createOrUpdateStream(this.streamRegistryContract!.updateStreamMetadata, props)
    }

    async _createOrUpdateStream(contractFunction: Function, props?: Partial<StreamProperties> & { id: string }): Promise<Stream> {
        log('updateStream %o', props)

        let properties = props
        await this.connectToStreamRegistryContract()
        const userAddress: string = (await this.ethereum.getAddress()).toLowerCase()
        log('creating/registering stream onchain')
        // const a = this.ethereum.getAddress()
        const propsJsonStr : string = JSON.stringify(properties)
        let path = '/'
        if (properties && properties.id && properties.id.includes('/')) {
            path = properties.id.slice(properties.id.indexOf('/'), properties.id.length)
        }

        if (properties && properties.id && !properties.id.startsWith('/') && !properties.id.startsWith(userAddress)) {
            throw new ValidationError('Validation')
            // TODO add check for ENS??
        }
        const id = userAddress + path
        const tx = await contractFunction(id, propsJsonStr)
        await tx.wait()
        properties = {
            ...properties,
            id
        }
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

    async revokePublicPermission(streamId: string, operation: StreamOperation) {
        log('Revoking PUBLIC Permission %o on stream %s', operation, streamId)
        await this.connectToStreamRegistryContract()
        const tx = await this.streamRegistryContract!.revokePublicPermission(streamId,
            StreamRegistry.streamOperationToSolidityType(operation))
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
        const response = await this.sendStreamQuery(StreamRegistry.buildGetSingleStreamQuery(streamId)) as { stream: StreamPermissionsQueryResult }
        if (!response.stream) { throw new NotFoundError('Stream not found: id=' + streamId) }
        const { id, metadata } = response.stream
        return this.parseStream(id, metadata)
    }

    async getAllStreams(): Promise<Stream[]> {
        log('Getting all streams from thegraph')
        const response = await this.sendStreamQuery(StreamRegistry.buildGetAllStreamsQuery()) as AllStreamsQueryResult
        return response.streams.map(({ id, metadata }) => this.parseStream(id, metadata))
    }

    async getAllPermissionsForStream(streamid: string): Promise<StreamPermission[]> {
        log('Getting all permissions for stream %s', streamid)
        const response = await this.sendStreamQuery(StreamRegistry.buildGetSingleStreamQuery(streamid)) as SingleStreamQueryResult
        if (!response.stream) {
            throw new NotFoundError('stream not found: id: ' + streamid)
        }
        return response.stream.permissions.map(({ id, ...permissionobj }) => ({ ...permissionobj, streamId: id }))
    }

    async listStreams(filter: StreamListQuery = {}): Promise<Stream[]> {
        log('Getting all streams from thegraph that match filter %o', filter)
        const response = await this.sendStreamQuery(StreamRegistry.buildGetFilteredStreamListQuery(filter)) as FilteredStreamListQueryResult
        return response.streams.map((streamobj) => this.parseStream(streamobj.id, streamobj.metadata))
    }

    async getStreamPublishers(streamId: string): Promise<EthereumAddress[]> {
        log('Getting stream publishers for stream id %s', streamId)
        const response = await this.sendStreamQuery(StreamRegistry.buildGetStreamPublishersQuery(streamId)) as SingleStreamQueryResult
        if (!response.stream) {
            throw new NotFoundError('stream not found: id: ' + streamId)
        }
        return response.stream.permissions.map((permission) => permission.userAddress)
    }

    async isStreamPublisher(streamId: string, userAddress: EthereumAddress): Promise<boolean> {
        log('Checking isStreamPublisher for stream %s for address %s', streamId, userAddress)
        const response = await this.sendStreamQuery(StreamRegistry.buildIsPublisherQuery(streamId, userAddress)) as SingleStreamQueryResult
        if (!response.stream) {
            throw new NotFoundError('stream not found: id: ' + streamId)
        }
        return response.stream.permissions?.length > 0
    }

    async getStreamSubscribers(streamId: string): Promise<EthereumAddress[]> {
        log('Getting stream subscribers for stream id %s', streamId)
        const response = await this.sendStreamQuery(StreamRegistry.buildGetStreamSubscribersQuery(streamId)) as SingleStreamQueryResult
        if (!response.stream) {
            throw new NotFoundError('stream not found: id: ' + streamId)
        }
        return response.stream.permissions.map((permission) => permission.userAddress)
    }

    async isStreamSubscriber(streamId: string, userAddress: EthereumAddress): Promise<boolean> {
        log('Checking isStreamSubscriber for stream %s for address %s', streamId, userAddress)
        const response = await this.sendStreamQuery(StreamRegistry.buildIsSubscriberQuery(streamId, userAddress)) as SingleStreamQueryResult
        if (!response.stream) {
            throw new NotFoundError('stream not found: id: ' + streamId)
        }
        return response.stream.permissions?.length > 0
    }

    // --------------------------------------------------------------------------------------------
    // GraphQL query builders
    // --------------------------------------------------------------------------------------------

    // graphql over fetch:
    // https://stackoverflow.com/questions/44610310/node-fetch-post-request-using-graphql-query

    private static buildGetAllStreamsQuery(): string {
        //    id: "0x4178babe9e5148c6d5fd431cd72884b07ad855a0/"}) {
        const query = `{
            streams {
                 id,
                 metadata
            }
        }`
        return JSON.stringify({ query })
    }

    private static buildGetSingleStreamQuery(streamid: string): string {
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

    private static buildGetStreamPublishersQuery(streamId: string): string {
        const query = `{
            stream (id: "${streamId}") {
                permissions (where: {publishExpiration_gt: "${Date.now()}"}) {
                    userAddress,
                }
            }
        }`
        return JSON.stringify({ query })
    }

    private static buildIsPublisherQuery(streamId: string, userAddess: EthereumAddress): string {
        const query = `{
            stream (id: "${streamId}") {
                permissions (where: {userAddress: "${userAddess}", publishExpiration_gt: "${Date.now()}"}) {
                    id,
                }
            }
        }`
        return JSON.stringify({ query })
    }

    private static buildGetStreamSubscribersQuery(streamId: string): string {
        const query = `{
            stream (id: "${streamId}") {
                permissions (where: {subscribeExpiration_gt: "${Date.now()}"}) {
                    userAddress,
                }
            }
        }`
        return JSON.stringify({ query })
    }

    private static buildIsSubscriberQuery(streamId: string, userAddess: EthereumAddress): string {
        const query = `{
            stream (id: "${streamId}") {
                permissions (where: {userAddress: "${userAddess}", subscribeExpiration_gt: "${Date.now()}"}) {
                    id
                }
            }
        }`
        return JSON.stringify({ query })
    }
}

