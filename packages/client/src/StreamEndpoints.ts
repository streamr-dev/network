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
    SIDLike,
    SPID,
    EthereumAddress
} from 'streamr-client-protocol'

import { instanceId } from './utils'
import { Context } from './utils/Context'

import { Stream } from './Stream'
import { ErrorCode, NotFoundError } from './authFetch'
import { BrubeckContainer } from './Container'
import { Config, ConnectionConfig } from './Config'
import { Rest } from './Rest'
import StreamrEthereum from './Ethereum'
import { StreamRegistry } from './StreamRegistry'
import { NodeRegistry } from './NodeRegistry'
import { StreamIDBuilder } from './StreamIDBuilder'

export interface SearchStreamsOptions {
    order?: 'asc'|'desc'
    max?: number
    offset?: number
}

export interface StreamValidationInfo {
    id: string
    partitions: number
    requireSignedData: boolean
    requireEncryptedData: boolean
    storageDays: number
}

export interface StreamMessageAsObject { // TODO this could be in streamr-protocol
    streamId: string
    streamPartition: number
    timestamp: number
    sequenceNumber: number
    publisherId: string
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
        @inject(Config.Connection) private readonly options: ConnectionConfig,
        @inject(delay(() => Rest)) private readonly rest: Rest,
        @inject(NodeRegistry) private readonly nodeRegistry: NodeRegistry,
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

    async getStreamLast(streamObjectOrId: Stream|SIDLike|string, count = 1): Promise<StreamMessageAsObject> {
        const { streamId, streamPartition = 0 } = SPID.parse(streamObjectOrId)
        this.debug('getStreamLast %o', {
            streamId,
            streamPartition,
            count,
        })
        const stream = await this.streamRegistry.getStream(streamId)
        const nodeAddresses = await stream.getStorageNodes()
        if (nodeAddresses.length === 0) {
            throw new NotFoundError('Stream: id=' + streamId + ' has no storage nodes!')
        }
        const chosenNode = nodeAddresses[Math.floor(Math.random() * nodeAddresses.length)]
        const nodeUrl = await this.nodeRegistry.getStorageNodeUrl(chosenNode)
        const normalizedStreamId = await this.streamIdBuilder.toStreamID(streamId)
        const json = await this.rest.get<StreamMessageAsObject>([
            'streams', normalizedStreamId, 'data', 'partitions', streamPartition, 'last',
        ], {
            query: { count },
            useSession: false,
            restUrl: nodeUrl
        })
        return json
    }

    async getStreamPartsByStorageNode(nodeAddress: EthereumAddress): Promise<SPID[]> {
        const streams = await this.nodeRegistry.getStoredStreamsOf(nodeAddress)

        const result: SPID[] = []
        streams.forEach((stream: Stream) => {
            for (let i = 0; i < stream.partitions; i++) {
                result.push(new SPID(stream.id, i))
            }
        })
        return result
    }

    async publishHttp(nodeUrl: string, streamObjectOrId: Stream|string, data: any, requestOptions: any = {}, keepAlive: boolean = true) {
        let streamId
        if (streamObjectOrId instanceof Stream) {
            streamId = streamObjectOrId.id
        } else {
            streamId = streamObjectOrId
        }
        this.debug('publishHttp %o', {
            streamId, data,
        })

        // Send data to the stream
        const normalizedStreamId = await this.streamIdBuilder.toStreamID(streamId)
        await this.rest.post(
            ['streams', normalizedStreamId, 'data'],
            data,
            {
                ...requestOptions,
                agent: keepAlive ? getKeepAliveAgentForUrl(nodeUrl) : undefined,
                restUrl: nodeUrl
            }
        )
    }
}
