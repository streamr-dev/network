/**
 * Config and utilities for interating with identity & Ethereum chain.
 */
import { Wallet } from '@ethersproject/wallet'
import { JsonRpcProvider } from '@ethersproject/providers'
import type { Provider } from '@ethersproject/providers'
import type { ConnectionInfo } from '@ethersproject/web'
import type { Overrides } from '@ethersproject/contracts'
import type { BigNumber } from '@ethersproject/bignumber'
import { ChainConnectionInfo, StrictStreamrClientConfig } from './Config'

export const generateEthereumAccount = (): { address: string, privateKey: string } => {
    const wallet = Wallet.createRandom()
    return {
        address: wallet.address,
        privateKey: wallet.privateKey,
    }
}

// TODO maybe we should use all providers?
export const getMainnetProvider = (config: Pick<StrictStreamrClientConfig, 'contracts'>): Provider => {
    const providers = getRpcProviders(config.contracts.mainChainRPCs)
    return providers[0]
}

export const getStreamRegistryChainProvider = (config: Pick<StrictStreamrClientConfig, 'contracts'>): Provider => {
    return getAllStreamRegistryChainProviders(config)[0]
}

export const getAllStreamRegistryChainProviders = (config: Pick<StrictStreamrClientConfig, 'contracts'>): Provider[] => {
    return getRpcProviders(config.contracts.streamRegistryChainRPCs)
}

const getRpcProviders = (connectionInfo: ChainConnectionInfo): Provider[] => {
    return connectionInfo.rpcs.map((c: ConnectionInfo) => {
        return new JsonRpcProvider(c)
    })
}

export const getStreamRegistryOverrides = (config: Pick<StrictStreamrClientConfig, 'contracts'>): Overrides => {
    return getOverrides(config.contracts.streamRegistryChainRPCs.name ?? 'polygon', getStreamRegistryChainProvider(config), config)
}

/**
 * Apply the gasPriceStrategy to the estimated gas price, if given
 * Ethers.js will resolve the gas price promise before sending the tx
 */
const getOverrides = (chainName: string, provider: Provider, config: Pick<StrictStreamrClientConfig, 'contracts'>): Overrides => {
    const chainConfig = config.contracts.ethereumNetworks[chainName]
    if (chainConfig === undefined) { return {} }
    const overrides = chainConfig.overrides ?? {}
    const gasPriceStrategy = chainConfig.highGasPriceStrategy
        ? (estimatedGasPrice: BigNumber) => estimatedGasPrice.add('10000000000') 
        : chainConfig.gasPriceStrategy
    if (gasPriceStrategy !== undefined) {
        return {
            ...overrides,
            gasPrice: provider.getGasPrice().then(gasPriceStrategy)
        }
    }
    return overrides
}
