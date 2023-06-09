import { Signer } from '@ethersproject/abstract-signer'
import { Contract, ContractInterface, ContractReceipt, ContractTransaction } from '@ethersproject/contracts'
import { Provider } from '@ethersproject/providers'
import { EthereumAddress } from '@streamr/utils'
import { Lifecycle, inject, scoped } from 'tsyringe'
import { ConfigInjectionToken, StrictStreamrClientConfig } from './Config'
import { StreamrClientEventEmitter } from './events'
import { LoggerFactory } from './utils/LoggerFactory'
import { ObservableContract, createDecoratedContract } from './utils/contract'

@scoped(Lifecycle.ContainerScoped)
export class ContractFactory {

    private readonly config: Pick<StrictStreamrClientConfig, 'contracts'>
    private readonly eventEmitter: StreamrClientEventEmitter
    private readonly loggerFactory: LoggerFactory

    /* eslint-disable indent */
    constructor(
        @inject(ConfigInjectionToken) config: Pick<StrictStreamrClientConfig, 'contracts'>,
        eventEmitter: StreamrClientEventEmitter,
        loggerFactory: LoggerFactory
    ) {
        this.config = config
        this.eventEmitter = eventEmitter
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
            // When we add the support, we should use the maxConcurrentCalls option from client config here.
            // Also note that if we'd use a limit of 1, it wouldn't make the concurrent transactions to a sequence of transactions,
            // because the concurrency limit covers only submits, not tx.wait() calls.
            999999
        )
        contract.eventEmitter.on('onTransactionConfirm', (methodName: string, transaction: ContractTransaction, receipt: ContractReceipt) => {
            this.eventEmitter.emit('confirmContractTransaction', {
                methodName,
                transaction,
                receipt
            })
        })
        return contract
    }
}
