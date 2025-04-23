import { hexToBinary, toUserId, toUserIdRaw, UserID, UserIDRaw, wait } from '@streamr/utils'
import { BrowserProvider, JsonRpcApiProvider } from 'ethers'
import { pLimitFn } from '../utils/promises'
import { Identity, SignerWithProvider } from './Identity'
import { SignatureType } from '@streamr/trackerless-network'
import { EthereumProviderIdentityConfig, StrictStreamrClientConfig } from '../Config'

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

    async getUserIdBytes(): Promise<UserIDRaw> {
        this.cachedUserIdBytes ??= toUserIdRaw(await this.getUserIdString())
        return this.cachedUserIdBytes
    }

    async getUserIdString(): Promise<UserID> {
        this.cachedUserIdString ??= toUserId(await (await this.signer).getAddress())
        return this.cachedUserIdString
    }

    // eslint-disable-next-line class-methods-use-this
    getSignatureType(): SignatureType {
        return SignatureType.EVM_SECP256K1
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
        return this. signer
        // TODO: handle events
        // ethereum.on('accountsChanged', (accounts) => { })
        // https://docs.metamask.io/guide/ethereum-provider.html#events says:
        //   "We recommend reloading the page unless you have a very good reason not to"
        //   Of course we can't and won't do that, but if we need something chain-dependent...
        // ethereum.on('chainChanged', (chainId) => { window.location.reload() });
    }

    static fromConfig(config: Pick<StrictStreamrClientConfig, 'auth' | 'contracts'>): EthereumProviderIdentity {
        const ethereum = (config.auth as EthereumProviderIdentityConfig)?.ethereum
        const provider = new BrowserProvider(ethereum)
        return new EthereumProviderIdentity(provider, config.contracts.ethereumNetwork.chainId)
    }
}
