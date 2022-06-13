import fetch, { Response } from 'node-fetch'
import { Debug, Debugger, inspect } from './utils/log'

import { getVersionString, counterId } from './utils'
import { Readable } from 'stream'
import { WebStreamToNodeStream } from './utils/WebStreamToNodeStream'
import split2 from 'split2'
import { StreamMessage } from 'streamr-client-protocol'
import { Lifecycle, scoped } from 'tsyringe'

export enum ErrorCode {
    NOT_FOUND = 'NOT_FOUND',
    VALIDATION_ERROR = 'VALIDATION_ERROR',
    UNKNOWN = 'UNKNOWN'
}

export const DEFAULT_HEADERS = {
    'Streamr-Client': `streamr-client-javascript/${getVersionString()}`,
}

export class HttpError extends Error {
    public response?: Response
    public body?: any
    public code: ErrorCode
    public errorCode: ErrorCode

    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    constructor(message: string, response?: Response, body?: any, errorCode?: ErrorCode) {
        const typePrefix = errorCode ? errorCode + ': ' : ''
        // add leading space if there is a body set
        const bodyMessage = body ? ` ${inspect(body)}` : ''
        super(typePrefix + message + bodyMessage)
        this.response = response
        this.body = body
        this.code = errorCode || ErrorCode.UNKNOWN
        this.errorCode = this.code

        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor)
        }
    }
}

export class ValidationError extends HttpError {
    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    constructor(message: string, response?: Response, body?: any) {
        super(message, response, body, ErrorCode.VALIDATION_ERROR)
    }
}

export class NotFoundError extends HttpError {
    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    constructor(message: string, response?: Response, body?: any) {
        super(message, response, body, ErrorCode.NOT_FOUND)
    }
}

const ERROR_TYPES = new Map<ErrorCode, typeof HttpError>()
ERROR_TYPES.set(ErrorCode.VALIDATION_ERROR, ValidationError)
ERROR_TYPES.set(ErrorCode.NOT_FOUND, NotFoundError)
ERROR_TYPES.set(ErrorCode.UNKNOWN, HttpError)

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

@scoped(Lifecycle.ContainerScoped)
export class HttpUtil {
    async fetchHttpStream(
        url: string,
        opts = {}, // eslint-disable-line @typescript-eslint/explicit-module-boundary-types
        abortController = new AbortController()
    ): Promise<Readable> {
        const startTime = Date.now()
        const response = await fetchResponse(url, {
            signal: abortController.signal,
            ...opts,
        })
        if (!response.body) {
            throw new Error('No Response Body')
        }

        try {
            // in the browser, response.body will be a web stream. Convert this into a node stream.
            const source: Readable = WebStreamToNodeStream(response.body as unknown as (ReadableStream | Readable))

            const stream = source.pipe(split2((message: string) => {
                return StreamMessage.deserialize(message)
            }))

            stream.once('close', () => {
                abortController.abort()
            })

            return Object.assign(stream, {
                startTime,
            })
        } catch (err) {
            abortController.abort()
            throw err
        }
    }

    createQueryString(query: Record<string, any>): string {
        const withoutEmpty = Object.fromEntries(Object.entries(query).filter(([_k, v]) => v != null))
        return new URLSearchParams(withoutEmpty).toString()
    }
}

async function fetchResponse(
    url: string,
    opts?: any, // eslint-disable-line @typescript-eslint/explicit-module-boundary-types
    debug?: Debugger,
    fetchFn: typeof fetch = fetch
): Promise<Response> {
    if (!debug) {
        const id = counterId('httpResponse')
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

    const response: Response = await fetchFn(url, opts)
    const timeEnd = Date.now()
    debug('%s << %d %s %s %s', url, response.status, response.statusText, Debug.humanize(timeEnd - timeStart))

    if (response.ok) {
        return response
    }

    debug('%s – failed %s', url, response.statusText)
    const body = await response.text()
    const errorCode = parseErrorCode(body)
    const ErrorClass = ERROR_TYPES.get(errorCode)!
    throw new ErrorClass(`Request ${debug.namespace} to ${url} returned with error code ${response.status}.`, response, body, errorCode)
}
