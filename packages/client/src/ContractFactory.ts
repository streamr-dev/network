import { Signer } from '@ethersproject/abstract-signer'
import { Contract, ContractInterface, ContractReceipt, ContractTransaction } from '@ethersproject/contracts'
import { Provider } from '@ethersproject/providers'
import { EthereumAddress, TheGraphClient } from '@streamr/utils'
import { inject, Lifecycle, scoped } from 'tsyringe'
import { ConfigInjectionToken, StrictStreamrClientConfig } from './Config'
import { TheGraphClientFactory } from './TheGraphClientFactory'
import { createDecoratedContract, ObservableContract } from './utils/contract'
import { LoggerFactory } from './utils/LoggerFactory'

@scoped(Lifecycle.ContainerScoped)
export class ContractFactory {
    private readonly graphQLClient: TheGraphClient
    private readonly loggerFactory: LoggerFactory
    private readonly config: Pick<StrictStreamrClientConfig, 'contracts'>

    constructor(
        graphQLClientFactory: TheGraphClientFactory,
        @inject(LoggerFactory) loggerFactory: LoggerFactory,
        @inject(ConfigInjectionToken) config: Pick<StrictStreamrClientConfig, 'contracts'>
    ) {
        this.graphQLClient = graphQLClientFactory.getInstance()
        this.loggerFactory = loggerFactory
        this.config = config
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
            // When we add the support, we should use the maxConcurrentCalls option from client config here.
            // Also note that if we'd use a limit of 1, it wouldn't make the concurrent transactions to a sequence of transactions,
            // because the concurrency limit covers only submits, not tx.wait() calls.
            999999
        )
        contract.eventEmitter.on('onTransactionConfirm', (_methodName: string, _tx: ContractTransaction, receipt: ContractReceipt) => {
            // This ensures that all read queries from The Graph are up-to-date with this transaction (i.e. if a query targets
            // an entity that is created/updated by this transaction, that data is available for the query)
            this.graphQLClient.updateRequiredBlockNumber(receipt.blockNumber)
        })
        return contract
    }
}
