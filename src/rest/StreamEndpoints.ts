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

// These function are mixed in to StreamrClient.prototype.
// In the below functions, 'this' is intended to be the StreamrClient
export async function getStream(streamId: Todo) {
    this.debug('getStream %o', {
        streamId,
    })

    if (isKeyExchangeStream(streamId)) {
        return new Stream(this, {
            id: streamId,
            partitions: 1,
        })
    }

    const url = getEndpointUrl(this.options.restUrl, 'streams', streamId)
    try {
        const json = await authFetch(url, this.session)
        return new Stream(this, json)
    } catch (e) {
        if (e.response && e.response.status === 404) {
            return undefined
        }
        throw e
    }
}

export async function listStreams(query: Todo = {}) {
    this.debug('listStreams %o', {
        query,
    })
    const url = getEndpointUrl(this.options.restUrl, 'streams') + '?' + qs.stringify(query)
    const json = await authFetch(url, this.session)
    return json ? json.map((stream) => new Stream(this, stream)) : []
}

export async function getStreamByName(name: string) {
    this.debug('getStreamByName %o', {
        name,
    })
    const json = await this.listStreams({
        name,
        public: false,
    })
    return json[0] ? new Stream(this, json[0]) : undefined
}

export async function createStream(props: Todo) {
    this.debug('createStream %o', {
        props,
    })

    const json = await authFetch(
        getEndpointUrl(this.options.restUrl, 'streams'),
        this.session,
        {
            method: 'POST',
            body: JSON.stringify(props),
        },
    )
    return json ? new Stream(this, json) : undefined
}

export async function getOrCreateStream(props: Todo) {
    this.debug('getOrCreateStream %o', {
        props,
    })
    let json

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
        return new Stream(this, json)
    }
}

export async function getStreamPublishers(streamId: Todo) {
    this.debug('getStreamPublishers %o', {
        streamId,
    })
    const url = getEndpointUrl(this.options.restUrl, 'streams', streamId, 'publishers')
    const json = await authFetch(url, this.session)
    return json.addresses.map((a: string) => a.toLowerCase())
}

export async function isStreamPublisher(streamId: Todo, ethAddress: Todo) {
    this.debug('isStreamPublisher %o', {
        streamId,
        ethAddress,
    })
    const url = getEndpointUrl(this.options.restUrl, 'streams', streamId, 'publisher', ethAddress)
    try {
        await authFetch(url, this.session)
        return true
    } catch (e) {
        this.debug(e)
        if (e.response && e.response.status === 404) {
            return false
        }
        throw e
    }
}

export async function getStreamSubscribers(streamId: Todo) {
    this.debug('getStreamSubscribers %o', {
        streamId,
    })
    const url = getEndpointUrl(this.options.restUrl, 'streams', streamId, 'subscribers')
    const json = await authFetch(url, this.session)
    return json.addresses.map((a: Todo) => a.toLowerCase())
}

export async function isStreamSubscriber(streamId: Todo, ethAddress: Todo) {
    this.debug('isStreamSubscriber %o', {
        streamId,
        ethAddress,
    })
    const url = getEndpointUrl(this.options.restUrl, 'streams', streamId, 'subscriber', ethAddress)
    try {
        await authFetch(url, this.session)
        return true
    } catch (e) {
        if (e.response && e.response.status === 404) {
            return false
        }
        throw e
    }
}

export async function getStreamValidationInfo(streamId: Todo) {
    this.debug('getStreamValidationInfo %o', {
        streamId,
    })
    const url = getEndpointUrl(this.options.restUrl, 'streams', streamId, 'validation')
    const json = await authFetch(url, this.session)
    return json
}

export async function getStreamLast(streamObjectOrId: Todo) {
    const { streamId, streamPartition = 0, count = 1 } = validateOptions(streamObjectOrId)
    this.debug('getStreamLast %o', {
        streamId,
        streamPartition,
        count,
    })
    const query = {
        count,
    }

    const url = getEndpointUrl(this.options.restUrl, 'streams', streamId, 'data', 'partitions', streamPartition, 'last') + `?${qs.stringify(query)}`
    const json = await authFetch(url, this.session)
    return json
}

export async function getStreamPartsByStorageNode(address: Todo) {
    const json = await authFetch(getEndpointUrl(this.options.restUrl, 'storageNodes', address, 'streams'), this.session)
    let result: Todo = []
    json.forEach((stream: Todo) => {
        result = result.concat(StreamPart.fromStream(stream))
    })
    return result
}

export async function publishHttp(streamObjectOrId: Todo, data: Todo, requestOptions: Todo = {}, keepAlive: Todo = true) {
    let streamId
    if (streamObjectOrId instanceof Stream) {
        // @ts-expect-error
        streamId = streamObjectOrId.id
    } else {
        streamId = streamObjectOrId
    }
    this.debug('publishHttp %o', {
        streamId, data,
    })

    // Send data to the stream
    return authFetch(
        getEndpointUrl(this.options.restUrl, 'streams', streamId, 'data'),
        this.session,
        {
            ...requestOptions,
            method: 'POST',
            body: JSON.stringify(data),
            agent: keepAlive ? getKeepAliveAgentForUrl(this.options.restUrl) : undefined,
        },
    )
}
