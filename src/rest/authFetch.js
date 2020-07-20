import fetch from 'node-fetch'
import debugFactory from 'debug'

import AuthFetchError from '../errors/AuthFetchError'
import { getVersionString } from '../utils'

export const DEFAULT_HEADERS = {
    'Streamr-Client': `streamr-client-javascript/${getVersionString()}`,
}

const debug = debugFactory('StreamrClient:utils')

const authFetch = async (url, session, opts = {}, requireNewToken = false) => {
    const options = {
        ...opts,
        headers: {
            ...DEFAULT_HEADERS,
            ...opts.headers,
        }
    }
    // add default 'Content-Type: application/json' header for all requests
    // including 0 body length POST calls
    if (!options.headers['Content-Type']) {
        options.headers['Content-Type'] = 'application/json'
    }

    debug('authFetch: ', url, opts)

    const response = await fetch(url, {
        ...opts,
        headers: {
            ...(session && !session.options.unauthenticated ? {
                Authorization: `Bearer ${await session.getSessionToken(requireNewToken)}`,
            } : {}),
            ...options.headers,
        },
    })

    const body = await response.text()

    if (response.ok) {
        try {
            return JSON.parse(body || '{}')
        } catch (e) {
            throw new AuthFetchError(e.message, response, body)
        }
    } else if ([400, 401].includes(response.status) && !requireNewToken) {
        return authFetch(url, session, options, true)
    } else {
        throw new AuthFetchError(`Request to ${url} returned with error code ${response.status}.`, response, body)
    }
}

export default authFetch
