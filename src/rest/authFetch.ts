import fetch, { Response } from 'node-fetch'
import Debug from 'debug'

import { getVersionString } from '../utils'
import Session from '../Session'

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
        const bodyMessage = body ? ` ${(typeof body === 'string' ? body : JSON.stringify(body).slice(0, 1024))}...` : ''
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

const debug = Debug('StreamrClient:utils:authfetch') // TODO: could use the debug instance from the client? (e.g. client.debug.extend('authFetch'))

let ID = 0

export default async function authFetch<T extends object>(url: string, session?: Session, opts?: any, requireNewToken = false): Promise<T> {
    ID += 1
    const timeStart = Date.now()
    const id = ID

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

    debug('%d %s >> %o', id, url, opts)

    const response: Response = await fetch(url, {
        ...opts,
        headers: {
            ...(session && !session.options.unauthenticated ? {
                Authorization: `Bearer ${await session.getSessionToken(requireNewToken)}`,
            } : {}),
            ...options.headers,
        },
    })
    const timeEnd = Date.now()
    // @ts-expect-error
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
        return authFetch<T>(url, session, options, true)
    } else {
        debug('%d %s – failed', id, url)
        const errorCode = parseErrorCode(body)
        const ErrorClass = ERROR_TYPES.get(errorCode)!
        throw new ErrorClass(`Request ${id} to ${url} returned with error code ${response.status}.`, response, body, errorCode)
    }
}
