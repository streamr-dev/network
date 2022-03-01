/**
 * Public Stream meta APIs.
 */
import { Agent as HttpAgent } from 'http'
import { Agent as HttpsAgent } from 'https'
import { scoped, Lifecycle, inject, DependencyContainer, delay } from 'tsyringe'
import {
    ContentType,
    EncryptionType,
    SignatureType,
    StreamMessageType,
    StreamPartIDUtils
} from 'streamr-client-protocol'

import { instanceId } from './utils'
import { Context } from './utils/Context'

import { Stream } from './Stream'
import { ErrorCode, NotFoundError } from './authFetch'
import { BrubeckContainer } from './Container'
import { ConfigInjectionToken, ConnectionConfig } from './Config'
import { Rest } from './Rest'
import StreamrEthereum from './Ethereum'
import { StreamRegistry } from './StreamRegistry'
import { StorageNodeRegistry } from './StorageNodeRegistry'
import { StreamIDBuilder } from './StreamIDBuilder'
import { StreamDefinition } from './types'

export interface StreamValidationInfo {
    id: string
    partitions: number
    requireSignedData: boolean
    storageDays: number
}

export interface StreamMessageAsObject { // TODO this could be in streamr-protocol
    streamId: string
    streamPartition: number
    timestamp: number
    sequenceNumber: number
    publisherId: EthereumAddress
    msgChainId: string
    messageType: StreamMessageType
    contentType: ContentType
    encryptionType: EncryptionType
    groupKeyId: string|null
    content: any
    signatureType: SignatureType
    signature: string|null
}

const agentSettings = {
    keepAlive: true,
    keepAliveMsecs: 5000,
}

const agentByProtocol = {
    http: new HttpAgent(agentSettings),
    https: new HttpsAgent(agentSettings),
}

function getKeepAliveAgentForUrl(url: string) {
    if (url.startsWith('https')) {
        return agentByProtocol.https
    }

    if (url.startsWith('http')) {
        return agentByProtocol.http
    }

    throw new Error(`Unknown protocol in URL: ${url}`)
}

/** TODO the class should be annotated with at-internal, but adding the annotation hides the methods */
@scoped(Lifecycle.ContainerScoped)
export class StreamEndpoints implements Context {
    id
    debug

    constructor(
        context: Context,
        @inject(BrubeckContainer) private container: DependencyContainer,
        @inject(ConfigInjectionToken.Connection) private readonly options: ConnectionConfig,
        @inject(delay(() => Rest)) private readonly rest: Rest,
        @inject(delay(() => StorageNodeRegistry)) private readonly storageNodeRegistry: StorageNodeRegistry,
        @inject(StreamRegistry) private readonly streamRegistry: StreamRegistry,
        @inject(StreamIDBuilder) private readonly streamIdBuilder: StreamIDBuilder,
        private readonly ethereum: StreamrEthereum
    ) {
        this.id = instanceId(this)
        this.debug = context.debug.extend(this.id)
    }

    /**
     * @category Important
     */
    async getOrCreateStream(props: { id: string, partitions?: number }): Promise<Stream> {
        this.debug('getOrCreateStream %o', {
            props,
        })
        try {
            return await this.streamRegistry.getStream(props.id)
        } catch (err: any) {
            // If stream does not exist, attempt to create it
            if (err.errorCode === ErrorCode.NOT_FOUND) {
                const stream = await this.streamRegistry.createStream(props)
                this.debug('created stream: %s %o', props.id, stream.toObject())
                return stream
            }
            throw err
        }
    }

    async getStreamLast(streamDefinition: StreamDefinition, count = 1): Promise<StreamMessageAsObject[]> {
        const streamPartId = await this.streamIdBuilder.toStreamPartID(streamDefinition)
        const [streamId, streamPartition] = StreamPartIDUtils.getStreamIDAndPartition(streamPartId)
        this.debug('getStreamLast %o', {
            streamPartId,
            count,
        })
        const stream = await this.streamRegistry.getStream(streamId)
        const nodeAddresses = await stream.getStorageNodes()
        if (nodeAddresses.length === 0) {
            throw new NotFoundError('Stream: id=' + streamId + ' has no storage nodes!')
        }
        const chosenNode = nodeAddresses[Math.floor(Math.random() * nodeAddresses.length)]
        const nodeUrl = await this.storageNodeRegistry.getStorageNodeUrl(chosenNode)
        const normalizedStreamId = await this.streamIdBuilder.toStreamID(streamId)
        const json = await this.rest.get<StreamMessageAsObject[]>([
            'streams', normalizedStreamId, 'data', 'partitions', streamPartition, 'last',
        ], {
            query: { count },
            useSession: false,
            restUrl: nodeUrl
        })
        return json
    }

    async publishHttp(
        nodeUrl: string,
        streamIdOrPath: string,
        data: any,
        requestOptions: any = {},
        keepAlive: boolean = true
    ) {
        const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
        this.debug('publishHttp %o', {
            streamId, data,
        })

        await this.rest.post(
            ['streams', streamId, 'data'],
            data,
            {
                ...requestOptions,
                agent: keepAlive ? getKeepAliveAgentForUrl(nodeUrl) : undefined,
                restUrl: nodeUrl
            }
        )
    }
}
