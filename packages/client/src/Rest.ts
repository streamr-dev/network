/**
 * More ergonomic wrapper around fetch/authFetch
 */
import { Lifecycle, scoped, inject, DependencyContainer } from 'tsyringe'

import { Debugger } from './utils/log'
import { instanceId } from './utils'
import { ConnectionConfig, Config } from './Config'
import authFetch, { authRequest } from './authFetch'
import { Context } from './utils/Context'
import { Readable } from 'stream'
import { ConvertBrowserStream } from './utils/ConvertBrowserStream'

import Session from './Session'
import { BrubeckContainer } from './Container'

export type FetchOptions = {
    query?: any,
    useSession?: boolean,
    options?: any,
    requireNewToken?: boolean
    debug?: Debugger
    restUrl?: string
}

export type UrlParts = (string | number)[]

function serialize(body: any): string | undefined {
    if (body == null) { return undefined }
    return typeof body === 'string' ? body : JSON.stringify(body)
}

@scoped(Lifecycle.ContainerScoped)
export class Rest implements Context {
    id
    debug
    constructor(
        context: Context,
        @inject(BrubeckContainer) private container: DependencyContainer,
        @inject(Config.Connection) private options: ConnectionConfig,
    ) {
        this.id = instanceId(this)
        this.debug = context.debug.extend(this.id)
    }

    getUrl(urlParts: UrlParts, query = {}, restUrl = this.options.restUrl) {
        const url = new URL(urlParts.map((s) => encodeURIComponent(s)).join('/'), restUrl + '/')
        const searchParams = new URLSearchParams(query)
        url.search = searchParams.toString()
        return url
    }

    get session() {
        return this.container.resolve<Session>(Session)
    }

    fetch<T extends object>(urlParts: UrlParts, {
        query, useSession = true, options, requireNewToken = false, debug = this.debug, restUrl
    }: FetchOptions) {
        const url = this.getUrl(urlParts, query, restUrl)
        return authFetch<T>(
            url.toString(),
            useSession ? this.session : undefined,
            options,
            requireNewToken,
            debug,
        )
    }

    request<T extends object>(urlParts: UrlParts, {
        query, useSession = true, options, requireNewToken = false, debug = this.debug, restUrl
    }: FetchOptions) {
        const url = this.getUrl(urlParts, query, restUrl)
        return authRequest<T>(
            url.toString(),
            useSession ? this.session : undefined,
            options,
            requireNewToken,
            debug,
        )
    }

    post<T extends object>(urlParts: UrlParts, body?: any, options: FetchOptions = {}) {
        return this.fetch<T>(urlParts, {
            ...options,
            options: {
                ...options?.options,
                headers: {
                    'Content-Type': 'application/json',
                    ...options?.options?.headers,
                },
                method: 'POST',
                body: serialize(body),
            }
        })
    }

    get<T extends object>(urlParts: UrlParts, options: FetchOptions = {}) {
        return this.fetch<T>(urlParts, {
            ...options,
            options: {
                ...options.options,
                method: 'GET',
            }
        })
    }

    put<T extends object>(urlParts: UrlParts, body?: any, options: FetchOptions = {}) {
        return this.fetch<T>(urlParts, {
            ...options,
            options: {
                ...options.options,
                headers: {
                    'Content-Type': 'application/json',
                    ...options?.options?.headers,
                },
                method: 'PUT',
                body: serialize(body),
            }
        })
    }

    del<T extends object>(urlParts: UrlParts, options: FetchOptions = {}) {
        return this.fetch<T>(urlParts, {
            ...options,
            options: {
                ...options.options,
                method: 'DELETE',
            }
        })
    }

    async stream(urlParts: UrlParts, options: FetchOptions = {}, abortController = new AbortController()): Promise<Readable> {
        const startTime = Date.now()
        const response = await this.request(urlParts, {
            ...options,
            options: {
                signal: abortController.signal,
                ...options.options,
            }
        })

        if (!response.body) {
            throw new Error('No Response Body')
        }

        const stream = ConvertBrowserStream(response.body as unknown as (ReadableStream | Readable))

        stream.once('close', () => {
            abortController.abort()
        })

        return Object.assign(stream, {
            startTime,
        })
    }
}
