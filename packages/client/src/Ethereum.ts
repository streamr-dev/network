/**
 * Config and utilities for interating with identity & Ethereum chain.
 */
import { scoped, Lifecycle, inject } from 'tsyringe'
import { Wallet } from '@ethersproject/wallet'
import { getDefaultProvider, JsonRpcProvider, Web3Provider } from '@ethersproject/providers'
import type { ExternalProvider, Provider } from '@ethersproject/providers'
import type { Signer } from '@ethersproject/abstract-signer'
import type { BigNumber } from '@ethersproject/bignumber'
import { computeAddress } from '@ethersproject/transactions'
import { getAddress } from '@ethersproject/address'
import type { ConnectionInfo } from '@ethersproject/web'
import type { Overrides } from '@ethersproject/contracts'

import { Config } from './Config'
import { EthereumAddress } from 'streamr-client-protocol'

type Without<T, U> = { [P in Exclude<keyof T, keyof U>]?: never }
type XOR<T, U> = (T | U) extends object ? (Without<T, U> & U) | (Without<U, T> & T) : T | U
type ChainConnectionInfo = ConnectionInfo & { chainId?: number, name?: string }

export type ProviderConfig = ExternalProvider

// Auth Config

export type ProviderAuthConfig = {
    ethereum: ProviderConfig
}

export type PrivateKeyAuthConfig = {
    privateKey: string,
    // The address property is not used. It is included to make the object
    // compatible with StreamrClient.generateEthereumAccount(), as we typically
    // use that method to generate the client "auth" option.
    address?: string
}

export type SessionTokenAuthConfig = {
    sessionToken: string
}

// Deprecated Auth Config
export type APIKeyAuthConfig = {
    apiKey: string
}

export type UsernamePasswordAuthConfig = {
    username: string
    password: string
}

export type UnauthenticatedAuthConfig = XOR<{}, { unauthenticated: true }>

export type DeprecatedAuthConfig = XOR<APIKeyAuthConfig, UsernamePasswordAuthConfig>

export type AuthenticatedConfig = XOR<ProviderAuthConfig, PrivateKeyAuthConfig> & Partial<SessionTokenAuthConfig>
export type AuthConfig = XOR<AuthenticatedConfig, UnauthenticatedAuthConfig>
export type AllAuthConfig = XOR<AuthConfig, DeprecatedAuthConfig>

// Ethereum Config

// these should come from ETH-184 config package when it's ready
type EthereumNetworkConfig = {
    chainId: number
    overrides?: Overrides
    gasPriceStrategy?: (estimatedGasPrice: BigNumber) => BigNumber
}

export abstract class EthereumConfig {
    abstract dataUnionBinanceWithdrawalChainRPCs: ChainConnectionInfo[]
    // address on sidechain
    abstract binanceAdapterAddress: EthereumAddress
    // AMB address on BSC. used to port TXs to BSC
    abstract binanceSmartChainAMBAddress: EthereumAddress
    abstract withdrawServerUrl: string
    abstract mainChainRPCs?: ConnectionInfo[]
    abstract dataUnionChainRPCs: ChainConnectionInfo[]
    abstract tokenAddress: EthereumAddress
    abstract tokenSidechainAddress: EthereumAddress
    abstract streamRegistryChainRPCs: ChainConnectionInfo[]

    // most of the above should go into ethereumNetworks configs once ETH-184 is ready
    abstract ethereumNetworks?: {
        [networkName: string]: EthereumNetworkConfig
    }
}

@scoped(Lifecycle.ContainerScoped)
class StreamrEthereum {
    static generateEthereumAccount() {
        const wallet = Wallet.createRandom()
        return {
            address: wallet.address,
            privateKey: wallet.privateKey,
        }
    }

    _getAddress?: () => Promise<string>
    _getSigner?: () => Signer
    _getDataUnionChainSigner?: () => Promise<Signer>
    _getStreamRegistryChainSigner?: () => Promise<Signer>

