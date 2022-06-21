import { Wallet } from '@ethersproject/wallet'
import { Web3Provider } from '@ethersproject/providers'
import type { Signer } from '@ethersproject/abstract-signer'
import { computeAddress } from '@ethersproject/transactions'
import { getAddress } from '@ethersproject/address'
import { EthereumAddress } from 'streamr-client-protocol'
import { AuthConfig, Ethereum, EthereumConfig } from './Ethereum'

export const AuthenticationInjectionToken = Symbol('Authentication')

export interface Authentication {
    isAuthenticated: () => boolean
    getAddress: () => Promise<EthereumAddress>
    getStreamRegistryChainSigner(): Promise<Signer>
}

export const createAuthentication = (authConfig: AuthConfig, ethereumConfig: EthereumConfig): Authentication => {
    if ('privateKey' in authConfig && authConfig.privateKey) {
        const key = authConfig.privateKey
        const address = getAddress(computeAddress(key)).toLowerCase()
        return {
            isAuthenticated: () => true,
            getAddress: async () => address,
            getStreamRegistryChainSigner: async () => new Wallet(key, new Ethereum(ethereumConfig).getStreamRegistryChainProvider())
        }
    } else if ('ethereum' in authConfig && authConfig.ethereum) {
        const { ethereum } = authConfig
        return {
            isAuthenticated: () => true,
            getAddress: async () => {
                try {
                    if (!(ethereumConfig && 'request' in ethereum && typeof ethereum.request === 'function')) {
                        throw new Error(`invalid ethereum provider ${ethereumConfig}`)
                    }
                    const accounts = await ethereum.request({ method: 'eth_requestAccounts' })
                    const account = getAddress(accounts[0]) // convert to checksum case
                    return account.toLowerCase()
                } catch {
                    throw new Error('no addresses connected+selected in Metamask')
                }
            },
            getStreamRegistryChainSigner: async () => {
                if (!ethereumConfig.streamRegistryChainRPCs || ethereumConfig.streamRegistryChainRPCs.chainId === undefined) {
                    throw new Error('Streamr streamRegistryChainRPC not configured (with chainId) in the StreamrClient options!')
                }
                const metamaskProvider = new Web3Provider(ethereum)
                const { chainId } = await metamaskProvider.getNetwork()
                if (chainId !== ethereumConfig.streamRegistryChainRPCs.chainId) {
                    const sideChainId = ethereumConfig.streamRegistryChainRPCs.chainId
                    throw new Error(
                        `Please connect Metamask to Ethereum blockchain with chainId ${sideChainId}: current chainId is ${chainId}`
                    )
                }
                const metamaskSigner = metamaskProvider.getSigner()
                return metamaskSigner
                // TODO: handle events
                // ethereum.on('accountsChanged', (accounts) => { })
                // https://docs.metamask.io/guide/ethereum-provider.html#events says:
                //   "We recommend reloading the page unless you have a very good reason not to"
                //   Of course we can't and won't do that, but if we need something chain-dependent...
                // ethereum.on('chainChanged', (chainId) => { window.location.reload() });
            }
        }
    } else {
        return {
            isAuthenticated: () => false,
            getAddress: async () => { 
                throw new Error('StreamrClient is not authenticated with private key')
            },
            getStreamRegistryChainSigner: async () => {
                throw new Error('StreamrClient not authenticated! Can\'t send transactions or sign messages')
            }
        }
    }
}
