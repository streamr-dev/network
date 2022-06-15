import { inject, Lifecycle, scoped } from 'tsyringe'
import { Debugger } from 'debug'
import { Context } from './Context'
import { ConfigInjectionToken, StrictStreamrClientConfig } from '../Config'
import { instanceId } from './utils'
import fetch, { Response } from 'node-fetch'

@scoped(Lifecycle.ContainerScoped)
export class HttpFetcher {
    private readonly debug: Debugger

    constructor(
        context: Context,
        @inject(ConfigInjectionToken.Root) private config: StrictStreamrClientConfig
    ) {
        this.debug = context.debug.extend(instanceId(this))
    }

    fetch(url: string, init?: Record<string, unknown>): Promise<Response> {
        // eslint-disable-next-line no-underscore-dangle
        const timeout = this.config._timeouts.httpFetchTimeout
        this.debug('fetching %s (timeout %d ms)', url, timeout)
        return fetch(url, {
            timeout,
            ...init
        } as any)
    }
}
