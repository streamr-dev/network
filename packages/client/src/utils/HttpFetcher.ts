import { inject, Lifecycle, scoped } from 'tsyringe'
import { ConfigInjectionToken, TimeoutsConfig } from '../Config'
import fetch, { Response } from 'node-fetch'
import { Logger } from '@streamr/utils'
import { LoggerFactory } from './LoggerFactory'

@scoped(Lifecycle.ContainerScoped)
export class HttpFetcher {
    private readonly logger: Logger

    constructor(
        @inject(LoggerFactory) loggerFactory: LoggerFactory,
        @inject(ConfigInjectionToken.Timeouts) private timeoutsConfig: TimeoutsConfig
    ) {
        this.logger = loggerFactory.createLogger(module)
    }

    fetch(url: string, init?: Record<string, unknown>): Promise<Response> {
        const timeout = this.timeoutsConfig.httpFetchTimeout
        this.logger.debug('fetching %s (timeout %d ms)', url, timeout)
        return fetch(url, {
            timeout,
            ...init
        } as any)
    }
}
