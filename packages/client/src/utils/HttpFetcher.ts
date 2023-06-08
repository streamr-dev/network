import { Logger, merge } from '@streamr/utils'
import fetch, { Response } from 'node-fetch'
import { inject, Lifecycle, scoped } from 'tsyringe'
import { ConfigInjectionToken, StrictStreamrClientConfig } from '../Config'
import { LoggerFactory } from './LoggerFactory'

@scoped(Lifecycle.ContainerScoped)
export class HttpFetcher {

    private readonly config: Pick<StrictStreamrClientConfig, '_timeouts'>
    private readonly logger: Logger

    /** @internal */
    constructor(
        @inject(ConfigInjectionToken) config: Pick<StrictStreamrClientConfig, '_timeouts'>,
        loggerFactory: LoggerFactory
    ) {
        this.config = config
        this.logger = loggerFactory.createLogger(module)
    }

    fetch(url: string, init?: Record<string, unknown>): Promise<Response> {
        // eslint-disable-next-line no-underscore-dangle
        const timeout = this.config._timeouts.httpFetchTimeout
        this.logger.debug('Fetch', { url, timeout })
        return fetch(url, merge({ timeout }, init))
    }
}
