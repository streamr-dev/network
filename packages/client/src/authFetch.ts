import fetch, { Response } from 'node-fetch'
import { Debug, Debugger, inspect } from './utils/log'

import { getVersionString, counterId } from './utils'

export enum ErrorCode {
    NOT_FOUND = 'NOT_FOUND',
    VALIDATION_ERROR = 'VALIDATION_ERROR',
    UNKNOWN = 'UNKNOWN'
}

export const DEFAULT_HEADERS = {
    'Streamr-Client': `streamr-client-javascript/${getVersionString()}`,
}

export class AuthFetchError extends Error {
    response?: Response
    body?: any
    errorCode: ErrorCode

    constructor(message: string, response?: Response, body?: any, errorCode?: ErrorCode) {
        const typePrefix = errorCode ? errorCode + ': ' : ''
        // add leading space if there is a body set
        const bodyMessage = body ? ` ${inspect(body)}` : ''
        super(typePrefix + message + bodyMessage)
        this.response = response
        this.body = body
        this.errorCode = errorCode || ErrorCode.UNKNOWN

        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor)
        }
    }
}

export class ValidationError extends AuthFetchError {
    constructor(message: string, response?: Response, body?: any) {
        super(message, response, body, ErrorCode.VALIDATION_ERROR)
    }
}

export class NotFoundError extends AuthFetchError {
    constructor(message: string, response?: Response, body?: any) {
        super(message, response, body, ErrorCode.NOT_FOUND)
    }
}

const ERROR_TYPES = new Map<ErrorCode, typeof AuthFetchError>()
ERROR_TYPES.set(ErrorCode.VALIDATION_ERROR, ValidationError)
ERROR_TYPES.set(ErrorCode.NOT_FOUND, NotFoundError)
ERROR_TYPES.set(ErrorCode.UNKNOWN, AuthFetchError)

const parseErrorCode = (body: string) => {
    let json
    try {
        json = JSON.parse(body)
    } catch (err) {
        return ErrorCode.UNKNOWN
    }
    const { code } = json
    return code in ErrorCode ? code : ErrorCode.UNKNOWN
}

export async function authRequest<T extends object>(
    url: string,
    opts?: any,
    requireNewToken = false,
    debug?: Debugger,
    fetchFn: typeof fetch = fetch
): Promise<Response> {
    if (!debug) {
        const id = counterId('authResponse')
        debug = Debug('utils').extend(id) // eslint-disable-line no-param-reassign
    }

    const timeStart = Date.now()

    const options = {
        ...opts,
        headers: {
            ...DEFAULT_HEADERS,
            ...(opts && opts.headers),
        },
    }
    // add default 'Content-Type: application/json' header for all POST and PUT requests
    if (!options.headers['Content-Type'] && (options.method === 'POST' || options.method === 'PUT')) {
        options.headers['Content-Type'] = 'application/json'
    }

    debug('%s >> %o', url, opts)

    const response: Response = await fetchFn(url, {
        ...opts,
        headers: {
            ...options.headers,
        },
    })
    const timeEnd = Date.now()
    debug('%s << %d %s %s %s', url, response.status, response.statusText, Debug.humanize(timeEnd - timeStart))

    if (response.ok) {
        return response
    }

    if ([400, 401].includes(response.status) && !requireNewToken) {
        debug('%d %s – revalidating session')
        return authRequest<T>(url, options, true)
    }

    debug('%s – failed', url)
    const body = await response.text()
    const errorCode = parseErrorCode(body)
    const ErrorClass = ERROR_TYPES.get(errorCode)!
    throw new ErrorClass(`Request ${debug.namespace} to ${url} returned with error code ${response.status}.`, response, body, errorCode)

}
/** @internal */
export default async function authFetch<T extends object>(
    url: string,
    opts?: any,
    requireNewToken = false,
    debug?: Debugger,
    fetchFn?: typeof fetch
): Promise<T> {
    const id = counterId('authFetch')
    debug = debug || Debug('utils').extend(id) // eslint-disable-line no-param-reassign

    const response = await authRequest(url, opts, requireNewToken, debug, fetchFn)
    // can only be ok response
    const body = await response.text()
    try {
        return JSON.parse(body || '{}')
    } catch (e) {
        debug('%s – failed to parse body: %s', url, e.stack)
        throw new AuthFetchError(e.message, response, body)
    }
}

