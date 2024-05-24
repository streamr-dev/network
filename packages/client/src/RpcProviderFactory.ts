import { ConfigInjectionToken, StrictStreamrClientConfig } from './Config'
import type { Provider } from 'ethers'
import { LoggingJsonRpcProvider } from './utils/LoggingJsonRpcProvider'
import { inject, Lifecycle, scoped } from 'tsyringe'
import { FetchRequest, FallbackProvider } from 'ethers'

export const QUORUM = 2

function isDevChain(config: Pick<StrictStreamrClientConfig, 'contracts'>): boolean {
    return config.contracts.streamRegistryChainRPCs?.name === 'dev2'
}

// TODO: do we even need this class anymore?
@scoped(Lifecycle.ContainerScoped)
export class RpcProviderFactory {
    private readonly config: Pick<StrictStreamrClientConfig, 'contracts' | '_timeouts'>
    private provider?: Provider

    constructor(@inject(ConfigInjectionToken) config: Pick<StrictStreamrClientConfig, 'contracts' | '_timeouts'>) {
        this.config = config
    }

    getProvider(): Provider {
        if (this.provider === undefined) {
            // eslint-disable-next-line no-underscore-dangle
            const timeout = this.config._timeouts.jsonRpcTimeout
            const pollInterval = this.config.contracts.pollInterval
            const providers = this.config.contracts.streamRegistryChainRPCs.rpcs.map((c) => {
                const fetchRequest = new FetchRequest(c.url)
                fetchRequest.timeout = timeout
                return new LoggingJsonRpcProvider(fetchRequest, {
                    chainId: this.config.contracts.streamRegistryChainRPCs.chainId,
                    name: this.config.contracts.streamRegistryChainRPCs.name
                }, {
                    staticNetwork: true,
                    pollingInterval: pollInterval,
                    batchStallTime: isDevChain(this.config) ? 0 : undefined, // Don't batch requests, send them immediately
                    cacheTimeout: isDevChain(this.config) ? -1 : undefined   // Do not employ result caching
                })
            })
            this.provider = new FallbackProvider(providers, {
                chainId: this.config.contracts.streamRegistryChainRPCs.chainId,
                name: this.config.contracts.streamRegistryChainRPCs.name
            }, {
                quorum: Math.min(QUORUM, this.config.contracts.streamRegistryChainRPCs?.rpcs.length),
                pollingInterval: pollInterval,
                cacheTimeout: isDevChain(this.config) ? -1 : undefined   // Do not employ result caching
            })
        }
        return this.provider
    }
}
