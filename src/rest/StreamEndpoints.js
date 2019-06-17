import { Agent as HttpAgent } from 'http'
import { Agent as HttpsAgent } from 'https'

import qs from 'qs'
import debugFactory from 'debug'

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
    } else if (url.startsWith('http')) {
        return agentByProtocol.http
    }

    throw new Error(`Unknown protocol in URL: ${url}`)
}

// These function are mixed in to StreamrClient.prototype.
// In the below functions, 'this' is intended to be the StreamrClient
export async function getStream(streamId) {
    const url = `${this.options.restUrl}/streams/${streamId}`
    const json = await authFetch(url, this.session)
    return json ? new Stream(this, json) : undefined
}

export async function listStreams(query = {}) {
    const url = `${this.options.restUrl}/streams?${qs.stringify(query)}`
    const json = await authFetch(url, this.session)
    return json ? json.map((stream) => new Stream(this, stream)) : []
}

export async function getStreamByName(name) {
    const json = await this.listStreams({
        name,
        public: false,
    })
    return json[0] ? new Stream(this, json[0]) : undefined
}

export async function createStream(props) {
    if (!props || !props.name) {
        throw new Error('Stream properties must contain a "name" field!')
    }

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
        throw new Error(`Unable to find or create stream: ${props.name}`)
    } else {
        return new Stream(this, json)
    }
}

export async function getStreamPublishers(streamId) {
    const url = `${this.options.restUrl}/streams/${streamId}/publishers`
    const json = await authFetch(url, this.session)
    return json.addresses.map((a) => a.toLowerCase())
}

export function publishHttp(streamObjectOrId, data, requestOptions = {}, keepAlive = true) {
    let streamId
    if (streamObjectOrId instanceof Stream) {
        streamId = streamObjectOrId.id
    } else {
        streamId = streamObjectOrId
    }

    // Send data to the stream
    return authFetch(
        `${this.options.restUrl}/streams/${streamId}/data`,
        this.session,
        Object.assign({}, requestOptions, {
            method: 'POST',
            body: JSON.stringify(data),
            agent: keepAlive ? getKeepAliveAgentForUrl(this.options.restUrl) : undefined,
        }),
    )
}
