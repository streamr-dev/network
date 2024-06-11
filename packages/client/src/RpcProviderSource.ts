import type { Provider } from 'ethers'
import { FallbackProvider, FetchRequest } from 'ethers'
import { Lifecycle, inject, scoped } from 'tsyringe'
import { ConfigInjectionToken, StrictStreamrClientConfig } from './Config'
import { LoggingJsonRpcProvider } from './utils/LoggingJsonRpcProvider'
import { config as CHAIN_CONFIG } from '@streamr/config'

export const QUORUM = 2

function isDevChain(config: Pick<StrictStreamrClientConfig, 'contracts'>): boolean {
    return config.contracts.ethereumNetwork.chainId === CHAIN_CONFIG.dev2.id
}

const formJsonRpcApiProviderOptions = (config: Pick<StrictStreamrClientConfig, 'contracts'>) => {
    return {
        staticNetwork: true,
        batchStallTime: isDevChain(config) ? 0 : undefined, // Don't batch requests, send them immediately
        cacheTimeout: isDevChain(config) ? -1 : undefined   // Do not employ result caching
    }
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
            const opts = formJsonRpcApiProviderOptions(this.config)
            const providers = this.config.contracts.rpcs.map((c) => {
                const fetchRequest = new FetchRequest(c.url)
                fetchRequest.retryFunc = async () => false
                // eslint-disable-next-line no-underscore-dangle
                fetchRequest.timeout = this.config._timeouts.jsonRpcTimeout
                return new LoggingJsonRpcProvider(fetchRequest, this.config.contracts.ethereumNetwork.chainId, opts)
            })
            this.provider = new FallbackProvider(providers, this.config.contracts.ethereumNetwork.chainId, {
                quorum: Math.min(QUORUM, this.config.contracts.rpcs.length),
                cacheTimeout: opts.cacheTimeout
            })
        }
        return this.provider
    }

    // TODO reduce copy-paste?
    getEventProviders(): Provider[] {
        return this.config.contracts.rpcs.map((c) => {
            const f = new FetchRequest(c.url)
            f.retryFunc = async () => false
            // eslint-disable-next-line no-underscore-dangle
            f.timeout = this.config._timeouts.jsonRpcTimeout
            const opts = formJsonRpcApiProviderOptions(this.config)
            return new LoggingJsonRpcProvider(f, this.config.contracts.ethereumNetwork.chainId, opts)
        })
    }
}
