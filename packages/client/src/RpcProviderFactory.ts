import { ConfigInjectionToken, StrictStreamrClientConfig } from './Config'
import type { Provider } from 'ethers'
import { LoggingJsonRpcProvider } from './utils/LoggingJsonRpcProvider'
import { inject, Lifecycle, scoped } from 'tsyringe'
import { FetchRequest } from 'ethers'

function isDevChain(config: Pick<StrictStreamrClientConfig, 'contracts'>): boolean {
    return config.contracts.streamRegistryChainRPCs?.name === 'dev2'
}

@scoped(Lifecycle.ContainerScoped)
export class RpcProviderFactory {
    private readonly config: Pick<StrictStreamrClientConfig, 'contracts' | '_timeouts'>
    private providers?: Provider[]

    constructor(@inject(ConfigInjectionToken) config: Pick<StrictStreamrClientConfig, 'contracts' | '_timeouts'>) {
        this.config = config
    }

    getProviders(): Provider[] {
        if (this.providers === undefined) {
            // eslint-disable-next-line no-underscore-dangle
            const timeout = this.config._timeouts.jsonRpcTimeout
            const pollInterval = this.config.contracts.pollInterval
            this.providers = this.config.contracts.streamRegistryChainRPCs.rpcs.map((c) => {
                const fetchRequest = new FetchRequest(c.url)
                fetchRequest.timeout = timeout
                const provider = new LoggingJsonRpcProvider(fetchRequest, {
                    chainId: this.config.contracts.streamRegistryChainRPCs?.chainId,
                    name: this.config.contracts.streamRegistryChainRPCs?.name
                }, {
                    staticNetwork: true,
                    batchStallTime: isDevChain(this.config) ? 0 : undefined, // Don't batch requests, send them immediately
                    cacheTimeout: isDevChain(this.config) ? -1 : undefined   // Do not employ result caching
                })
                if (pollInterval !== undefined) {
                    provider.pollingInterval = pollInterval
                }
                return provider
            })
        }
        return this.providers
    }

    getPrimaryProvider(): Provider {
        return this.getProviders()[0]
    }
}
