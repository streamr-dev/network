import type { Signer } from '@ethersproject/abstract-signer'
import { Provider, Web3Provider } from '@ethersproject/providers'
import { computeAddress } from '@ethersproject/transactions'
import { Wallet } from '@ethersproject/wallet'
import { EthereumAddress, hexToBinary, toEthereumAddress, wait, createSignature } from '@streamr/utils'
import pMemoize from 'p-memoize'
import { PrivateKeyAuthConfig, ProviderAuthConfig, StrictStreamrClientConfig } from './Config'
import { getStreamRegistryChainProviders } from './Ethereum'
import { pLimitFn } from './utils/promises'

export const AuthenticationInjectionToken = Symbol('Authentication')

export type SignerWithProvider = Signer & { readonly provider: Provider }

export interface Authentication {
    // always in lowercase
    getAddress: () => Promise<EthereumAddress>
    createMessageSignature: (payload: Uint8Array) => Promise<Uint8Array>
    getStreamRegistryChainSigner: () => Promise<SignerWithProvider>
}

export const createPrivateKeyAuthentication = (key: string, config: Pick<StrictStreamrClientConfig, 'contracts'>): Authentication => {
    const address = toEthereumAddress(computeAddress(key))
    return {
        getAddress: async () => address,
        createMessageSignature: async (payload: Uint8Array) => createSignature(payload, hexToBinary(key)),
        getStreamRegistryChainSigner: async () => {
            const primaryProvider = getStreamRegistryChainProviders(config)[0]
            return new Wallet(key, primaryProvider)
        }
    }
}

export const createAuthentication = (config: Pick<StrictStreamrClientConfig, 'auth' | 'contracts'>): Authentication => {
    if ((config.auth as PrivateKeyAuthConfig)?.privateKey !== undefined) {
        const privateKey = (config.auth as PrivateKeyAuthConfig).privateKey
        const normalizedPrivateKey = !privateKey.startsWith('0x')
            ? `0x${privateKey}`
            : privateKey
        return createPrivateKeyAuthentication(normalizedPrivateKey, config)
    } else if ((config.auth as ProviderAuthConfig)?.ethereum !== undefined) {
        const ethereum = (config.auth as ProviderAuthConfig)?.ethereum
        const provider = new Web3Provider(ethereum)
        const signer = provider.getSigner()
        return {
            getAddress: pMemoize(async () => {
                try {
                    if (!('request' in ethereum && typeof ethereum.request === 'function')) {
                        throw new Error(`invalid ethereum provider ${ethereum}`)
                    }
                    const accounts = await ethereum.request({ method: 'eth_requestAccounts' })
                    return toEthereumAddress(accounts[0])
                } catch {
                    throw new Error('no addresses connected and selected in the custom authentication provider')
                }
            }),
            createMessageSignature: pLimitFn(async (payload: Uint8Array) => {
                // sign one at a time & wait a moment before asking for next signature
                // otherwise MetaMask extension may not show the prompt window
                const sig = await signer.signMessage(payload)
                await wait(50)
                return hexToBinary(sig)
            }, 1),
            getStreamRegistryChainSigner: async () => {
                if (config.contracts.streamRegistryChainRPCs.chainId === undefined) {
                    throw new Error('Streamr streamRegistryChainRPC not configured (with chainId) in the StreamrClient options!')
                }
                const { chainId } = await provider.getNetwork()
                if (chainId !== config.contracts.streamRegistryChainRPCs.chainId) {
                    const sideChainId = config.contracts.streamRegistryChainRPCs.chainId
                    throw new Error(
                        // eslint-disable-next-line max-len
                        `Please connect the custom authentication provider to Ethereum blockchain with chainId ${sideChainId}: current chainId is ${chainId}`
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
        return createPrivateKeyAuthentication(Wallet.createRandom().privateKey, config)
    }
}
