import { inject, Lifecycle, scoped } from 'tsyringe'
import { ConfigInjectionToken, PrivateKeyAuthConfig, ProviderAuthConfig, StrictStreamrClientConfig } from './Config'
import { AbstractSigner, BrowserProvider, Provider, Wallet } from 'ethers'
import { RpcProviderFactory } from './RpcProviderFactory'
import { EthereumAddress, toEthereumAddress } from '@streamr/utils'

export type SignerWithProvider = AbstractSigner<Provider>

function isPrivateKeyAuth(auth: PrivateKeyAuthConfig | ProviderAuthConfig): auth is PrivateKeyAuthConfig {
    return (auth as PrivateKeyAuthConfig).privateKey !== undefined
}

@scoped(Lifecycle.ContainerScoped)
export class SignerSource {
    readonly getSigner: () => Promise<SignerWithProvider>

    constructor(
        rpcProviderFactory: RpcProviderFactory,
        @inject(ConfigInjectionToken) config: Pick<StrictStreamrClientConfig, 'auth' | 'contracts'>
    ) {
        if (config.auth === undefined) {
            const primaryProvider = rpcProviderFactory.getPrimaryProvider()
            const wallet = Wallet.createRandom().connect(primaryProvider)
            this.getSigner = async () => wallet as SignerWithProvider
        } else if (isPrivateKeyAuth(config.auth)) {
            const primaryProvider = rpcProviderFactory.getPrimaryProvider()
            const wallet = new Wallet(config.auth.privateKey, primaryProvider)
            this.getSigner = async () => wallet as SignerWithProvider
        } else {
            if (config.contracts.ethereumNetwork.chainId === undefined) { // TODO: can this check be removed?
                throw new Error('Streamr chainId not configured in the StreamrClient options!')
            }
            const ethereum = config.auth.ethereum
            const provider = new BrowserProvider(ethereum)
            const signer = provider.getSigner()
            const expectedChainId = config.contracts.ethereumNetwork.chainId
            this.getSigner = async () => {
                const actualChainId = (await provider.getNetwork()).chainId
                if (actualChainId !== BigInt(expectedChainId)) {
                    throw new Error(
                        // eslint-disable-next-line max-len
                        `Please connect the custom authentication provider with chainId ${expectedChainId} (current chainId is ${actualChainId})`
                    )
                }
                return signer
            }
        }
    }

    async getAddress(): Promise<EthereumAddress> {
        const signer = await this.getSigner()
        return toEthereumAddress(await signer.getAddress())
    }
}
