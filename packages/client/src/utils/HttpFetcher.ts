import { inject, Lifecycle, scoped } from 'tsyringe'
import { Debugger } from 'debug'
import { Context } from './Context'
import { Config, StrictStreamrClientConfig } from '../Config'
import { instanceId } from './index'
import fetch, { Response } from 'node-fetch'

@scoped(Lifecycle.ContainerScoped)
export class HttpFetcher {
    private readonly debug: Debugger

    constructor(
        context: Context,
        @inject(Config.Root) private config: StrictStreamrClientConfig
    ) {
        this.debug = context.debug.extend(instanceId(this))
    }

    fetch(url: string, init?: Record<string, unknown>): Promise<Response> {
        const timeout = this.config.timeouts.httpFetchTimeout
        this.debug('fetching %s (timeout %d ms)', url, timeout)
        return fetch(url, {
            timeout,
            ...init
        })
    }
}
