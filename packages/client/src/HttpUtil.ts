import fetch, { Response } from 'node-fetch'

import { getVersionString } from './utils/utils'
import { Readable } from 'stream'
import { WebStreamToNodeStream } from './utils/WebStreamToNodeStream'
import split2 from 'split2'
import { StreamMessage } from 'streamr-client-protocol'
import { inject, Lifecycle, scoped } from 'tsyringe'
import { Logger } from '@streamr/utils'
import { LoggerFactory } from './utils/LoggerFactory'

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
        super(typePrefix + message)
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
    private readonly logger: Logger

    constructor(@inject(LoggerFactory) loggerFactory: LoggerFactory) {
        this.logger = loggerFactory.createLogger(module)
    }

    async* fetchHttpStream<T>(
        url: string,
        abortController = new AbortController()
    ): AsyncIterable<StreamMessage<T>> {
        const response = await fetchResponse(url, this.logger, {
            signal: abortController.signal
        })
        if (!response.body) {
            throw new Error('No Response Body')
        }

        let stream: Readable | undefined
        try {
            // in the browser, response.body will be a web stream. Convert this into a node stream.
            const source: Readable = WebStreamToNodeStream(response.body as unknown as (ReadableStream | Readable))

            stream = source.pipe(split2((message: string) => {
                return StreamMessage.deserialize(message)
            }))

            stream.once('close', () => {
                abortController.abort()
            })

            yield* stream
        } catch (err) {
            abortController.abort()
            throw err
        } finally {
            stream?.destroy()
        }
    }

    // eslint-disable-next-line class-methods-use-this
    createQueryString(query: Record<string, any>): string {
        const withoutEmpty = Object.fromEntries(Object.entries(query).filter(([_k, v]) => v != null))
        return new URLSearchParams(withoutEmpty).toString()
    }
}

async function fetchResponse(
    url: string,
    logger: Logger,
    opts?: any, // eslint-disable-line @typescript-eslint/explicit-module-boundary-types
    fetchFn: typeof fetch = fetch
): Promise<Response> {
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

    logger.debug('fetching %s with options %j', url, opts)

    const response: Response = await fetchFn(url, opts)
    const timeEnd = Date.now()
    logger.debug('%s responded with %d %s %s in %d ms', url, response.status, response.statusText, timeEnd - timeStart)

    if (response.ok) {
        return response
    }

    const body = await response.text()
    const errorCode = parseErrorCode(body)
    const ErrorClass = ERROR_TYPES.get(errorCode)!
    throw new ErrorClass(`Request to ${url} returned with error code ${response.status}.`, response, body, errorCode)
}
