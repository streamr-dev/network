import { Wallet } from '@ethersproject/wallet'
import { Web3Provider } from '@ethersproject/providers'
import type { Signer } from '@ethersproject/abstract-signer'
import { computeAddress } from '@ethersproject/transactions'
import { getStreamRegistryChainProvider } from './Ethereum'
import { PrivateKeyAuthConfig, ProviderAuthConfig } from './Config'
import { pLimitFn } from './utils/promises'
import pMemoize from 'p-memoize'
import { EthereumAddress, toEthereumAddress, wait } from '@streamr/utils'
import { sign } from './utils/signingUtils'
import { StrictStreamrClientConfig } from './Config'
import { RelayProvider } from '@opengsn/provider'
import HttpProvider from 'web3-providers-http'
import { ethers } from 'ethers'

export const AuthenticationInjectionToken = Symbol('Authentication')

export interface Authentication {
    // always in lowercase
    getAddress: () => Promise<EthereumAddress>
    createMessageSignature: (payload: string) => Promise<string>
    getStreamRegistryChainSigner: () => Promise<Signer>
}

export const createPrivateKeyAuthentication = (key: string, config: Pick<StrictStreamrClientConfig, 'contracts'>): Authentication => {
    const address = toEthereumAddress(computeAddress(key))
    return {
        getAddress: async () => address,
        createMessageSignature: async (payload: string) => sign(payload, key),
        getStreamRegistryChainSigner: async () => {
            if (!config.contracts.enableExperimentalGsn) {
                return new Wallet(key, getStreamRegistryChainProvider(config))
            } else {
                const firstRPC = config.contracts.streamRegistryChainRPCs.rpcs[0]
                const gsnProvider = await RelayProvider.newProvider({
                    // @ts-expect-error TODO: HttpProvider TS definition is wrong in web3-providers-http
                    provider: new HttpProvider(firstRPC.url, { timeout: firstRPC.timeout }),
                    config: {
                        paymasterAddress: '0x43E69adABC664617EB9C5E19413a335e9cd4A243',
                        preferredRelays: ['https://gsn.streamr.network/gsn1'],
                        relayLookupWindowBlocks: 9000,
                        relayRegistrationLookupBlocks: 9000,
                        pastEventsQueryMaxPageSize: 9000,
                        auditorsCount: 0,
                        loggerConfiguration: { logLevel: 'debug' },
                    }
                }).init()
                gsnProvider.addAccount(key)
                const provider = new ethers.providers.Web3Provider(gsnProvider as any) // TODO: why is casting needed here?
                return provider.getSigner(address)
            }
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
            createMessageSignature: pLimitFn(async (payload: string) => {
                // sign one at a time & wait a moment before asking for next signature
                // otherwise MetaMask extension may not show the prompt window
                const sig = await signer.signMessage(payload)
                await wait(50)
                return sig
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
                if (!config.contracts.enableExperimentalGsn) {
                    return signer
                } else {
                    const gsnProvider = await RelayProvider.newProvider({
                        // @ts-expect-error TODO: HttpProvider TS definition is wrong in web3-providers-http
                        provider: ethereum,
                        config: {
                            paymasterAddress: '0x43E69adABC664617EB9C5E19413a335e9cd4A243',
                            preferredRelays: ['https://gsn.streamr.network/gsn1'],
                            relayLookupWindowBlocks: 9000,
                            relayRegistrationLookupBlocks: 9000,
                            pastEventsQueryMaxPageSize: 9000,
                            auditorsCount: 0,
                            loggerConfiguration: { logLevel: 'debug' },
                        }
                    }).init()
                    const provider = new ethers.providers.Web3Provider(gsnProvider as any) // TODO: why is casting needed here?
                    return provider.getSigner(await signer.getAddress())
                }
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
