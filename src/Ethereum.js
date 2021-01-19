import { Wallet } from '@ethersproject/wallet'
import { getDefaultProvider, JsonRpcProvider, Web3Provider } from '@ethersproject/providers'
import { computeAddress } from '@ethersproject/transactions'

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
            const address = computeAddress(key)
            this.getAddress = () => address
            this.getSigner = () => new Wallet(key, this.getMainnetProvider())
            this.getSidechainSigner = async () => new Wallet(key, this.getSidechainProvider())
        } else if (auth.ethereum) {
            this.getAddress = () => auth.ethereum.selectedAddress // null if no addresses connected+selected in Metamask
            this.getSigner = () => {
                const metamaskProvider = new Web3Provider(auth.ethereum)
                const metamaskSigner = metamaskProvider.getSigner()
                return metamaskSigner
            }
            this.getSidechainSigner = async () => {
                // chainId is required for checking when using Metamask
                if (!options.sidechain || !options.sidechain.chainId) {
                    throw new Error('Streamr sidechain not configured (with chainId) in the StreamrClient options!')
                }

                const metamaskProvider = new Web3Provider(auth.ethereum)
                const { chainId } = await metamaskProvider.getNetwork()
                if (chainId !== options.sidechain.chainId) {
                    throw new Error(`Please connect Metamask to Ethereum blockchain with chainId ${options.sidechain.chainId}`)
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

    /* eslint-disable class-methods-use-this */

    getAddress() {
        // default. should be overridden in constructor based on options
        return null
    }

    getSigner() {
        // default. should be overridden in constructor based on options
        throw new Error("StreamrClient not authenticated! Can't send transactions or sign messages.")
    }

    async getSidechainSigner() {
        // default. should be overridden in constructor based on options
        throw new Error("StreamrClient not authenticated! Can't send transactions or sign messages.")
    }

    /* eslint-enable class-methods-use-this */

    /** @returns Ethers.js Provider, a connection to the Ethereum network (mainnet) */
    getMainnetProvider() {
        if (this.client.options.mainnet) {
            return new JsonRpcProvider(this.client.options.mainnet)
        }
        return getDefaultProvider()
    }

    /** @returns Ethers.js Provider, a connection to the Streamr EVM sidechain */
    getSidechainProvider() {
        if (this.client.options.sidechain) {
            return new JsonRpcProvider(this.client.options.sidechain)
        }
        return null
    }
}
