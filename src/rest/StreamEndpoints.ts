import { Agent as HttpAgent } from 'http'
import { Agent as HttpsAgent } from 'https'

import qs from 'qs'
import debugFactory from 'debug'

import { getEndpointUrl } from '../utils'
import { validateOptions } from '../stream/utils'
import Stream from '../stream'
import StreamPart from '../stream/StreamPart'
import { isKeyExchangeStream } from '../stream/KeyExchange'

import authFetch from './authFetch'
import { Todo } from '../types'
import StreamrClient from '../StreamrClient'

const debug = debugFactory('StreamrClient')

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

export class StreamEndpoints {

    client: StreamrClient

    constructor(client: StreamrClient) {
        this.client = client
    }

    async getStream(streamId: Todo) {
        this.client.debug('getStream %o', {
            streamId,
        })

        if (isKeyExchangeStream(streamId)) {
            return new Stream(this.client, {
                id: streamId,
                partitions: 1,
            })
        }

        const url = getEndpointUrl(this.client.options.restUrl, 'streams', streamId)
        try {
            const json = await authFetch(url, this.client.session)
            return new Stream(this.client, json)
        } catch (e) {
            if (e.response && e.response.status === 404) {
                return undefined
            }
            throw e
        }
    }

    async listStreams(query: Todo = {}) {
        this.client.debug('listStreams %o', {
            query,
        })
        const url = getEndpointUrl(this.client.options.restUrl, 'streams') + '?' + qs.stringify(query)
        const json = await authFetch(url, this.client.session)
        return json ? json.map((stream: any) => new Stream(this.client, stream)) : []
    }

    async getStreamByName(name: string) {
        this.client.debug('getStreamByName %o', {
            name,
        })
        const json = await this.listStreams({
            name,
            public: false,
        })
        return json[0] ? new Stream(this.client, json[0]) : undefined
    }

    async createStream(props: Todo) {
        this.client.debug('createStream %o', {
            props,
        })

        const json = await authFetch(
            getEndpointUrl(this.client.options.restUrl, 'streams'),
            this.client.session,
            {
                method: 'POST',
                body: JSON.stringify(props),
            },
        )
        return json ? new Stream(this.client, json) : undefined
    }

    async getOrCreateStream(props: Todo) {
        this.client.debug('getOrCreateStream %o', {
            props,
        })
        let json: any

        // Try looking up the stream by id or name, whichever is defined
        if (props.id) {
            json = await this.getStream(props.id)
        } else if (props.name) {
            json = await this.getStreamByName(props.name)
        }

        // If not found, try creating the stream
        if (!json) {
            json = await this.createStream(props)
            debug('Created stream: %s (%s)', props.name, json.id)
        }

        // If still nothing, throw
        if (!json) {
            throw new Error(`Unable to find or create stream: ${props.name || props.id}`)
        } else {
            return new Stream(this.client, json)
        }
    }

    async getStreamPublishers(streamId: Todo) {
        this.client.debug('getStreamPublishers %o', {
            streamId,
        })
        const url = getEndpointUrl(this.client.options.restUrl, 'streams', streamId, 'publishers')
        const json = await authFetch(url, this.client.session)
        return json.addresses.map((a: string) => a.toLowerCase())
    }

    async isStreamPublisher(streamId: Todo, ethAddress: Todo) {
        this.client.debug('isStreamPublisher %o', {
            streamId,
            ethAddress,
        })
        const url = getEndpointUrl(this.client.options.restUrl, 'streams', streamId, 'publisher', ethAddress)
        try {
            await authFetch(url, this.client.session)
            return true
        } catch (e) {
            this.client.debug(e)
            if (e.response && e.response.status === 404) {
                return false
            }
            throw e
        }
    }

    async getStreamSubscribers(streamId: Todo) {
        this.client.debug('getStreamSubscribers %o', {
            streamId,
        })
        const url = getEndpointUrl(this.client.options.restUrl, 'streams', streamId, 'subscribers')
        const json = await authFetch(url, this.client.session)
        return json.addresses.map((a: Todo) => a.toLowerCase())
    }

    async isStreamSubscriber(streamId: Todo, ethAddress: Todo) {
        this.client.debug('isStreamSubscriber %o', {
            streamId,
            ethAddress,
        })
        const url = getEndpointUrl(this.client.options.restUrl, 'streams', streamId, 'subscriber', ethAddress)
        try {
            await authFetch(url, this.client.session)
            return true
        } catch (e) {
            if (e.response && e.response.status === 404) {
                return false
            }
            throw e
        }
    }

    async getStreamValidationInfo(streamId: Todo) {
        this.client.debug('getStreamValidationInfo %o', {
            streamId,
        })
        const url = getEndpointUrl(this.client.options.restUrl, 'streams', streamId, 'validation')
        const json = await authFetch(url, this.client.session)
        return json
    }

    async getStreamLast(streamObjectOrId: Todo) {
        const { streamId, streamPartition = 0, count = 1 } = validateOptions(streamObjectOrId)
        this.client.debug('getStreamLast %o', {
            streamId,
            streamPartition,
            count,
        })
        const query = {
            count,
        }

        const url = getEndpointUrl(this.client.options.restUrl, 'streams', streamId, 'data', 'partitions', streamPartition, 'last') + `?${qs.stringify(query)}`
        const json = await authFetch(url, this.client.session)
        return json
    }

    async getStreamPartsByStorageNode(address: Todo) {
        const json = await authFetch(getEndpointUrl(this.client.options.restUrl, 'storageNodes', address, 'streams'), this.client.session)
        let result: Todo = []
        json.forEach((stream: Todo) => {
            result = result.concat(StreamPart.fromStream(stream))
        })
        return result
    }

    async publishHttp(streamObjectOrId: Todo, data: Todo, requestOptions: Todo = {}, keepAlive: Todo = true) {
        let streamId
        if (streamObjectOrId instanceof Stream) {
            streamId = streamObjectOrId.id
        } else {
            streamId = streamObjectOrId
        }
        this.client.debug('publishHttp %o', {
            streamId, data,
        })

        // Send data to the stream
        return authFetch(
            getEndpointUrl(this.client.options.restUrl, 'streams', streamId, 'data'),
            this.client.session,
            {
                ...requestOptions,
                method: 'POST',
                body: JSON.stringify(data),
                agent: keepAlive ? getKeepAliveAgentForUrl(this.client.options.restUrl) : undefined,
            },
        )
    }
}
