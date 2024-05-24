/**
 * Config and utilities for interating with identity & Ethereum chain.
 */
import { Wallet } from 'ethers'
import type { Overrides } from 'ethers'
import { StrictStreamrClientConfig } from './Config'
import { RpcProviderFactory } from './RpcProviderFactory'
import { FeeData } from 'ethers'

export const generateEthereumAccount = (): { address: string, privateKey: string } => {
    const wallet = Wallet.createRandom()
    return {
        address: wallet.address,
        privateKey: wallet.privateKey,
    }
}

/**
 * Apply the gasPriceStrategy to the estimated gas price, if given
 * Ethers.js will resolve the gas price promise before sending the tx
 */
export const getEthersOverrides = async (
    rpcProviderFactory: RpcProviderFactory, // TODO: can this be done somewhat cleaner?
    config: Pick<StrictStreamrClientConfig, 'contracts' | '_timeouts'>
): Promise<Overrides> => {
    const chainConfig = config.contracts.ethereumNetwork
    const overrides = chainConfig.overrides ?? {}
    if ((chainConfig.highGasPriceStrategy) && (chainConfig.overrides?.gasPrice === undefined)) {
        const primaryProvider = rpcProviderFactory.getPrimaryProvider()
        const feeData = await primaryProvider.getFeeData()
        const gasPriceStrategy = (feeData: FeeData) => {
            const INCREASE_PERCENTAGE = 30
            return feeData.gasPrice === null ? undefined : feeData.gasPrice * BigInt(100 + INCREASE_PERCENTAGE) / 100n
        }
        return {
            ...overrides,
            gasPrice: gasPriceStrategy(feeData)
        }
    }
    return overrides
}
