import { hexToBinary, toUserId, toUserIdRaw, UserID, UserIDRaw, wait } from '@streamr/utils'
import { BrowserProvider, JsonRpcApiProvider } from 'ethers'
import { pLimitFn } from '../utils/promises'
import { Identity, SignerWithProvider } from './Identity'
import { SignatureType } from '@streamr/trackerless-network'
import type { EthereumProviderIdentityConfig, StrictStreamrClientConfig } from '../ConfigTypes'

/**
 * An identity that uses an Ethereum provider (= external wallet) to sign messages
 */
export class EthereumProviderIdentity extends Identity {
    private provider: JsonRpcApiProvider
    private expectedChainId: number | undefined
    private signer: Promise<SignerWithProvider>
    private cachedUserIdString: UserID | undefined
    private cachedUserIdBytes: UserIDRaw | undefined
    private rateLimitedSigner: (payload: Uint8Array) => Promise<Uint8Array>

    constructor(provider: JsonRpcApiProvider, expectedChainId: number | undefined) {
        super()
        this.provider = provider
        this.expectedChainId = expectedChainId
        this.signer = provider.getSigner()

        this.rateLimitedSigner = pLimitFn(async (payload: Uint8Array) => {
            // sign one at a time & wait a moment before asking for next signature
            // otherwise MetaMask extension may not show the prompt window
            const sig = await (await this.signer).signMessage(payload)
            await wait(50)
            return hexToBinary(sig)
        }, 1)
    }

    async getUserIdRaw(): Promise<UserIDRaw> {
        this.cachedUserIdBytes ??= toUserIdRaw(await this.getUserId())
        return this.cachedUserIdBytes
    }

    async getUserId(): Promise<UserID> {
        this.cachedUserIdString ??= toUserId(await (await this.signer).getAddress())
        return this.cachedUserIdString
    }

    // eslint-disable-next-line class-methods-use-this
    getSignatureType(): SignatureType {
        return SignatureType.ECDSA_SECP256K1_EVM
    }

    async createMessageSignature(payload: Uint8Array): Promise<Uint8Array> {
        return this.rateLimitedSigner(payload)
    }

    async getTransactionSigner(): Promise<SignerWithProvider> {
        if (this.expectedChainId === undefined) {
            throw new Error('Streamr chainId not configuredin the StreamrClient options!')
        }
        const actualChainId = (await this.provider.getNetwork()).chainId
        if (actualChainId !== BigInt(this.expectedChainId)) {
            throw new Error(
                `Connect your wallet to the chain with chainId ${this.expectedChainId} (chainId of currently selected chain is ${actualChainId})`
            )
        }
        return this.signer
    }

    /** @internal */
    static fromConfig(config: Pick<StrictStreamrClientConfig, 'auth' | 'contracts'>): EthereumProviderIdentity {
        const ethereum = (config.auth as EthereumProviderIdentityConfig)?.ethereum
        const provider = new BrowserProvider(ethereum)
        return new EthereumProviderIdentity(provider, config.contracts.ethereumNetwork.chainId)
    }
}
