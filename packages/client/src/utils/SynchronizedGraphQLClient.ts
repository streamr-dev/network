import { scoped, Lifecycle, inject } from 'tsyringe'
import { GraphQLClient } from './GraphQLClient'
import { ConfigInjectionToken, TimeoutsConfig } from '../Config'
import { Gate } from './Gate'
import { Logger, TimeoutError, withTimeout } from '@streamr/utils'
import { wait } from '@streamr/utils'
import { LoggerFactory } from './LoggerFactory'

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
    private readonly getCurrentBlockNumber: () => Promise<number>
    private readonly pollTimeout: number
    private readonly pollRetryInterval: number
    private readonly logger: Logger

    constructor(
        getCurrentBlockNumber: () => Promise<number>,
        pollTimeout: number,
        pollRetryInterval: number,
        loggerFactory: LoggerFactory
    ) {
        this.getCurrentBlockNumber = getCurrentBlockNumber
        this.pollTimeout = pollTimeout
        this.pollRetryInterval = pollRetryInterval
        this.logger = loggerFactory.createLogger(module)
    }

    async waitUntilIndexed(blockNumber: number): Promise<void> {
        this.logger.debug('waiting until The Graph is synchronized to block %d', blockNumber)
        const gate = this.getOrCreateGate(blockNumber)
        try {
            await withTimeout(
                gate.check(),
                this.pollTimeout,
                `The Graph did not synchronize to block ${blockNumber}`
            )
        } catch (e) {
            if (e instanceof TimeoutError) {
                this.gates.delete(gate)
            }
            throw e
        }
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

    private async startPolling(): Promise<void> {
        this.logger.trace('start polling')
        while (this.gates.size > 0) {
            const newBlockNumber = await this.getCurrentBlockNumber()
            if (newBlockNumber !== this.blockNumber) {
                this.blockNumber = newBlockNumber
                this.logger.trace('poll result is blockNumber=%d', this.blockNumber)
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
        this.logger.trace('stop polling')
    }
}

@scoped(Lifecycle.ContainerScoped)
export class SynchronizedGraphQLClient {

    private delegate: GraphQLClient
    private requiredBlockNumber = 0
    private indexingState: IndexingState

    constructor(
        @inject(LoggerFactory) loggerFactory: LoggerFactory,
        @inject(GraphQLClient) delegate: GraphQLClient,
        @inject(ConfigInjectionToken.Timeouts) timeoutsConfig: TimeoutsConfig
    ) {
        this.delegate = delegate
        this.indexingState = new IndexingState(
            () => this.delegate.getIndexBlockNumber(),
            timeoutsConfig.theGraph.timeout,
            timeoutsConfig.theGraph.retryInterval,
            loggerFactory
        )
    }

    updateRequiredBlockNumber(blockNumber: number): void {
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
