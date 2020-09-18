import fetch from 'node-fetch'
import Debug from 'debug'

import AuthFetchError from '../errors/AuthFetchError'
import { getVersionString } from '../utils'

export const DEFAULT_HEADERS = {
    'Streamr-Client': `streamr-client-javascript/${getVersionString()}`,
}

const debug = Debug('StreamrClient:utils:authfetch')

let ID = 0

export default async function authFetch(url, session, opts, requireNewToken = false) {
    ID += 1
    const timeStart = Date.now()
    const id = ID

    const options = {
        ...opts,
        headers: {
            ...DEFAULT_HEADERS,
            ...(opts && opts.headers),
        }
    }
    // add default 'Content-Type: application/json' header for all POST and PUT requests
    if (!options.headers['Content-Type'] && (options.method === 'POST' || options.method === 'PUT')) {
        options.headers['Content-Type'] = 'application/json'
    }

    debug('%d %s >> %o', id, url, opts)

    const response = await fetch(url, {
        ...opts,
        headers: {
            ...(session && !session.options.unauthenticated ? {
                Authorization: `Bearer ${await session.getSessionToken(requireNewToken)}`,
            } : {}),
            ...options.headers,
        },
    })
    const timeEnd = Date.now()
    debug('%d %s << %d %s %s %s', id, url, response.status, response.statusText, Debug.humanize(timeEnd - timeStart))

    const body = await response.text()

    if (response.ok) {
        try {
            return JSON.parse(body || '{}')
        } catch (e) {
            debug('%d %s – failed to parse body: %s', id, url, e.stack)
            throw new AuthFetchError(e.message, response, body)
        }
    } else if ([400, 401].includes(response.status) && !requireNewToken) {
        debug('%d %s – revalidating session')
        return authFetch(url, session, options, true)
    } else {
        debug('%d %s – failed', id, url)
        throw new AuthFetchError(`Request ${id} to ${url} returned with error code ${response.status}.`, response, body)
    }
}
