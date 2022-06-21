/**
 * Config and utilities for interating with identity & Ethereum chain.
 */
import { scoped, Lifecycle, inject } from 'tsyringe'
import { Wallet } from '@ethersproject/wallet'
import { getDefaultProvider, JsonRpcProvider } from '@ethersproject/providers'
import type { Provider } from '@ethersproject/providers'
import type { BigNumber } from '@ethersproject/bignumber'
import type { ConnectionInfo } from '@ethersproject/web'
import type { Overrides } from '@ethersproject/contracts'

import { ConfigInjectionToken } from './Config'

export type ChainConnectionInfo = { rpcs: ConnectionInfo[], chainId?: number, name?: string }

// these should come from ETH-184 config package when it's ready
export type EthereumNetworkConfig = {
    chainId: number
    overrides?: Overrides
    gasPriceStrategy?: (estimatedGasPrice: BigNumber) => BigNumber
}

export type EthereumConfig = {
    mainChainRPCs?: ChainConnectionInfo
    streamRegistryChainRPCs: ChainConnectionInfo

    // most of the above should go into ethereumNetworks configs once ETH-184 is ready
    ethereumNetworks?: {
        [networkName: string]: EthereumNetworkConfig
    }
}

@scoped(Lifecycle.ContainerScoped)
export class Ethereum {
    static generateEthereumAccount(): { address: string; privateKey: string } {
        const wallet = Wallet.createRandom()
        return {
            address: wallet.address,
            privateKey: wallet.privateKey,
        }
    }

    private ethereumConfig: EthereumConfig

    constructor(
        @inject(ConfigInjectionToken.Ethereum) ethereumConfig: EthereumConfig
    ) {
        this.ethereumConfig = ethereumConfig
    }

    /**
     * @returns Ethers.js Provider, a connection to the Ethereum network (mainnet)
     */
    getMainnetProvider(): Provider {
        return this.getAllMainnetProviders()[0]
    }

    /**
     * @returns Array of Ethers.js Providers, connections to the Ethereum network (mainnet)
     */
    getAllMainnetProviders(): Provider[] {
        if (!this.ethereumConfig.mainChainRPCs || !this.ethereumConfig.mainChainRPCs.rpcs.length) {
            return [getDefaultProvider()]
        }

        return this.ethereumConfig.mainChainRPCs.rpcs.map((config: ConnectionInfo) => {
            return new JsonRpcProvider(config)
        })
    }

    /**
     * @returns Ethers.js Provider, a connection to the Stream Registry Chain
     */
    getStreamRegistryChainProvider(): Provider {
        return this.getAllStreamRegistryChainProviders()[0]
    }

    /**
     * @returns Array of Ethers.js Providers, connections to the Stream Registry Chain
     */
    getAllStreamRegistryChainProviders(): Provider[] {
        if (!this.ethereumConfig.streamRegistryChainRPCs || !this.ethereumConfig.streamRegistryChainRPCs.rpcs.length) {
            throw new Error('EthereumConfig has no streamRegistryChainRPC configuration.')
        }

        return this.ethereumConfig.streamRegistryChainRPCs.rpcs.map((config: ConnectionInfo) => {
            return new JsonRpcProvider(config)
        })
    }

    getMainnetOverrides(): Overrides {
        return this.getOverrides('ethereum', this.getMainnetProvider())
    }

    getStreamRegistryOverrides(): Overrides {
        return this.getOverrides(this.ethereumConfig?.streamRegistryChainRPCs?.name ?? 'polygon', this.getStreamRegistryChainProvider())
    }

    /**
     * Apply the gasPriceStrategy to the estimated gas price, if given
     * Ethers.js will resolve the gas price promise before sending the tx
     */
    private getOverrides(chainName: string, provider: Provider): Overrides {
        const chainConfig = this.ethereumConfig?.ethereumNetworks?.[chainName]
        if (!chainConfig) { return {} }
        const overrides = chainConfig?.overrides ?? {}
        if (chainConfig.gasPriceStrategy) {
            return {
                ...overrides,
                gasPrice: provider.getGasPrice().then(chainConfig.gasPriceStrategy)
            }
        }
        return overrides
    }
}
