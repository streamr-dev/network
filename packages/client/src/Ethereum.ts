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

export const getMainnetProviders = (config: Pick<StrictStreamrClientConfig, 'contracts'>): Provider[] => {
    return getRpcProviders(config.contracts.mainChainRPCs, config.contracts.pollInterval)
}

export const getStreamRegistryChainProviders = (config: Pick<StrictStreamrClientConfig, 'contracts'>): Provider[] => {
    return getRpcProviders(config.contracts.streamRegistryChainRPCs, config.contracts.pollInterval)
}

const getRpcProviders = (connectionInfo: ChainConnectionInfo, pollInterval?: number): Provider[] => {
    return connectionInfo.rpcs.map((c: ConnectionInfo) => {
        const provider = new JsonRpcProvider(c)
        if (pollInterval !== undefined) {
            provider.pollingInterval = pollInterval
        }
        return provider
    })
}

export const getStreamRegistryOverrides = (config: Pick<StrictStreamrClientConfig, 'contracts'>): Overrides => {
    const primaryProvider = getStreamRegistryChainProviders(config)[0]
    return getOverrides(config.contracts.streamRegistryChainRPCs.name ?? 'polygon', primaryProvider, config)
}

/**
 * Apply the gasPriceStrategy to the estimated gas price, if given
 * Ethers.js will resolve the gas price promise before sending the tx
 */
const getOverrides = (chainName: string, provider: Provider, config: Pick<StrictStreamrClientConfig, 'contracts'>): Overrides => {
    const chainConfig = config.contracts.ethereumNetworks[chainName]
    if (chainConfig === undefined) { return {} }
    const overrides = chainConfig.overrides ?? {}
    if (chainConfig.highGasPriceStrategy) {
        const gasPriceStrategy = (estimatedGasPrice: BigNumber) => estimatedGasPrice.add('10000000000') 
        return {
            ...overrides,
            gasPrice: provider.getGasPrice().then(gasPriceStrategy)
        }
    }
    return overrides
}
