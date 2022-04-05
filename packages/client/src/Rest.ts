/**
 * More ergonomic wrapper around fetch/authFetch
 */
import { Lifecycle, scoped, inject, DependencyContainer } from 'tsyringe'

import { Debugger } from './utils/log'
import { instanceId } from './utils'
import { ConnectionConfig, ConfigInjectionToken } from './Config'
import { authFetch, authRequest } from './authFetch'
import { Context } from './utils/Context'
import { Readable } from 'stream'
import { WebStreamToNodeStream } from './utils/WebStreamToNodeStream'

import { Session } from './Session'
import { BrubeckContainer } from './Container'
import { StreamMessage } from 'streamr-client-protocol'
import split2 from 'split2'

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

export const createQueryString = (query: Record<string, any>) => {
    const withoutEmpty = Object.fromEntries(Object.entries(query).filter(([_k, v]) => v != null))
    return new URLSearchParams(withoutEmpty).toString()
}

@scoped(Lifecycle.ContainerScoped)
export class Rest implements Context {
    readonly id
    readonly debug

    constructor(
        context: Context,
        @inject(BrubeckContainer) private container: DependencyContainer,
        @inject(ConfigInjectionToken.Connection) private options: ConnectionConfig,
    ) {
        this.id = instanceId(this)
        this.debug = context.debug.extend(this.id)
    }

    getUrl(urlParts: UrlParts, query = {}, restUrl = this.options.restUrl) {
        const url = new URL(urlParts.map((s) => encodeURIComponent(s)).join('/'), restUrl + '/')
        url.search = createQueryString(query)
        return url
    }

    get session() {
        return this.container.resolve<Session>(Session)
    }

    fetch<T extends object>(urlParts: UrlParts, {
        query, useSession = true, options, requireNewToken = false, debug = this.debug, restUrl
    }: FetchOptions) {
        const url = this.getUrl(urlParts, query, restUrl)
        const newOptions = {
            ...options,
            session: useSession ? this.session : undefined
        }
        return authFetch<T>(
            url.toString(),
            newOptions,
            requireNewToken,
            debug,
        )
    }

    request<T extends object>(urlParts: UrlParts, {
        query, useSession = true, options, requireNewToken = false, debug = this.debug, restUrl
    }: FetchOptions) {
        const url = this.getUrl(urlParts, query, restUrl)
        const newOptions = {
            ...options,
            session: useSession ? this.session : undefined
        }
        return authRequest<T>(
            url.toString(),
            newOptions,
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

        const stream = WebStreamToNodeStream(response.body as unknown as (ReadableStream | Readable))

        stream.once('close', () => {
            abortController.abort()
        })

        return Object.assign(stream, {
            startTime,
        })
    }

    // TODO this method is very similar to stream() method, maybe we don't need both?
    // eslint-disable-next-line class-methods-use-this
    async fetchStream(url: string, opts = {}, abortController = new AbortController()): Promise<Readable> {
        const startTime = Date.now()
        const response = await authRequest(url, {
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
}
