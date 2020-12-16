import { Agent as HttpAgent } from 'http'
import { Agent as HttpsAgent } from 'https'

import qs from 'qs'
import debugFactory from 'debug'

import { getEndpointUrl } from '../utils'

import Stream from './domain/Stream'
import authFetch from './authFetch'

const debug = debugFactory('StreamrClient')

const agentSettings = {
    keepAlive: true,
    keepAliveMsecs: 5000,
}

const agentByProtocol = {
    http: new HttpAgent(agentSettings),
    https: new HttpsAgent(agentSettings),
}

function getKeepAliveAgentForUrl(url) {
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
export async function getStream(streamId) {
    this.debug('getStream', {
        streamId,
    })
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

export async function listStreams(query = {}) {
    this.debug('listStreams', {
        query,
    })
    const url = getEndpointUrl(this.options.restUrl, 'streams') + '?' + qs.stringify(query)
    const json = await authFetch(url, this.session)
    return json ? json.map((stream) => new Stream(this, stream)) : []
}

export async function getStreamByName(name) {
    this.debug('getStreamByName', {
        name,
    })
    const json = await this.listStreams({
        name,
        public: false,
    })
    return json[0] ? new Stream(this, json[0]) : undefined
}

export async function createStream(props) {
    this.debug('createStream', {
        props,
    })
    const json = await authFetch(
        `${this.options.restUrl}/streams`,
        this.session,
        {
            method: 'POST',
            body: JSON.stringify(props),
        },
    )
    return json ? new Stream(this, json) : undefined
}

export async function getOrCreateStream(props) {
    this.debug('getOrCreateStream', {
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

export async function getStreamPublishers(streamId) {
    this.debug('getStreamPublishers', {
        streamId,
    })
    const url = getEndpointUrl(this.options.restUrl, 'streams', streamId, 'publishers')
    const json = await authFetch(url, this.session)
    return json.addresses.map((a) => a.toLowerCase())
}

export async function isStreamPublisher(streamId, ethAddress) {
    this.debug('isStreamPublisher', {
        streamId,
        ethAddress,
    })
    const url = getEndpointUrl(this.options.restUrl, 'streams', streamId, 'publisher', ethAddress)
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

export async function getStreamSubscribers(streamId) {
    this.debug('getStreamSubscribers', {
        streamId,
    })
    const url = getEndpointUrl(this.options.restUrl, 'streams', streamId, 'subscribers')
    const json = await authFetch(url, this.session)
    return json.addresses.map((a) => a.toLowerCase())
}

export async function isStreamSubscriber(streamId, ethAddress) {
    this.debug('isStreamSubscriber', {
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

export async function getStreamValidationInfo(streamId) {
    this.debug('getStreamValidationInfo', {
        streamId,
    })
    const url = getEndpointUrl(this.options.restUrl, 'streams', streamId, 'validation')
    const json = await authFetch(url, this.session)
    return json
}

export async function publishHttp(streamObjectOrId, data, requestOptions = {}, keepAlive = true) {
    let streamId
    if (streamObjectOrId instanceof Stream) {
        streamId = streamObjectOrId.id
    } else {
        streamId = streamObjectOrId
    }
    this.debug('publishHttp', {
        streamId, data,
    })

    // Send data to the stream
    return authFetch(
        `${this.options.restUrl}/streams/${encodeURIComponent(streamId)}/data`,
        this.session,
        {
            ...requestOptions,
            method: 'POST',
            body: JSON.stringify(data),
            agent: keepAlive ? getKeepAliveAgentForUrl(this.options.restUrl) : undefined,
        },
    )
}
