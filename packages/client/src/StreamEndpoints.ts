/**
 * Public Stream meta APIs.
 */
import { Agent as HttpAgent } from 'http'
import { Agent as HttpsAgent } from 'https'
import { scoped, Lifecycle, inject, DependencyContainer, delay } from 'tsyringe'
// TODO change this import when streamr-client-protocol exports StreamMessage type or the enums types directly
import { ContentType, EncryptionType, SignatureType } from 'streamr-client-protocol/dist/src/protocol/message_layer/StreamMessage'
import { StreamMessageType, SIDLike, SPID } from 'streamr-client-protocol'

import { instanceId } from './utils'
import { Context } from './utils/Context'

import { Stream, StreamOperation } from './Stream'
import { ErrorCode, NotFoundError } from './authFetch'
import { BrubeckContainer } from './Container'
import { EthereumAddress } from './types'
import { Config, ConnectionConfig } from './Config'
import { Rest } from './Rest'
import StreamrEthereum from './Ethereum'
import { StreamRegistry } from './StreamRegistry'
import { StorageNode } from './StorageNode'
import { NodeRegistry } from './NodeRegistry'

export const createStreamId = async (streamIdOrPath: string, ownerProvider?: () => Promise<EthereumAddress|undefined>) => {
    if (streamIdOrPath === undefined) {
        throw new Error('Missing stream id')
    }

    if (!streamIdOrPath.startsWith('/')) {
        return streamIdOrPath
    }

    if (ownerProvider === undefined) {
        throw new Error(`Owner provider missing for stream id: ${streamIdOrPath}`)
    }
    const owner = await ownerProvider()
    if (owner === undefined) {
        throw new Error(`Owner missing for stream id: ${streamIdOrPath}`)
    }

    return owner.toLowerCase() + streamIdOrPath
}

export interface StreamListQuery {
    name?: string
    uiChannel?: boolean
    noConfig?: boolean
    search?: string
    sortBy?: string
    order?: 'asc'|'desc'
    max?: number
    offset?: number
    grantedAccess?: boolean
    publicAccess?: boolean
    operation?: StreamOperation
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
        private readonly ethereum: StreamrEthereum
    ) {
        this.id = instanceId(this)
        this.debug = context.debug.extend(this.id)
    }

    /**
     * @category Important
     */
    async getStream(streamId: string) {
        this.debug('getStream %s', streamId)
        return this.streamRegistry.getStream(streamId)
    }

    /**
     * @category Important
     */
    async listStreams(query: StreamListQuery = {}): Promise<Stream[]> {
        this.debug('listStreams %o', {
            query,
        })
        return this.streamRegistry.listStreams(query)
    }

    async getStreamByName(name: string) {
        this.debug('getStreamByName %o', {
            name,
        })
        const streams = await this.streamRegistry.listStreams({ name })
        return streams[0] ? streams[0] : Promise.reject(new NotFoundError('Stream: name=' + name))
    }

    /**
     * @category Important
     */
    async getOrCreateStream(props: { id?: string, name?: string }) {
        this.debug('getOrCreateStream %o', {
            props,
        })
        // Try looking up the stream by id or name, whichever is defined
        try {
            if (props.id) {
                if (props.id && props.id.startsWith('/')) {
                    return await this.getStream(await this.ethereum.getAddress() + props.id)
                }
                return await this.getStream(props.id)
            }
            return await this.getStreamByName(props.name!)
        } catch (err: any) {
            // try create stream if NOT_FOUND + also supplying an id.
            if (props.id && err.errorCode === ErrorCode.NOT_FOUND) {
                const id = props.id || (await this.ethereum.getAddress()) + '/'
                const stream = await this.streamRegistry.createStream({ ...props, id })
                this.debug('Created stream: %s %o', props.id, stream.toObject())
                return stream
            }

            throw err
        }
    }

    async getStreamPublishers(streamId: string, pagesize: number = 1000) {
        this.debug('getStreamPublishers %o', {
            streamId,
        })
        return this.streamRegistry.getStreamPublishers(streamId, pagesize)
    }

    async isStreamPublisher(streamId: string, ethAddress: EthereumAddress) {
        this.debug('isStreamPublisher %o', {
            streamId,
            ethAddress,
        })
        return this.streamRegistry.isStreamPublisher(streamId, ethAddress)
    }

    async getStreamSubscribers(streamId: string, pagesize: number = 1000) {
        this.debug('getStreamSubscribers %o', {
            streamId,
        })
        return this.streamRegistry.getStreamSubscribers(streamId, pagesize)
    }

    async isStreamSubscriber(streamId: string, ethAddress: EthereumAddress) {
        this.debug('isStreamSubscriber %o', {
            streamId,
            ethAddress,
        })
        return this.streamRegistry.isStreamSubscriber(streamId, ethAddress)
    }

    async getStreamValidationInfo(streamId: string) {
        this.debug('getStreamValidationInfo %o', {
            streamId,
        })
        const json = await this.rest.get<StreamValidationInfo>(['streams', streamId, 'validation'])
        return json
    }

    async getStreamLast<T extends Stream|SIDLike|string>(streamObjectOrId: T, count = 1): Promise<StreamMessageAsObject> {
        const { streamId, streamPartition = 0 } = SPID.parse(streamObjectOrId)
        this.debug('getStreamLast %o', {
            streamId,
            streamPartition,
            count,
        })
        const stream = await this.streamRegistry.getStream(streamId)
        const nodes = await stream.getStorageNodes()
        if (nodes.length === 0) { throw new NotFoundError('Stream: name=' + streamId + ' has no storage nodes!') }
        const storageNode = nodes[Math.floor(Math.random() * nodes.length)]
        const json = await this.rest.get<StreamMessageAsObject>([
            'streams', streamId, 'data', 'partitions', streamPartition, 'last',
        ], {
            query: { count },
            useSession: false
        },
        storageNode.url)

        return json
    }

    async getStreamPartsByStorageNode(node: StorageNode|EthereumAddress) {
        const storageNode = (node instanceof StorageNode) ? node : await this.nodeRegistry.getStorageNode(node)
        const streams = await this.nodeRegistry.getStoredStreamsOf(storageNode.getAddress())

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
        await this.rest.post(
            ['streams', streamId, 'data'],
            data,
            {
                ...requestOptions,
                agent: keepAlive ? getKeepAliveAgentForUrl(nodeUrl) : undefined,
            },
            nodeUrl
        )
    }
}
