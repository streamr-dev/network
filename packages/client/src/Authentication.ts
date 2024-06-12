import { BrowserProvider, AbstractSigner, Provider } from 'ethers'
import { computeAddress } from 'ethers'
import { Wallet } from 'ethers'
import { EthereumAddress, hexToBinary, toEthereumAddress, wait, createSignature } from '@streamr/utils'
import pMemoize from 'p-memoize'
import { PrivateKeyAuthConfig, ProviderAuthConfig, StrictStreamrClientConfig } from './Config'
import { pLimitFn } from './utils/promises'

export const AuthenticationInjectionToken = Symbol('Authentication')

export type SignerWithProvider = AbstractSigner<Provider>

export interface Authentication {
    // always in lowercase
    getAddress: () => Promise<EthereumAddress>
    signWithWallet: (payload: Uint8Array) => Promise<Uint8Array>
}

export const createPrivateKeyAuthentication = (key: string): Authentication => {
    const address = toEthereumAddress(computeAddress(key))
    return {
        getAddress: async () => address,
        signWithWallet: async (payload: Uint8Array) => createSignature(payload, hexToBinary(key))
    }
}

export const createAuthentication = (config: Pick<StrictStreamrClientConfig, 'auth' | 'contracts' | '_timeouts'>): Authentication => {
    if ((config.auth as PrivateKeyAuthConfig)?.privateKey !== undefined) {
        const privateKey = (config.auth as PrivateKeyAuthConfig).privateKey
        const normalizedPrivateKey = !privateKey.startsWith('0x')
            ? `0x${privateKey}`
            : privateKey
        return createPrivateKeyAuthentication(normalizedPrivateKey)
    } else if ((config.auth as ProviderAuthConfig)?.ethereum !== undefined) {
        const ethereum = (config.auth as ProviderAuthConfig)?.ethereum
        const provider = new BrowserProvider(ethereum)
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
            signWithWallet: pLimitFn(async (payload: Uint8Array) => {
                // sign one at a time & wait a moment before asking for next signature
                // otherwise MetaMask extension may not show the prompt window
                const sig = await (await signer).signMessage(payload)
                await wait(50)
                return hexToBinary(sig)
            }, 1)
        }
    } else {
        return createPrivateKeyAuthentication(Wallet.createRandom().privateKey)
    }
}
