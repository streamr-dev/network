import { Lifecycle, scoped } from 'tsyringe'
import { Contract, ContractInterface, ContractReceipt, ContractTransaction } from '@ethersproject/contracts'
import { Provider } from '@ethersproject/providers'
import { Signer } from '@ethersproject/abstract-signer'
import { ObservableContract, createDecoratedContract } from './utils/contract'
import { EthereumAddress } from 'streamr-client-protocol'
import { SynchronizedGraphQLClient } from './utils/SynchronizedGraphQLClient'

@scoped(Lifecycle.ContainerScoped)
export class ContractFactory {

    private graphQLClient: SynchronizedGraphQLClient

    constructor(graphQLClient: SynchronizedGraphQLClient) {
        this.graphQLClient = graphQLClient
    }

    createReadContract<T extends Contract>(
        address: EthereumAddress,
        contractInterface: ContractInterface,
        provider: Provider,
        name: string
    ): ObservableContract<T> {
        return createDecoratedContract<T>(
            new Contract(address, contractInterface, provider),
            name
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
            name
        )
        contract.eventEmitter.on('onTransactionConfirm', (_methodName: string, _tx: ContractTransaction, receipt: ContractReceipt) => {
            this.graphQLClient.updateRequiredBlockNumber(receipt.blockNumber)
        })
        return contract
    }
}
