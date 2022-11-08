import { inject, Lifecycle, scoped } from 'tsyringe'
import { Contract, ContractInterface, ContractReceipt, ContractTransaction } from '@ethersproject/contracts'
import { Provider } from '@ethersproject/providers'
import { Signer } from '@ethersproject/abstract-signer'
import { ObservableContract, createDecoratedContract } from './utils/contract'
import { SynchronizedGraphQLClient } from './utils/SynchronizedGraphQLClient'
import { ConfigInjectionToken, StrictStreamrClientConfig } from './Config'
import { EthereumAddress } from '@streamr/utils'
import { LoggerFactory } from './utils/LoggerFactory'

@scoped(Lifecycle.ContainerScoped)
export class ContractFactory {
    private readonly graphQLClient: SynchronizedGraphQLClient
    private readonly config: StrictStreamrClientConfig
    private readonly loggerFactory: LoggerFactory

    constructor(
        graphQLClient: SynchronizedGraphQLClient,
        @inject(ConfigInjectionToken) config: StrictStreamrClientConfig,
        @inject(LoggerFactory) loggerFactory: LoggerFactory
    ) {
        this.graphQLClient = graphQLClient
        this.config = config
        this.loggerFactory = loggerFactory
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
            this.loggerFactory,
            this.config.contracts.maxConcurrentCalls
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
            this.loggerFactory,
            // The current maxConcurrentCalls value is just a placeholder as we don't support concurrent writes (as we don't use nonces).
            // When we add the support, we should use this.ethereumConfig.maxConcurrentCalls here.
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
