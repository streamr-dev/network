import fetch from 'node-fetch'
import debug from 'debug'
import type { RequestInfo, RequestInit, Response } from 'node-fetch'

const DEFAULT_TIMEOUT = 30 * 1000

const log = debug('Streamr:fetch')

export default function fetchWithTimeoutAndLogging(url: RequestInfo, init?: RequestInit): Promise<Response> {
    log('fetching %s', url)
    return fetch(url, {
        timeout: DEFAULT_TIMEOUT,
        ...init
    })

}
