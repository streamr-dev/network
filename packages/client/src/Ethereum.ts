/**
 * Config and utilities for interating with identity & Ethereum chain.
 */
import { scoped, Lifecycle, inject } from 'tsyringe'
import { Wallet } from '@ethersproject/wallet'
import { getDefaultProvider, JsonRpcProvider, Web3Provider } from '@ethersproject/providers'
import type { ExternalProvider, Provider } from '@ethersproject/providers'
import type { Signer } from '@ethersproject/abstract-signer'
import { computeAddress } from '@ethersproject/transactions'
import { getAddress } from '@ethersproject/address'
import type { ConnectionInfo } from '@ethersproject/web'
import type { BytesLike } from '@ethersproject/bytes'

import type { EthereumAddress } from './types'
import { Config } from './Config'

type Without<T, U> = { [P in Exclude<keyof T, keyof U>]?: never }
type XOR<T, U> = (T | U) extends object ? (Without<T, U> & U) | (Without<U, T> & T) : T | U

export type ProviderConfig = ExternalProvider

// Auth Config

export type ProviderAuthConfig = {
    ethereum: ProviderConfig
}

export type PrivateKeyAuthConfig = {
    privateKey: BytesLike
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

export abstract class EthereumConfig {
    abstract binanceRPC: ConnectionInfo & { chainId?: number }
    // address on sidechain
    abstract binanceAdapterAddress: EthereumAddress
    // AMB address on BSC. used to port TXs to BSC
    abstract binanceSmartChainAMBAddress: EthereumAddress
    abstract withdrawServerUrl: string
    abstract mainnet?: ConnectionInfo|string
    abstract sidechain: ConnectionInfo & { chainId?: number }
    abstract tokenAddress: EthereumAddress
    abstract tokenSidechainAddress: EthereumAddress
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
    _getSidechainSigner?: () => Promise<Signer>

    constructor(
        @inject(Config.Auth) authConfig: AllAuthConfig,
        @inject(Config.Ethereum) private ethereumConfig: EthereumConfig
    ) {
        if ('privateKey' in authConfig && authConfig.privateKey) {
            const key = authConfig.privateKey
            const address = getAddress(computeAddress(key))
            this._getAddress = async () => address
            this._getSigner = () => new Wallet(key, this.getMainnetProvider())
            this._getSidechainSigner = async () => new Wallet(key, this.getSidechainProvider())
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
            this._getSidechainSigner = async () => {
                if (!ethereumConfig.sidechain || !ethereumConfig.sidechain.chainId) {
                    throw new Error('Streamr sidechain not configured (with chainId) in the StreamrClient options!')
                }

                const metamaskProvider = new Web3Provider(ethereum)
                const { chainId } = await metamaskProvider.getNetwork()
                if (chainId !== ethereumConfig.sidechain.chainId) {
                    const sideChainId = ethereumConfig.sidechain.chainId
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

    canEncrypt() {
        return !!(this._getAddress && this._getSigner)
    }

    async getAddress(): Promise<string> {
        if (!this._getAddress) {
            // _getAddress is assigned in constructor
            throw new Error('StreamrClient is not authenticated with private key')
        }

        return this._getAddress()
    }

    getSigner(): Signer {
        if (!this._getSigner) {
            // _getSigner is assigned in constructor
            throw new Error("StreamrClient not authenticated! Can't send transactions or sign messages.")
        }

        return this._getSigner()
    }

    async getSidechainSigner(): Promise<Signer> {
        if (!this._getSidechainSigner) {
            // _getSidechainSigner is assigned in constructor
            throw new Error("StreamrClient not authenticated! Can't send transactions or sign messages.")
        }

        return this._getSidechainSigner()
    }

    /** @returns Ethers.js Provider, a connection to the Ethereum network (mainnet) */
    getMainnetProvider(): Provider {
        if (!this.ethereumConfig.mainnet) {
            return getDefaultProvider()
        }

        return new JsonRpcProvider(this.ethereumConfig.mainnet)
    }

    /** @returns Ethers.js Provider, a connection to Binance Smart Chain */
    getBinanceProvider(): Provider {
        if (!this.ethereumConfig.binanceRPC) {
            throw new Error('StreamrCliEthereumConfigent has no binance configuration.')
        }
        return new JsonRpcProvider(this.ethereumConfig.binanceRPC)
    }

    /** @returns Ethers.js Provider, a connection to the Streamr EVM sidechain */
    getSidechainProvider(): Provider {
        if (!this.ethereumConfig.sidechain) {
            throw new Error('EthereumConfig has no sidechain configuration.')
        }

        return new JsonRpcProvider(this.ethereumConfig.sidechain)
    }
}

export default StreamrEthereum
