import { inject, Lifecycle, scoped } from 'tsyringe'
import { Contract, ContractInterface, ContractReceipt, ContractTransaction } from '@ethersproject/contracts'
import { Provider } from '@ethersproject/providers'
import { Signer } from '@ethersproject/abstract-signer'
import { ObservableContract, createDecoratedContract } from './utils/contract'
import { EthereumAddress } from 'streamr-client-protocol'
import { SynchronizedGraphQLClient } from './utils/SynchronizedGraphQLClient'
import { EthereumConfig } from './Ethereum'
import { ConfigInjectionToken } from './Config'

@scoped(Lifecycle.ContainerScoped)
export class ContractFactory {

    private readonly graphQLClient: SynchronizedGraphQLClient
    private readonly ethereumConfig: EthereumConfig

    constructor(
        graphQLClient: SynchronizedGraphQLClient,
        @inject(ConfigInjectionToken.Ethereum) ethereumConfig: EthereumConfig
    ) {
        this.graphQLClient = graphQLClient
        this.ethereumConfig = ethereumConfig
    }

    createReadContract<T extends Contract>(
        address: EthereumAddress,
        contractInterface: ContractInterface,
        provider: Provider,
        name: string
    ): ObservableContract<T> {
        return createDecoratedContract<T>(
            new Contract(address, contractInterface, provider),
            name,
            this.ethereumConfig.maxConcurrentContractCalls
        )
    }

    createWriteContract<T extends Contract>(
        address: EthereumAddress,
        contractInterface: ContractInterface,
        signer: Signer,
        name: string
    ): ObservableContract<T> {
        const contract = createDecoratedContract<T>(
            new Contract(address, contractInterface, signer),
            name,
            // The current maxConcurrentCalls value is just a placeholder as we don't support concurrent writes (as we don't use nonces).
            // When we add the support, we should use this.ethereumConfig.maxConcurrentContractCalls here.
            // Also note that if we'd use a limit of 1, it wouldn't make the concurrent transactions to a sequence of transactions,
            // because the concurrency limit covers only submits, not tx.wait() calls.
            999999
        )
        contract.eventEmitter.on('onTransactionConfirm', (_methodName: string, _tx: ContractTransaction, receipt: ContractReceipt) => {
            this.graphQLClient.updateRequiredBlockNumber(receipt.blockNumber)
        })
        return contract
    }
}
