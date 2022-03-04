import { scoped, Lifecycle, inject } from 'tsyringe'
import { Contract, ContractInterface, ContractReceipt, ContractTransaction } from '@ethersproject/contracts'
import { Signer } from '@ethersproject/abstract-signer'
import { GraphQLClient } from './GraphQLClient'
import { until } from '.'
import { ConfigInjectionToken, StrictStreamrClientConfig } from '../Config'
import { ObservableContract, withErrorHandlingAndLogging } from './contract'
import { EthereumAddress } from 'streamr-client-protocol'
import pMemoize from 'p-memoize'

/*
 * SynchronizedGraphQLClient is used to query The Graph index. It is very similar to the
 * GraphQLClient class and has identical public API for executing queries.
 *
 * In this class there is an additional method `updateRequiredBlockNumber(n)`. If that method
 * is called, then any subsequent query will provide up-to-date data from The Graph (i.e. data
 * which has been indexed at least to that block number).
 *
 * If SynchronizedGraphQLClient is used, the client instance should be notified about any
 * transaction which writes to the blockchain indexed by The Graph. That way we can ensure that all
 * read queries from The Graph correspond the data written in those transactions.
 *
 * The notification can be done by calling the `updateRequiredBlockNumber(n)` method described above.
 * We can use the helper method `createWriteContract` to create a contract which automatically
 * updates the client when something is written to the blockchain via that contract.
 */

export const createWriteContract = <T extends Contract>(
    address: EthereumAddress,
    contractInterface: ContractInterface,
    signer: Signer,
    name: string,
    graphQLClient: SynchronizedGraphQLClient
): ObservableContract<T> => {
    const contract = withErrorHandlingAndLogging<T>(
        new Contract(address, contractInterface, signer),
        name
    )
    contract.eventEmitter.on('onTransactionConfirm', (_methodName: string, _tx: ContractTransaction, receipt: ContractReceipt) => {
        graphQLClient.updateRequiredBlockNumber(receipt.blockNumber)
    })
    return contract
}

@scoped(Lifecycle.ContainerScoped)
export class SynchronizedGraphQLClient {

    private delegate: GraphQLClient
    private requiredBlockNumber = 0
    private indexedBlockNumber = 0
    private clientConfig: StrictStreamrClientConfig
    private memoizedWaitUntilIndexed: (blockNumber: number) => Promise<void>

    constructor(
        @inject(GraphQLClient) delegate: GraphQLClient,
        @inject(ConfigInjectionToken.Root) clientConfig: StrictStreamrClientConfig
    ) {
        this.delegate = delegate
        this.clientConfig = clientConfig
        this.memoizedWaitUntilIndexed = pMemoize((blockNumber: number) => {
            return this.waitUntiIndexed(blockNumber)
        })
    }

    private async waitUntiIndexed(blockNumber: number): Promise<void> {
        await until(
            async () => {
                const currentBlockNumber = await this.delegate.getIndexBlockNumber()
                return (currentBlockNumber >= blockNumber)
            },
            // eslint-disable-next-line no-underscore-dangle
            this.clientConfig._timeouts.theGraph.timeout,
            // eslint-disable-next-line no-underscore-dangle
            this.clientConfig._timeouts.theGraph.retryInterval,
            () => `Timed out while waiting for TheGraph to synchronize to block ${this.requiredBlockNumber}`
        )
        this.updateIndexedBlockNumber(blockNumber)
    }

    private async waitUntilSynchronized() {
        if (this.requiredBlockNumber > this.indexedBlockNumber) {
            await this.memoizedWaitUntilIndexed(this.requiredBlockNumber)
        }
    }

    updateRequiredBlockNumber(blockNumber: number) {
        this.requiredBlockNumber = Math.max(blockNumber, this.requiredBlockNumber)
    }

    private updateIndexedBlockNumber(blockNumber: number) {
        this.indexedBlockNumber = Math.max(blockNumber, this.indexedBlockNumber)
    }

    async sendQuery(gqlQuery: string): Promise<Object> {
        await this.waitUntilSynchronized()
        return this.delegate.sendQuery(gqlQuery)
    }

    async* fetchPaginatedResults<T extends { id: string }>(
        createQuery: (lastId: string, pageSize: number) => string,
        pageSize?: number
    ): AsyncGenerator<T, void, undefined> {
        await this.waitUntilSynchronized()
        yield* this.delegate.fetchPaginatedResults(createQuery, pageSize)
    }
}
