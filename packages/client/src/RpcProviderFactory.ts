import { ConfigInjectionToken, StrictStreamrClientConfig } from './Config'
import type { Provider } from '@ethersproject/providers'
import type { ConnectionInfo } from '@ethersproject/web'
import { LoggingStaticJsonRpcProvider } from './utils/LoggingStaticJsonRpcProvider'
import { inject, Lifecycle, scoped } from 'tsyringe'

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
            this.providers = this.config.contracts.streamRegistryChainRPCs.rpcs.map((c: ConnectionInfo) => {
                const provider = new LoggingStaticJsonRpcProvider({
                    ...c,
                    timeout
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
