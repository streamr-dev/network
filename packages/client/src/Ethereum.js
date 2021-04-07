import { Wallet } from '@ethersproject/wallet'
import { getDefaultProvider, JsonRpcProvider, Web3Provider } from '@ethersproject/providers'
import { computeAddress } from '@ethersproject/transactions'
import { getAddress } from '@ethersproject/address'

export default class StreamrEthereum {
    static generateEthereumAccount() {
        const wallet = Wallet.createRandom()
        return {
            address: wallet.address,
            privateKey: wallet.privateKey,
        }
    }

    constructor(client) {
        this.client = client
        const { options } = client
        const { auth } = options
        if (auth.privateKey) {
            const key = auth.privateKey
            const address = getAddress(computeAddress(key))
            this._getAddress = async () => address
            this._getSigner = () => new Wallet(key, this.getMainnetProvider())
            this._getSidechainSigner = async () => new Wallet(key, this.getSidechainProvider())
        } else if (auth.ethereum) {
            this._getAddress = async () => {
                try {
                    const accounts = await auth.ethereum.request({ method: 'eth_requestAccounts' })
                    const account = getAddress(accounts[0]) // convert to checksum case
                    return account
                } catch {
                    throw new Error('no addresses connected+selected in Metamask')
                }
            }
            this._getSigner = () => {
                const metamaskProvider = new Web3Provider(auth.ethereum)
                const metamaskSigner = metamaskProvider.getSigner()
                return metamaskSigner
            }
            this._getSidechainSigner = async () => {
                if (!options.sidechain || !options.sidechain.chainId) {
                    throw new Error('Streamr sidechain not configured (with chainId) in the StreamrClient options!')
                }

                const metamaskProvider = new Web3Provider(auth.ethereum)
                const { chainId } = await metamaskProvider.getNetwork()
                if (chainId !== options.sidechain.chainId) {
                    throw new Error(
                        `Please connect Metamask to Ethereum blockchain with chainId ${options.sidechain.chainId}: current chainId is ${chainId}`
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

    async getAddress() {
        if (!this._getAddress) {
            // _getAddress is assigned in constructor
            throw new Error('StreamrClient is not authenticated with private key')
        }

        return this._getAddress()
    }

    getSigner() {
        if (!this._getSigner) {
            // _getSigner is assigned in constructor
            throw new Error("StreamrClient not authenticated! Can't send transactions or sign messages.")
        }

        return this._getSigner()
    }

    async getSidechainSigner() {
        if (!this._getSidechainSigner) {
            // _getSidechainSigner is assigned in constructor
            throw new Error("StreamrClient not authenticated! Can't send transactions or sign messages.")
        }

        return this._getSidechainSigner()
    }

    /** @returns Ethers.js Provider, a connection to the Ethereum network (mainnet) */
    getMainnetProvider() {
        if (!this.client.options.mainnet) {
            return getDefaultProvider()
        }

        return new JsonRpcProvider(this.client.options.mainnet)
    }

    /** @returns Ethers.js Provider, a connection to the Streamr EVM sidechain */
    getSidechainProvider() {
        if (!this.client.options.sidechain) {
            throw new Error('StreamrClient has no sidechain configuration.')
        }

        return new JsonRpcProvider(this.client.options.sidechain)
    }
}
