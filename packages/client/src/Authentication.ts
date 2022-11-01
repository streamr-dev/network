import { Wallet } from '@ethersproject/wallet'
import { Web3Provider } from '@ethersproject/providers'
import type { Signer } from '@ethersproject/abstract-signer'
import { computeAddress } from '@ethersproject/transactions'
import type { ExternalProvider } from '@ethersproject/providers'
import { EthereumConfig, getStreamRegistryChainProvider } from './Ethereum'
import { XOR } from './types'
import { pLimitFn } from './utils/promises'
import pMemoize from 'p-memoize'
import { EthereumAddress, toEthereumAddress, wait } from '@streamr/utils'
import { sign } from './utils/signingUtils'

export type ProviderConfig = ExternalProvider

export interface ProviderAuthConfig {
    ethereum: ProviderConfig
}

export interface PrivateKeyAuthConfig {
    privateKey: string
    // The address property is not used. It is included to make the object
    // compatible with StreamrClient.generateEthereumAccount(), as we typically
    // use that method to generate the client "auth" option.
    address?: string
}

export type UnauthenticatedAuthConfig = {}
export type AuthenticatedConfig = XOR<ProviderAuthConfig, PrivateKeyAuthConfig>
export type AuthConfig = XOR<AuthenticatedConfig, UnauthenticatedAuthConfig>

export const AuthenticationInjectionToken = Symbol('Authentication')

export interface Authentication {
    // always in lowercase
    getAddress: () => Promise<EthereumAddress>
    createMessageSignature: (payload: string) => Promise<string>
    getStreamRegistryChainSigner: () => Promise<Signer>
}

const createPrivateKeyAuthentication = (key: string, ethereumConfig: EthereumConfig): Authentication => {
    const address = toEthereumAddress(computeAddress(key))
    return {
        getAddress: async () => address,
        createMessageSignature: async (payload: string) => sign(payload, key),
        getStreamRegistryChainSigner: async () => new Wallet(key, getStreamRegistryChainProvider(ethereumConfig))
    }
}

export const createAuthentication = (authConfig: AuthConfig, ethereumConfig: EthereumConfig): Authentication => {
    if (authConfig.privateKey !== undefined) {
        return createPrivateKeyAuthentication(authConfig.privateKey, ethereumConfig)
    } else if (authConfig.ethereum !== undefined) {
        const { ethereum } = authConfig
        const metamaskProvider = new Web3Provider(ethereum)
        const signer = metamaskProvider.getSigner()
        return {
            getAddress: pMemoize(async () => {
                try {
                    if (!(ethereumConfig && 'request' in ethereum && typeof ethereum.request === 'function')) {
                        throw new Error(`invalid ethereum provider ${ethereumConfig}`)
                    }
                    const accounts = await ethereum.request({ method: 'eth_requestAccounts' })
                    return toEthereumAddress(accounts[0])
                } catch {
                    throw new Error('no addresses connected+selected in Metamask')
                }
            }),
            createMessageSignature: pLimitFn(async (payload: string) => {
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
        return createPrivateKeyAuthentication(Wallet.createRandom().privateKey, ethereumConfig)
    }
}
