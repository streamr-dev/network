/**
 * Config and utilities for interating with identity & Ethereum chain.
 */
import { Wallet } from '@ethersproject/wallet'
import { ExternalProvider, JsonRpcProvider, Web3Provider } from '@ethersproject/providers'
import type { Provider } from '@ethersproject/providers'
import type { ConnectionInfo } from '@ethersproject/web'
import type { Overrides } from '@ethersproject/contracts'
import type { BigNumber } from '@ethersproject/bignumber'
import { ChainConnectionInfo, StrictStreamrClientConfig } from './Config'
import { Signer } from '@ethersproject/abstract-signer'
import { RelayProvider } from '@opengsn/provider'

export const generateEthereumAccount = (): { address: string, privateKey: string } => {
    const wallet = Wallet.createRandom()
    return {
        address: wallet.address,
        privateKey: wallet.privateKey,
    }
}

export async function initGSNBackedSigner(
    baseProvider: Provider | ExternalProvider,
    address: string,
    privateKey: string | undefined
): Promise<Signer> {
    const gsnProvider = await RelayProvider.newProvider({
        // @ts-expect-error TODO: type issue
        provider: baseProvider,
        config: {
            paymasterAddress: '0x43E69adABC664617EB9C5E19413a335e9cd4A243',
            preferredRelays: ['https://gsn.streamr.network/gsn1'],
            relayLookupWindowBlocks: 9000,
            relayRegistrationLookupBlocks: 9000,
            pastEventsQueryMaxPageSize: 9000,
            auditorsCount: 0,
            loggerConfiguration: { logLevel: 'debug' },
        }
    }).init()
    if (privateKey !== undefined) {
        gsnProvider.addAccount(privateKey)
    }
    const provider = new Web3Provider(gsnProvider as any) // TODO: why is casting needed here?
    return provider.getSigner(address)
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
    if (!config.contracts.experimentalGSN) { // gasPriceStrategy is irrelevant when using GSN (it actually also breaks things)
        const gasPriceStrategy = chainConfig.highGasPriceStrategy
            ? (estimatedGasPrice: BigNumber) => estimatedGasPrice.add('10000000000')
            : chainConfig.gasPriceStrategy
        if (gasPriceStrategy !== undefined) {
            return {
                ...overrides,
                gasPrice: provider.getGasPrice().then(gasPriceStrategy)
            }
        }
    }
    return overrides
}
