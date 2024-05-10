/**
 * Config and utilities for interating with identity & Ethereum chain.
 */
import { Wallet } from '@ethersproject/wallet'
import type { Overrides } from '@ethersproject/contracts'
import type { BigNumber } from '@ethersproject/bignumber'
import { StrictStreamrClientConfig } from './Config'
import { RpcProviderFactory } from './RpcProviderFactory'

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
export const getEthersOverrides = (
    rpcProviderFactory: RpcProviderFactory, // TODO: can this be done somewhat cleaner?
    config: Pick<StrictStreamrClientConfig, 'contracts' | '_timeouts'>
): Overrides => {
    const chainConfig = config.contracts.ethereumNetwork
    const overrides = chainConfig.overrides ?? {}
    if ((chainConfig.highGasPriceStrategy) && (chainConfig.overrides?.gasPrice === undefined)) {
        const primaryProvider = rpcProviderFactory.getPrimaryProvider()
        const gasPriceStrategy = (estimatedGasPrice: BigNumber) => {
            const INCREASE_PERCENTAGE = 30
            return estimatedGasPrice.mul(100 + INCREASE_PERCENTAGE).div(100)
        }
        return {
            ...overrides,
            gasPrice: primaryProvider.getGasPrice().then(gasPriceStrategy)
        }
    }
    return overrides
}
