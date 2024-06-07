import type { Provider } from 'ethers'
import { FallbackProvider, FetchRequest, JsonRpcProvider } from 'ethers'
import { Lifecycle, inject, scoped } from 'tsyringe'
import { ConfigInjectionToken, StrictStreamrClientConfig } from './Config'
import { LoggingJsonRpcProvider } from './utils/LoggingJsonRpcProvider'

export const QUORUM = 2

function isDevChain(config: Pick<StrictStreamrClientConfig, 'contracts'>): boolean {
    return config.contracts.streamRegistryChainRPCs?.name === 'dev2'
}

@scoped(Lifecycle.ContainerScoped)
export class RpcProviderSource {
    private readonly config: Pick<StrictStreamrClientConfig, 'contracts' | '_timeouts'>
    private provider?: Provider

    constructor(@inject(ConfigInjectionToken) config: Pick<StrictStreamrClientConfig, 'contracts' | '_timeouts'>) {
        this.config = config
    }

    getProvider(): Provider {
        if (this.provider === undefined) {
            // eslint-disable-next-line no-underscore-dangle
            const timeout = this.config._timeouts.jsonRpcTimeout
            const providers = this.config.contracts.streamRegistryChainRPCs.rpcs.map((c) => {
                const fetchRequest = new FetchRequest(c.url)
                fetchRequest.timeout = timeout
                return new LoggingJsonRpcProvider(fetchRequest, {
                    chainId: this.config.contracts.streamRegistryChainRPCs.chainId,
                    name: this.config.contracts.streamRegistryChainRPCs.name
                }, {
                    staticNetwork: true,
                    batchStallTime: isDevChain(this.config) ? 0 : undefined, // Don't batch requests, send them immediately
                    cacheTimeout: isDevChain(this.config) ? -1 : undefined   // Do not employ result caching
                })
            })
            this.provider = new FallbackProvider(providers, {
                chainId: this.config.contracts.streamRegistryChainRPCs.chainId,
                name: this.config.contracts.streamRegistryChainRPCs.name
            }, {
                quorum: Math.min(QUORUM, this.config.contracts.streamRegistryChainRPCs?.rpcs.length),
                cacheTimeout: isDevChain(this.config) ? -1 : undefined   // Do not employ result caching
            })
        }
        return this.provider
    }

    // TODO reduce copy-paste?
    getEventProviders(): Provider[] {
        return this.config.contracts.streamRegistryChainRPCs.rpcs.map((c) => {
            const f = new FetchRequest(c.url)
            f.retryFunc = async () => false  // TODO use this line also for providers in the fallbackprovider?
            return new JsonRpcProvider(f, {
                chainId: this.config.contracts.streamRegistryChainRPCs.chainId,
                name: this.config.contracts.streamRegistryChainRPCs.name
            }, {
                staticNetwork: true
            })
        })
    }
}
