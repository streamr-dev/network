import { Wallet } from '@ethersproject/wallet'
import { Web3Provider } from '@ethersproject/providers'
import type { Signer } from '@ethersproject/abstract-signer'
import { computeAddress } from '@ethersproject/transactions'
import { getAddress } from '@ethersproject/address'
import { EthereumAddress, SigningUtil } from 'streamr-client-protocol'
import type { ExternalProvider } from '@ethersproject/providers'
import { EthereumConfig, getStreamRegistryChainProvider } from './Ethereum'
import { XOR } from './types'
import { pLimitFn, wait } from './utils/promises'

export type ProviderConfig = ExternalProvider

export type ProviderAuthConfig = {
    ethereum: ProviderConfig
}

export type PrivateKeyAuthConfig = {
    privateKey: string,
    // The address property is not used. It is included to make the object
    // compatible with StreamrClient.generateEthereumAccount(), as we typically
    // use that method to generate the client "auth" option.
    address?: EthereumAddress
}

// eslint-disable-next-line @typescript-eslint/ban-types
export type UnauthenticatedAuthConfig = XOR<{}, { unauthenticated: true }>

export type AuthenticatedConfig = XOR<ProviderAuthConfig, PrivateKeyAuthConfig>
export type AuthConfig = XOR<AuthenticatedConfig, UnauthenticatedAuthConfig>

export const AuthenticationInjectionToken = Symbol('Authentication')

export interface Authentication {
    isAuthenticated: () => boolean
    getAddress: () => Promise<EthereumAddress>
    createMessagePayloadSignature: (payload: string) => Promise<string>
    getStreamRegistryChainSigner: () => Promise<Signer>
}

export const createAuthentication = (authConfig: AuthConfig, ethereumConfig: EthereumConfig): Authentication => {
    if (authConfig.privateKey !== undefined) {
        const key = authConfig.privateKey
        const address = getAddress(computeAddress(key)).toLowerCase()
        return {
            isAuthenticated: () => true,
            getAddress: async () => address,
            createMessagePayloadSignature: async (payload: string) => SigningUtil.sign(payload, key),
            getStreamRegistryChainSigner: async () => new Wallet(key, getStreamRegistryChainProvider(ethereumConfig))
        }
    } else if (authConfig.ethereum !== undefined) {
        const { ethereum } = authConfig
        const metamaskProvider = new Web3Provider(ethereum)
        const signer = metamaskProvider.getSigner()
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
            createMessagePayloadSignature: pLimitFn(async (payload: string) => {
                // sign one at a time & wait a moment before asking for next signature
                // otherwise metamask extension may not show the prompt window
                const sig = await signer.signMessage(payload)
                await wait(50)
                return sig
            }, 1),
            getStreamRegistryChainSigner: async () => {
                if (!ethereumConfig.streamRegistryChainRPCs || ethereumConfig.streamRegistryChainRPCs.chainId === undefined) {
                    throw new Error('Streamr streamRegistryChainRPC not configured (with chainId) in the StreamrClient options!')
                }
                const { chainId } = await metamaskProvider.getNetwork()
                if (chainId !== ethereumConfig.streamRegistryChainRPCs.chainId) {
                    const sideChainId = ethereumConfig.streamRegistryChainRPCs.chainId
                    throw new Error(
                        `Please connect Metamask to Ethereum blockchain with chainId ${sideChainId}: current chainId is ${chainId}`
                    )
                }
                return signer
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
            createMessagePayloadSignature: async () => {
                throw new Error('Need either "privateKey" or "ethereum"')
            },
            getStreamRegistryChainSigner: async () => {
                throw new Error('StreamrClient not authenticated! Can\'t send transactions or sign messages')
            }
        }
    }
}
