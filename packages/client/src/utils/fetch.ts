import fetch from 'node-fetch'
import debug from 'debug'
import type { Response } from 'node-fetch'

const DEFAULT_TIMEOUT = 30 * 1000

const log = debug('Streamr:fetch')

// Cannot use more accurate types, like "{ RequestInfo, RequestInit, Response } from 'node-fetch'" due to shimming
export default function fetchWithTimeoutAndLogging(url: string, init?: Record<string, unknown>): Promise<Response> {
    log('fetching %s', url)
    return fetch(url, {
        timeout: DEFAULT_TIMEOUT,
        ...init
    } as any)

}
