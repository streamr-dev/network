import { Wallet } from '@ethersproject/wallet'
import { ExternalProvider, getDefaultProvider, JsonRpcProvider, Provider, Web3Provider } from '@ethersproject/providers'
import type { Signer } from '@ethersproject/abstract-signer'
import { computeAddress } from '@ethersproject/transactions'
import { getAddress } from '@ethersproject/address'
import { ConnectionInfo } from '@ethersproject/web'
import { EthereumAddress } from './types'
import { BytesLike } from '@ethersproject/bytes'

export type EthereumConfig = ExternalProvider

// Auth Options

export type ProviderAuthOptions = {
    ethereum: EthereumConfig
}

export type PrivateKeyAuthOptions = {
    privateKey: BytesLike
}

// Deprecated Auth Options
export type APIKeyAuthOptions = {
    apiKey: string
}

export type UsernamePasswordAuthOptions = {
    username: string
    password: string
}

export type UnauthenticatedAuthOptions = {}

export type DeprecatedAuthOptions = APIKeyAuthOptions | UsernamePasswordAuthOptions

export type AuthOptions = ProviderAuthOptions | PrivateKeyAuthOptions | DeprecatedAuthOptions | UnauthenticatedAuthOptions

// Ethereum Options

export type EthereumOptions = {
    binanceRPC: ConnectionInfo & { chainId?: number }
    // address on sidechain
    binanceAdapterAddress: EthereumAddress
    // AMB address on BSC. used to port TXs to BSC
    binanceSmartChainAMBAddress: EthereumAddress
    withdrawServerUrl: string
    mainnet?: ConnectionInfo|string
    sidechain: ConnectionInfo & { chainId?: number }
    tokenAddress: EthereumAddress,
    tokenSidechainAddress: EthereumAddress,
}

export default class StreamrEthereum {
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
    authOptions
    ethereumOptions

    constructor(authOptions: AuthOptions, ethereumOptions: EthereumOptions) {
        this.authOptions = authOptions
        this.ethereumOptions = ethereumOptions
        if ('privateKey' in authOptions) {
            const key = authOptions.privateKey
            const address = getAddress(computeAddress(key))
            this._getAddress = async () => address
            this._getSigner = () => new Wallet(key, this.getMainnetProvider())
            this._getSidechainSigner = async () => new Wallet(key, this.getSidechainProvider())
        } else if ('ethereum' in authOptions && authOptions.ethereum) {
            const ethereumConfig = authOptions.ethereum!
            this._getAddress = async () => {
                try {
                    if (!(ethereumConfig && 'request' in ethereumConfig && typeof ethereumConfig.request === 'function')) {
                        throw new Error(`invalid ethereum provider ${ethereumConfig}`)
                    }
                    const accounts = await ethereumConfig.request({ method: 'eth_requestAccounts' })
                    const account = getAddress(accounts[0]) // convert to checksum case
                    return account
                } catch {
                    throw new Error('no addresses connected+selected in Metamask')
                }
            }
            this._getSigner = () => {
                const metamaskProvider = new Web3Provider(ethereumConfig)
                const metamaskSigner = metamaskProvider.getSigner()
                return metamaskSigner
            }
            this._getSidechainSigner = async () => {
                if (!ethereumOptions.sidechain || !ethereumOptions.sidechain.chainId) {
                    throw new Error('Streamr sidechain not configured (with chainId) in the StreamrClient options!')
                }

                const metamaskProvider = new Web3Provider(ethereumConfig)
                const { chainId } = await metamaskProvider.getNetwork()
                if (chainId !== ethereumOptions.sidechain.chainId) {
                    throw new Error(
                        `Please connect Metamask to Ethereum blockchain with chainId ${ethereumOptions.sidechain.chainId}: current chainId is ${chainId}`
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
        if (!this.ethereumOptions.mainnet) {
            return getDefaultProvider()
        }

        return new JsonRpcProvider(this.ethereumOptions.mainnet)
    }

    /** @returns Ethers.js Provider, a connection to Binance Smart Chain */
    getBinanceProvider(): Provider {
        if (!this.ethereumOptions.binanceRPC) {
            throw new Error('StreamrCliEthereumOptionsent has no binance configuration.')
        }
        return new JsonRpcProvider(this.ethereumOptions.binanceRPC)
    }

    /** @returns Ethers.js Provider, a connection to the Streamr EVM sidechain */
    getSidechainProvider(): Provider {
        if (!this.ethereumOptions.sidechain) {
            throw new Error('EthereumOptions has no sidechain configuration.')
        }

        return new JsonRpcProvider(this.ethereumOptions.sidechain)
    }
}
