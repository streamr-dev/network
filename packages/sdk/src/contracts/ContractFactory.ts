import { EthereumAddress } from '@streamr/utils'
import {
    AbstractProvider,
    BaseContract,
    Contract,
    ContractTransactionReceipt,
    InterfaceAbi,
    Provider,
    Signer
} from 'ethers'
import { Lifecycle, inject, scoped } from 'tsyringe'
import { ConfigInjectionToken, StrictStreamrClientConfig } from '../Config'
import { StreamrClientEventEmitter } from '../events'
import { LoggerFactory } from '../utils/LoggerFactory'
import { ObservableContract, createDecoratedContract } from './contract'

@scoped(Lifecycle.ContainerScoped)
export class ContractFactory {
    private readonly config: Pick<StrictStreamrClientConfig, 'contracts'>
    private readonly eventEmitter: StreamrClientEventEmitter
    private readonly loggerFactory: LoggerFactory

    constructor(
        @inject(ConfigInjectionToken) config: Pick<StrictStreamrClientConfig, 'contracts'>,
        eventEmitter: StreamrClientEventEmitter,
        loggerFactory: LoggerFactory
    ) {
        this.config = config
        this.eventEmitter = eventEmitter
        this.loggerFactory = loggerFactory
    }

    createReadContract<T extends BaseContract>(
        address: EthereumAddress,
        contractInterface: InterfaceAbi,
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

    createWriteContract<T extends BaseContract>(
        address: EthereumAddress,
        contractInterface: InterfaceAbi,
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
        contract.eventEmitter.on(
            'onTransactionConfirm',
            (methodName: string, receipt: ContractTransactionReceipt | null) => {
                this.eventEmitter.emit('contractTransactionConfirmed', {
                    methodName,
                    receipt
                })
            }
        )
        return contract
    }

    // eslint-disable-next-line class-methods-use-this
    createEventContract(
        address: EthereumAddress,
        contractInterface: InterfaceAbi,
        provider: AbstractProvider
    ): Contract {
        return new Contract(address, contractInterface, provider)
    }
}
