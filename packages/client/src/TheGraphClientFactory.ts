import { Lifecycle, inject, scoped } from 'tsyringe'
import { ConfigInjectionToken, StrictStreamrClientConfig } from './Config'
import { HttpFetcher } from './utils/HttpFetcher'
import { LoggerFactory } from './utils/LoggerFactory'
import { TheGraphClient } from './utils/TheGraphClient'

// TODO maybe we could create an instance of TheGraphClient in client constructor,
// and put that to DI there. ContractFactory could emit configContractEvent which
// this instance listens and calls updateRequiredBlockNumber for the instance

@scoped(Lifecycle.ContainerScoped)
export class TheGraphClientFactory {

    private readonly instance: TheGraphClient

    constructor(
        loggerFactory: LoggerFactory,
        httpFetcher: HttpFetcher,
        @inject(ConfigInjectionToken) config: Pick<StrictStreamrClientConfig, 'contracts' | '_timeouts'>
    ) {
        this.instance = new TheGraphClient(
            config.contracts.theGraphUrl,
            loggerFactory,
            (url: string, init?: Record<string, unknown>) => httpFetcher.fetch(url, init),
            config
        )
    }

    getInstance(): TheGraphClient {
        return this.instance
    }
}
