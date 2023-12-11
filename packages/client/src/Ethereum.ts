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

/**
 * Apply the gasPriceStrategy to the estimated gas price, if given
 * Ethers.js will resolve the gas price promise before sending the tx
 */
export const getEthersOverrides = (config: Pick<StrictStreamrClientConfig, 'contracts'>): Overrides => {
    const primaryProvider = getStreamRegistryChainProviders(config)[0]
    const chainConfig = config.contracts.ethereumNetwork
    const overrides = chainConfig.overrides ?? {}
    if (chainConfig.highGasPriceStrategy) {
        const gasPriceStrategy = (estimatedGasPrice: BigNumber) => estimatedGasPrice.add('10000000000') 
        return {
            ...overrides,
            gasPrice: primaryProvider.getGasPrice().then(gasPriceStrategy)
        }
    }
    return overrides
}