    constructor(
        @inject(Config.Auth) authConfig: AllAuthConfig,
        @inject(Config.Ethereum) private ethereumConfig: EthereumConfig
    ) {
        if ('privateKey' in authConfig && authConfig.privateKey) {
            const key = authConfig.privateKey
            const address = getAddress(computeAddress(key))
            this._getAddress = async () => address
            this._getSigner = () => new Wallet(key, this.getMainnetProvider())
            this._getDataUnionChainSigner = async () => new Wallet(key, this.getDataUnionChainProvider())
            this._getStreamRegistryChainSigner = async () => new Wallet(key, this.getStreamRegistryChainProvider())
        } else if ('ethereum' in authConfig && authConfig.ethereum) {
            const { ethereum } = authConfig
            this._getAddress = async () => {
                try {
                    if (!(ethereumConfig && 'request' in ethereum && typeof ethereum.request === 'function')) {
                        throw new Error(`invalid ethereum provider ${ethereumConfig}`)
                    }
                    const accounts = await ethereum.request({ method: 'eth_requestAccounts' })
                    const account = getAddress(accounts[0]) // convert to checksum case
                    return account
                } catch {
                    throw new Error('no addresses connected+selected in Metamask')
                }
            }
            this._getSigner = () => {
                const metamaskProvider = new Web3Provider(ethereum)
                const metamaskSigner = metamaskProvider.getSigner()
                return metamaskSigner
            }
            this._getDataUnionChainSigner = async () => {
                if (!ethereumConfig.dataUnionChainRPCs || !ethereumConfig.dataUnionChainRPCs[0].chainId) {
                    throw new Error('Streamr dataUnionChainRPC not configured (with chainId) in the StreamrClient options!')
                }

                const metamaskProvider = new Web3Provider(ethereum)
                const { chainId } = await metamaskProvider.getNetwork()
                if (chainId !== ethereumConfig.dataUnionChainRPCs[0].chainId) {
                    const sideChainId = ethereumConfig.dataUnionChainRPCs[0].chainId
                    throw new Error(
                        `Please connect Metamask to Ethereum blockchain with chainId ${sideChainId}: current chainId is ${chainId}`
                    )
                }
                const metamaskSigner = metamaskProvider.getSigner()
                return metamaskSigner
            }
            this._getStreamRegistryChainSigner = async () => {
                if (!ethereumConfig.streamRegistryChainRPCs || !ethereumConfig.streamRegistryChainRPCs[0].chainId) {
                    throw new Error('Streamr streamRegistryChainRPC not configured (with chainId) in the StreamrClient options!')
                }

                const metamaskProvider = new Web3Provider(ethereum)
                const { chainId } = await metamaskProvider.getNetwork()
                if (chainId !== ethereumConfig.streamRegistryChainRPCs[0].chainId) {
                    const sideChainId = ethereumConfig.streamRegistryChainRPCs[0].chainId
                    throw new Error(
                        `Please connect Metamask to Ethereum blockchain with chainId ${sideChainId}: current chainId is ${chainId}`
                    )
                }
                const metamaskSigner = metamaskProvider.getSigner()
                return metamaskSigner
            }

            // TODO: handle events
            // ethereum.on('accountsChanged', (accounts) => { })
            // https://docs.metamask.io/guide/ethereum-provider.html#events says:
            //   "We recommend reloading the page unless you have a very good reason not to"
            //   Of course we can't and won't do that, but if we need something chain-dependent...
            // ethereum.on('chainChanged', (chainId) => { window.location.reload() });
        }
    }

    isAuthenticated() {
        return (this._getAddress !== undefined)
    }

    canEncrypt() {
        return !!(this._getAddress && this._getSigner)
    }

    async getAddress(): Promise<string> {
        if (!this._getAddress) {
            // _getAddress is assigned in constructor
            throw new Error('StreamrClient is not authenticated with private key')
        }

        return (await this._getAddress()).toLowerCase()
    }

    getSigner(): Signer {
        if (!this._getSigner) {
            // _getSigner is assigned in constructor
            throw new Error("StreamrClient not authenticated! Can't send transactions or sign messages.")
        }

        return this._getSigner()
    }

    async getDataUnionChainSigner(): Promise<Signer> {
        if (!this._getDataUnionChainSigner) {
            // _getDataUnionChainSigner is assigned in constructor
            throw new Error("StreamrClient not authenticated! Can't send transactions or sign messages.")
        }

        return this._getDataUnionChainSigner()
    }

