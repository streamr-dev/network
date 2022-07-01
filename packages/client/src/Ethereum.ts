/**
 * Config and utilities for interating with identity & Ethereum chain.
 */
import { Wallet } from '@ethersproject/wallet'
import { getDefaultProvider, JsonRpcProvider } from '@ethersproject/providers'
import type { Provider } from '@ethersproject/providers'
import type { BigNumber } from '@ethersproject/bignumber'
import type { ConnectionInfo } from '@ethersproject/web'
import type { Overrides } from '@ethersproject/contracts'
import { EthereumAddress } from 'streamr-client-protocol'

export type ChainConnectionInfo = { rpcs: ConnectionInfo[], chainId?: number, name?: string }

// these should come from ETH-184 config package when it's ready
export type EthereumNetworkConfig = {
    chainId: number
    overrides?: Overrides
    gasPriceStrategy?: (estimatedGasPrice: BigNumber) => BigNumber
}

export type EthereumConfig = {
    streamRegistryChainAddress: EthereumAddress
    streamStorageRegistryChainAddress: EthereumAddress
    storageNodeRegistryChainAddress: EthereumAddress,
    ensCacheChainAddress: EthereumAddress,
    mainChainRPCs?: ChainConnectionInfo
    streamRegistryChainRPCs: ChainConnectionInfo
    // most of the above should go into ethereumNetworks configs once ETH-184 is ready
    ethereumNetworks?: {
        [networkName: string]: EthereumNetworkConfig
    }
}

export const generateEthereumAccount = (): { address: string; privateKey: string } => {
    const wallet = Wallet.createRandom()
    return {
        address: wallet.address,
        privateKey: wallet.privateKey,
    }
}

export const getMainnetProvider = (config: EthereumConfig): Provider => {
    return getAllMainnetProviders(config)[0]
}

const getAllMainnetProviders = (config: EthereumConfig): Provider[] => {
    if (!config.mainChainRPCs || !config.mainChainRPCs.rpcs.length) {
        return [getDefaultProvider()]
    }
    return config.mainChainRPCs.rpcs.map((c: ConnectionInfo) => {
        return new JsonRpcProvider(c)
    })
}

export const getStreamRegistryChainProvider = (config: EthereumConfig): Provider => {
    return getAllStreamRegistryChainProviders(config)[0]
}

export const getAllStreamRegistryChainProviders = (config: EthereumConfig): Provider[] => {
    if (!config.streamRegistryChainRPCs || !config.streamRegistryChainRPCs.rpcs.length) {
        throw new Error('EthereumConfig has no streamRegistryChainRPC configuration.')
    }
    return config.streamRegistryChainRPCs.rpcs.map((c: ConnectionInfo) => {
        return new JsonRpcProvider(c)
    })
}

export const getStreamRegistryOverrides = (config: EthereumConfig): Overrides => {
    return getOverrides(config.streamRegistryChainRPCs?.name ?? 'polygon', getStreamRegistryChainProvider(config), config)
}

/**
 * Apply the gasPriceStrategy to the estimated gas price, if given
 * Ethers.js will resolve the gas price promise before sending the tx
 */
const getOverrides = (chainName: string, provider: Provider, config: EthereumConfig): Overrides => {
    const chainConfig = config.ethereumNetworks?.[chainName]
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
