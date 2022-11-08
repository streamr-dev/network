/**
 * Config and utilities for interating with identity & Ethereum chain.
 */
import { Wallet } from '@ethersproject/wallet'
import { getDefaultProvider, JsonRpcProvider } from '@ethersproject/providers'
import type { Provider } from '@ethersproject/providers'
import type { ConnectionInfo } from '@ethersproject/web'
import type { Overrides } from '@ethersproject/contracts'
import { StrictStreamrClientConfig } from './Config'

export const generateEthereumAccount = (): { address: string, privateKey: string } => {
    const wallet = Wallet.createRandom()
    return {
        address: wallet.address,
        privateKey: wallet.privateKey,
    }
}

export const getMainnetProvider = (config: Pick<StrictStreamrClientConfig, 'contracts'>): Provider => {
    return getAllMainnetProviders(config)[0]
}

const getAllMainnetProviders = (config: Pick<StrictStreamrClientConfig, 'contracts'>): Provider[] => {
    if (!config.contracts.mainChainRPCs || !config.contracts.mainChainRPCs.rpcs.length) {
        return [getDefaultProvider()]
    }
    return config.contracts.mainChainRPCs.rpcs.map((c: ConnectionInfo) => {
        return new JsonRpcProvider(c)
    })
}

export const getStreamRegistryChainProvider = (config: Pick<StrictStreamrClientConfig, 'contracts'>): Provider => {
    return getAllStreamRegistryChainProviders(config)[0]
}

export const getAllStreamRegistryChainProviders = (config: Pick<StrictStreamrClientConfig, 'contracts'>): Provider[] => {
    if (!config.contracts.streamRegistryChainRPCs || !config.contracts.streamRegistryChainRPCs.rpcs.length) {
        throw new Error('client config has no streamRegistryChainRPC configuration.')
    }
    return config.contracts.streamRegistryChainRPCs.rpcs.map((c: ConnectionInfo) => {
        return new JsonRpcProvider(c)
    })
}

export const getStreamRegistryOverrides = (config: Pick<StrictStreamrClientConfig, 'contracts'>): Overrides => {
    return getOverrides(config.contracts.streamRegistryChainRPCs?.name ?? 'polygon', getStreamRegistryChainProvider(config), config)
}

/**
 * Apply the gasPriceStrategy to the estimated gas price, if given
 * Ethers.js will resolve the gas price promise before sending the tx
 */
const getOverrides = (chainName: string, provider: Provider, config: Pick<StrictStreamrClientConfig, 'contracts'>): Overrides => {
    const chainConfig = config.contracts.ethereumNetworks?.[chainName]
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
