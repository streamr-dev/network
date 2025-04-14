import { BrowserProvider, Wallet } from 'ethers'
import { PrivateKeyAuthConfig, ProviderAuthConfig, StrictStreamrClientConfig } from '../Config'
import { EthereumPrivateKeyIdentity } from './EthereumPrivateKeyIdentity'
import { EthereumProviderIdentity } from './EthereumProviderIdentity'
import { Identity } from './Identity'

export const createIdentityFromConfig = (config: Pick<StrictStreamrClientConfig, 'auth' | 'contracts' | '_timeouts'>): Identity => {
    if ((config.auth as PrivateKeyAuthConfig)?.privateKey !== undefined) {
        const privateKey = (config.auth as PrivateKeyAuthConfig).privateKey
        const normalizedPrivateKey = !privateKey.startsWith('0x')
            ? `0x${privateKey}`
            : privateKey
        return new EthereumPrivateKeyIdentity(normalizedPrivateKey)
    } else if ((config.auth as ProviderAuthConfig)?.ethereum !== undefined) {
        const ethereum = (config.auth as ProviderAuthConfig)?.ethereum
        const provider = new BrowserProvider(ethereum)
        return new EthereumProviderIdentity(provider, config.contracts.ethereumNetwork.chainId)
    } else {
        return new EthereumPrivateKeyIdentity(Wallet.createRandom().privateKey)
    }
}
