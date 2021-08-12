import { scoped, Lifecycle, inject, DependencyContainer, delay } from 'tsyringe'
import { Agent as HttpAgent } from 'http'
import { Agent as HttpsAgent } from 'https'

import { instanceId } from '../utils'
import { Debug } from '../utils/log'
import { createStreamId } from '../stream/utils'
import { Stream, StreamOperation, StreamProperties } from './Stream'
import { StreamPart } from '../stream/StreamPart'
import { isKeyExchangeStream } from './encryption/KeyExchangeUtils'

import { ErrorCode, NotFoundError } from './authFetch'
import { BrubeckContainer } from './Container'
import { EthereumAddress } from '../types'
// TODO change this import when streamr-client-protocol exports StreamMessage type or the enums types directly
import { ContentType, EncryptionType, SignatureType } from 'streamr-client-protocol/dist/src/protocol/message_layer/StreamMessage'
import { StreamMessageType, SIDLike, SPID } from 'streamr-client-protocol'
import { StorageNode } from '../stream/StorageNode'
import { Config, ConnectionConfig } from './Config'
import { Rest } from './Rest'
import { Context } from '../utils/Context'
import StreamrEthereum from './Ethereum'

const debug = Debug('StreamEndpoints')

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
    partitions: number,
    requireSignedData: boolean
    requireEncryptedData: boolean
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
        private readonly ethereum: StreamrEthereum
    ) {
        this.id = instanceId(this)
        this.debug = context.debug.extend(this.id)
    }

    /**
     * @category Important
     */
    async getStream(streamId: string) {
        const isKeyExchange = isKeyExchangeStream(streamId)
        this.debug('getStream %o', {
            streamId,
            isKeyExchangeStream: isKeyExchange,
        })

        if (isKeyExchange) {
            return new Stream({
                id: streamId,
                partitions: 1,
            }, this.container)
        }

        const json = await this.rest.get<StreamProperties>(['streams', streamId])
        return new Stream(json, this.container)
    }

    /**
     * @category Important
     */
    async listStreams(query: StreamListQuery = {}): Promise<Stream[]> {
        this.debug('listStreams %o', {
            query,
        })
        const json = await this.rest.get<StreamProperties[]>(['streams'], { query })
        return json ? json.map((stream: StreamProperties) => new Stream(stream, this.container)) : []
    }

    async getStreamByName(name: string) {
        this.debug('getStreamByName %o', {
            name,
        })
        const json = await this.listStreams({
            name,
            // @ts-expect-error
            public: false,
        })
        return json[0] ? new Stream(json[0], this.container) : Promise.reject(new NotFoundError('Stream: name=' + name))
    }

    /**
     * @category Important
     * @param props - if id is specified, it can be full streamId or path
     */
    async createStream(props?: Partial<StreamProperties> & { id: string }) {
        this.debug('createStream %o', {
            props,
        })
        const body = (props?.id !== undefined) ? {
            ...props,
            id: await createStreamId(props.id, () => this.ethereum.getAddress())
        } : props
        const json = await this.rest.post<StreamProperties>(['streams'], body)
        return new Stream(json, this.container)
    }

    /**
     * @category Important
     */
    async getOrCreateStream(props: { id: string, name?: never } | { id?: never, name: string }) {
        this.debug('getOrCreateStream %o', {
            props,
        })
        // Try looking up the stream by id or name, whichever is defined
        try {
            if (props.id) {
                return await this.getStream(props.id)
            }
            return await this.getStreamByName(props.name!)
        } catch (err: any) {
            // try create stream if NOT_FOUND + also supplying an id.
            if (props.id && err.errorCode === ErrorCode.NOT_FOUND) {
                const stream = await this.createStream(props)
                debug('Created stream: %s', props.id, stream.toObject())
                return stream
            }

            throw err
        }
    }

    async getStreamPublishers(streamId: string) {
        this.debug('getStreamPublishers %o', {
            streamId,
        })

        const json = await this.rest.get<{ addresses: string[]}>(['streams', streamId, 'publishers'])
        return json.addresses.map((a: string) => a.toLowerCase())
    }

    async isStreamPublisher(streamId: string, ethAddress: EthereumAddress) {
        this.debug('isStreamPublisher %o', {
            streamId,
            ethAddress,
        })
        try {
            await this.rest.get(['streams', streamId, 'publisher', ethAddress])
            return true
        } catch (e) {
            this.debug(e)
            if (e.response && e.response.status === 404) {
                return false
            }
            throw e
        }
    }

    async getStreamSubscribers(streamId: string) {
        this.debug('getStreamSubscribers %o', {
            streamId,
        })
        const json = await this.rest.get<{ addresses: string[] }>(['streams', streamId, 'subscribers'])
        return json.addresses.map((a: string) => a.toLowerCase())
    }

    async isStreamSubscriber(streamId: string, ethAddress: EthereumAddress) {
        this.debug('isStreamSubscriber %o', {
            streamId,
            ethAddress,
        })
        try {
            await this.rest.get(['streams', streamId, 'subscriber', ethAddress])
            return true
        } catch (e) {
            if (e.response && e.response.status === 404) {
                return false
            }
            throw e
        }
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

        const json = await this.rest.get<StreamMessageAsObject>([
            'streams', streamId, 'data', 'partitions', streamPartition, 'last',
        ], {
            query: { count }
        })

        return json
    }

    async getStreamPartsByStorageNode(node: StorageNode|EthereumAddress) {
        const address = (node instanceof StorageNode) ? node.getAddress() : node
        type ItemType = { id: string, partitions: number}
        const json = await this.rest.get<ItemType[]>([
            'storageNodes', address, 'streams'
        ])
        let result: StreamPart[] = []
        json.forEach((stream: ItemType) => {
            result = result.concat(StreamPart.fromStream(stream))
        })
        return result
    }

    async publishHttp(streamObjectOrId: Stream|string, data: any, requestOptions: any = {}, keepAlive: boolean = true) {
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
                agent: keepAlive ? getKeepAliveAgentForUrl(this.options.restUrl!) : undefined,
            },
        )
    }
}