    async getStreamRegistryChainSigner(): Promise<Signer> {
        if (!this._getStreamRegistryChainSigner) {
            // _getDataUnionChainSigner is assigned in constructor
            throw new Error("StreamrClient not authenticated! Can't send transactions or sign messages.")
        }
        return this._getStreamRegistryChainSigner()
    }

    /** @returns Ethers.js Provider, a connection to the Ethereum network (mainnet) */
    getMainnetProvider(): Provider {
        return this.getAllMainnetProviders()[0]
    }

    /** @returns Array of Ethers.js Providers, connections to the Ethereum network (mainnet) */
    getAllMainnetProviders(): Provider[] {
        if (!this.ethereumConfig.mainChainRPCs || !this.ethereumConfig.mainChainRPCs.length) {
            return [getDefaultProvider()]
        }

        return this.ethereumConfig.mainChainRPCs.map((config: ConnectionInfo) => {
            return new JsonRpcProvider(config)
        })
    }

    /** @returns Ethers.js Provider, a connection to the Ethereum network (mainnet) */
    getBinanceProvider(): Provider {
        return this.getAllBinanceProviders()[0]
    }

    /** @returns Array of Ethers.js Provider, connections to Binance Smart Chain */
    getAllBinanceProviders(): Provider[] {
        if (!this.ethereumConfig.dataUnionBinanceWithdrawalChainRPCs
            || !this.ethereumConfig.dataUnionBinanceWithdrawalChainRPCs.length) {
            throw new Error('StreamrClientEthereumConfig has no data union binance withdrawal configuration.')
        }
        return this.ethereumConfig.dataUnionBinanceWithdrawalChainRPCs.map((config: ConnectionInfo) => {
            return new JsonRpcProvider(config)
        })
    }

    /** @returns Ethers.js Provider, a connection to the Ethereum network (mainnet) */
    getDataUnionChainProvider(): Provider {
        return this.getAllDataUnionChainProviders()[0]
    }

    /** @returns Array of Ethers.js Provider, connections to the Streamr EVM sidechain */
    getAllDataUnionChainProviders(): Provider[] {
        if (!this.ethereumConfig.dataUnionChainRPCs || !this.ethereumConfig.dataUnionChainRPCs.length) {
            throw new Error('EthereumConfig has no dataunion chain configuration.')
        }

        return this.ethereumConfig.dataUnionChainRPCs.map((config: ConnectionInfo) => {
            return new JsonRpcProvider(config)
        })
    }

    /** @returns Ethers.js Provider, a connection to the Ethereum network (mainnet) */
    getStreamRegistryChainProvider(): Provider {
        return this.getAllStreamRegistryChainProviders()[0]
    }

    /** @returns Array of Ethers.js Providers, connections to the Stream Registry Chain */
    getAllStreamRegistryChainProviders(): Provider[] {
        if (!this.ethereumConfig.streamRegistryChainRPCs || !this.ethereumConfig.streamRegistryChainRPCs.length) {
            throw new Error('EthereumConfig has no streamRegistryChainRPC configuration.')
        }

        return this.ethereumConfig.streamRegistryChainRPCs.map((config: ConnectionInfo) => {
            return new JsonRpcProvider(config)
        })
    }

    getMainnetOverrides(): Overrides {
        return this.getOverrides('ethereum', this.getMainnetProvider())
    }

    getBinanceOverrides(): Overrides {
        return this.getOverrides(this.ethereumConfig?.dataUnionBinanceWithdrawalChainRPCs[0]?.name ?? 'binance', this.getBinanceProvider())
    }

    getDataUnionOverrides(): Overrides {
        return this.getOverrides(this.ethereumConfig?.dataUnionChainRPCs[0]?.name ?? 'gnosis', this.getDataUnionChainProvider())
    }

    getStreamRegistryOverrides(): Overrides {
        return this.getOverrides(this.ethereumConfig?.streamRegistryChainRPCs[0]?.name ?? 'polygon', this.getStreamRegistryChainProvider())
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

export default StreamrEthereum
