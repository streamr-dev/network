/**
 * Config and utilities for interating with identity & Ethereum chain.
 */
import { scoped, Lifecycle, inject } from 'tsyringe'
import { Wallet } from '@ethersproject/wallet'
import { getDefaultProvider, JsonRpcProvider } from '@ethersproject/providers'
import type { ExternalProvider, Provider } from '@ethersproject/providers'
import type { BigNumber } from '@ethersproject/bignumber'
import type { ConnectionInfo } from '@ethersproject/web'
import type { Overrides } from '@ethersproject/contracts'

import { ConfigInjectionToken } from './Config'
import { EthereumAddress } from 'streamr-client-protocol'

export type Without<T, U> = { [P in Exclude<keyof T, keyof U>]?: never }
export type XOR<T, U> = (T | U) extends object ? (Without<T, U> & U) | (Without<U, T> & T) : T | U
export type ChainConnectionInfo = { rpcs: ConnectionInfo[], chainId?: number, name?: string }

export type ProviderConfig = ExternalProvider

// Auth Config

// TODO move all these AuthConfig types to Authentication

export type ProviderAuthConfig = {
    ethereum: ProviderConfig
}

export type PrivateKeyAuthConfig = {
    privateKey: string,
    // The address property is not used. It is included to make the object
    // compatible with StreamrClient.generateEthereumAccount(), as we typically
    // use that method to generate the client "auth" option.
    address?: EthereumAddress
}

// eslint-disable-next-line @typescript-eslint/ban-types
export type UnauthenticatedAuthConfig = XOR<{}, { unauthenticated: true }>

export type AuthenticatedConfig = XOR<ProviderAuthConfig, PrivateKeyAuthConfig>
export type AuthConfig = XOR<AuthenticatedConfig, UnauthenticatedAuthConfig>

// Ethereum Config

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
