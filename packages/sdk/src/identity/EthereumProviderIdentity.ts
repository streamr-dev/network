import { hexToBinary, toUserId, UserID, wait } from '@streamr/utils'
import { JsonRpcApiProvider } from 'ethers'
import { pLimitFn } from '../utils/promises'
import { SignerWithProvider } from './Identity'

export class EthereumProviderIdentity {
    private provider: JsonRpcApiProvider
    private expectedChainId: number | undefined
    private signer: Promise<SignerWithProvider>
    private cachedUserId: UserID | undefined
    private rateLimitedSigner: (payload: Uint8Array) => Promise<Uint8Array>

    constructor(provider: JsonRpcApiProvider, expectedChainId: number | undefined) {
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

    async getUserId(): Promise<UserID> {
        if (!this.cachedUserId) {
            this.cachedUserId = toUserId(await (await this.signer).getAddress())
        }
        return this.cachedUserId
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
                `Please connect the custom authentication provider with chainId ${this.expectedChainId} (current chainId is ${actualChainId})`
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
}