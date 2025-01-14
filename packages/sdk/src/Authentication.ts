import { createSignature, hexToBinary, toUserId, UserID, wait } from '@streamr/utils'
import { AbstractSigner, BrowserProvider, computeAddress, Provider, Wallet } from 'ethers'
import pMemoize from 'p-memoize'
import { PrivateKeyAuthConfig, ProviderAuthConfig, StrictStreamrClientConfig } from './Config'
import { RpcProviderSource } from './RpcProviderSource'
import { pLimitFn } from './utils/promises'

export const AuthenticationInjectionToken = Symbol('Authentication')

/**
 * The {@link https://docs.ethers.org/v6/api/providers/abstract-signer/#AbstractSigner AbstractSigner} type is from the `ethers` library.
 */
export type SignerWithProvider = AbstractSigner<Provider>

export interface Authentication {
    getUserId: () => Promise<UserID>
    createMessageSignature: (payload: Uint8Array) => Promise<Uint8Array>
    getTransactionSigner: (rpcProviderSource: RpcProviderSource) => Promise<SignerWithProvider>
}

export const createPrivateKeyAuthentication = (key: string): Authentication => {
    const userId = toUserId(computeAddress(key))
    return {
        getUserId: async () => userId,
        createMessageSignature: async (payload: Uint8Array) => createSignature(payload, hexToBinary(key)),
        getTransactionSigner: async (rpcProviderSource: RpcProviderSource) => {
            const primaryProvider = rpcProviderSource.getProvider()
            return new Wallet(key, primaryProvider) as SignerWithProvider
        }
    }
}

export const createAuthentication = (
    config: Pick<StrictStreamrClientConfig, 'auth' | 'contracts' | '_timeouts'>
): Authentication => {
    if ((config.auth as PrivateKeyAuthConfig)?.privateKey !== undefined) {
        const privateKey = (config.auth as PrivateKeyAuthConfig).privateKey
        const normalizedPrivateKey = !privateKey.startsWith('0x') ? `0x${privateKey}` : privateKey
        return createPrivateKeyAuthentication(normalizedPrivateKey)
    } else if ((config.auth as ProviderAuthConfig)?.ethereum !== undefined) {
        const ethereum = (config.auth as ProviderAuthConfig)?.ethereum
        const provider = new BrowserProvider(ethereum)
        const signer = provider.getSigner()
        return {
            getUserId: pMemoize(async () => {
                return toUserId(await (await signer).getAddress())
            }),
            createMessageSignature: pLimitFn(async (payload: Uint8Array) => {
                // sign one at a time & wait a moment before asking for next signature
                // otherwise MetaMask extension may not show the prompt window
                const sig = await (await signer).signMessage(payload)
                await wait(50)
                return hexToBinary(sig)
            }, 1),
            getTransactionSigner: async () => {
                if (config.contracts.ethereumNetwork.chainId === undefined) {
                    throw new Error('Streamr chainId not configuredin the StreamrClient options!')
                }
                const expectedChainId = config.contracts.ethereumNetwork.chainId
                const actualChainId = (await provider.getNetwork()).chainId
                if (actualChainId !== BigInt(expectedChainId)) {
                    throw new Error(
                        `Please connect the custom authentication provider with chainId ${expectedChainId} (current chainId is ${actualChainId})`
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
        return createPrivateKeyAuthentication(Wallet.createRandom().privateKey)
    }
}
