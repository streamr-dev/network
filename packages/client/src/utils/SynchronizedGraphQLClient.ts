import { scoped, Lifecycle, inject } from 'tsyringe'
import { Contract, ContractInterface, ContractReceipt, ContractTransaction } from '@ethersproject/contracts'
import { Signer } from '@ethersproject/abstract-signer'
import { GraphQLClient } from './GraphQLClient'
import { ConfigInjectionToken, StrictStreamrClientConfig } from '../Config'
import { ObservableContract, withErrorHandlingAndLogging } from './contract'
import { EthereumAddress } from 'streamr-client-protocol'
import { Gate } from './Gate'
import { Context } from './Context'
import { Debugger } from 'debug'
import { instanceId, wait, withTimeout } from './index'

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

class BlockNumberGate extends Gate {
    blockNumber: number

    constructor(blockNumber: number) {
        super()
        this.blockNumber = blockNumber
    }
}

class IndexingState {
    private blockNumber = 0
    private gates: Set<BlockNumberGate> = new Set()
    private getCurrentBlockNumber: () => Promise<number>
    private pollTimeout: number
    private pollRetryInterval: number
    private debug: Debugger

    constructor(
        getCurrentBlockNumber: () => Promise<number>,
        pollTimeout: number,
        pollRetryInterval: number,
        debug: Debugger
    ) {
        this.getCurrentBlockNumber = getCurrentBlockNumber
        this.pollTimeout = pollTimeout
        this.pollRetryInterval = pollRetryInterval
        this.debug = debug
    }

    async waitUntilIndexed(blockNumber: number): Promise<void> {
        this.debug(`wait until The Graph is synchronized to block ${blockNumber}`)
        const gate = this.getOrCreateGate(blockNumber)
        await withTimeout(
            gate.check(),
            this.pollTimeout,
            `timed out while waiting for The Graph to synchronized to block ${blockNumber}`,
            () => this.gates.delete(gate)
        )
    }

    private getOrCreateGate(blockNumber: number): BlockNumberGate {
        const gate: BlockNumberGate | undefined = new BlockNumberGate(blockNumber)
        if (blockNumber > this.blockNumber) {
            const isPolling = this.gates.size > 0
            gate.close()
            this.gates.add(gate)
            if (!isPolling) {
                this.startPolling()
            }
        }
        return gate
    }

    /* eslint-disable no-constant-condition, no-await-in-loop, padding-line-between-statements */
    private async startPolling(): Promise<void> {
        this.debug('start polling')
        while (this.gates.size > 0) {
            const newBlockNumber = await this.getCurrentBlockNumber()
            if (newBlockNumber !== this.blockNumber) {
                this.blockNumber = newBlockNumber
                this.debug(`poll result: blockNumber=${this.blockNumber}`)
                this.gates.forEach((gate) => {
                    if (gate.blockNumber <= this.blockNumber) {
                        gate.open()
                        this.gates.delete(gate)
                    }
                })
            }
            if (this.gates.size > 0) {
                await wait(this.pollRetryInterval)
            }
        }
        this.debug('stop polling')
    }
}

@scoped(Lifecycle.ContainerScoped)
export class SynchronizedGraphQLClient {

    private delegate: GraphQLClient
    private requiredBlockNumber = 0
    private indexingState: IndexingState

    constructor(
        context: Context,
        @inject(GraphQLClient) delegate: GraphQLClient,
        @inject(ConfigInjectionToken.Root) clientConfig: StrictStreamrClientConfig
    ) {
        this.delegate = delegate
        this.indexingState = new IndexingState(
            () => this.delegate.getIndexBlockNumber(),
            // eslint-disable-next-line no-underscore-dangle
            clientConfig._timeouts.theGraph.timeout,
            // eslint-disable-next-line no-underscore-dangle
            clientConfig._timeouts.theGraph.retryInterval,
            context.debug.extend(instanceId(this))
        )
    }

    updateRequiredBlockNumber(blockNumber: number) {
        this.requiredBlockNumber = Math.max(blockNumber, this.requiredBlockNumber)
    }

    async sendQuery(gqlQuery: string): Promise<any> {
        await this.indexingState.waitUntilIndexed(this.requiredBlockNumber)
        return this.delegate.sendQuery(gqlQuery)
    }

    async* fetchPaginatedResults<T extends { id: string }>(
        createQuery: (lastId: string, pageSize: number) => string,
        pageSize?: number
    ): AsyncGenerator<T, void, undefined> {
        await this.indexingState.waitUntilIndexed(this.requiredBlockNumber)
        yield* this.delegate.fetchPaginatedResults(createQuery, pageSize)
    }
}
