import { scoped, Lifecycle, inject } from 'tsyringe'
import { Contract, ContractInterface, ContractReceipt, ContractTransaction } from '@ethersproject/contracts'
import { Signer } from '@ethersproject/abstract-signer'
import { GraphQLClient } from './GraphQLClient'
import { ConfigInjectionToken, StrictStreamrClientConfig } from '../Config'
import { ObservableContract, withErrorHandlingAndLogging } from './contract'
import { EthereumAddress } from 'streamr-client-protocol'
import Gate from './Gate'

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

// TODO import this from a library (e.g. streamr-test-utils if that is no longer a test-only dependency)
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const timeout = async (
    waitTimeMs: number,
    errorMessage: string,
    callback: () => void
): Promise<void> => {
    await wait(waitTimeMs)
    callback()
    throw new Error(errorMessage)
}

class IndexingState {
    private blockNumber = 0
    private gates: Map<number, Gate> = new Map()
    private getCurrentBlockNumber: () => Promise<number>
    private pollTimeout: number
    private pollRetryInterval: number

    constructor(getCurrentBlockNumber: () => Promise<number>, pollTimeout: number, pollRetryInterval: number) {
        this.getCurrentBlockNumber = getCurrentBlockNumber
        this.pollTimeout = pollTimeout
        this.pollRetryInterval = pollRetryInterval
    }

    async waitUntiIndexed(blockNumber: number): Promise<void> {
        const gate = this.getOrCreateGate(blockNumber)
        await Promise.race([
            gate.check(),
            timeout(
                this.pollTimeout,
                `timed out while waiting for The Graph index update for block ${blockNumber}`,
                () => this.removeGate(blockNumber)
            )
        ])
    }

    private getOrCreateGate(blockNumber: number): Gate {
        let gate: Gate | undefined = new Gate()
        if (blockNumber > this.blockNumber) {
            gate = this.gates.get(blockNumber)
            if (gate === undefined) {
                const isPolling = this.gates.size > 0
                gate = new Gate()
                gate.close()
                this.gates.set(blockNumber, gate)
                if (!isPolling) {
                    this.startPolling()
                }
            }
        }
        return gate
    }

    private removeGate(blockNumber: number): void {
        this.gates.delete(blockNumber)
    }

    /* eslint-disable no-constant-condition, no-await-in-loop, padding-line-between-statements */
    private async startPolling(): Promise<void> {
        while (true) {
            this.blockNumber = await this.getCurrentBlockNumber()
            const gate = this.gates.get(this.blockNumber)
            if (gate !== undefined) {
                gate.open()
                this.gates.delete(this.blockNumber)
            }
            if (this.gates.size === 0) {
                return
            }
            await wait(this.pollRetryInterval)
        }
    }
}

@scoped(Lifecycle.ContainerScoped)
export class SynchronizedGraphQLClient {

    private delegate: GraphQLClient
    private requiredBlockNumber = 0
    private indexingState: IndexingState

    constructor(
        @inject(GraphQLClient) delegate: GraphQLClient,
        @inject(ConfigInjectionToken.Root) clientConfig: StrictStreamrClientConfig
    ) {
        this.delegate = delegate
        this.indexingState = new IndexingState(
            this.delegate.getIndexBlockNumber,
            // eslint-disable-next-line no-underscore-dangle
            clientConfig._timeouts.theGraph.timeout,
            // eslint-disable-next-line no-underscore-dangle
            clientConfig._timeouts.theGraph.retryInterval
        )
    }

    updateRequiredBlockNumber(blockNumber: number) {
        this.requiredBlockNumber = Math.max(blockNumber, this.requiredBlockNumber)
    }

    async sendQuery(gqlQuery: string): Promise<Object> {
        await this.indexingState.waitUntiIndexed(this.requiredBlockNumber)
        return this.delegate.sendQuery(gqlQuery)
    }

    async* fetchPaginatedResults<T extends { id: string }>(
        createQuery: (lastId: string, pageSize: number) => string,
        pageSize?: number
    ): AsyncGenerator<T, void, undefined> {
        await this.indexingState.waitUntiIndexed(this.requiredBlockNumber)
        yield* this.delegate.fetchPaginatedResults(createQuery, pageSize)
    }
}
