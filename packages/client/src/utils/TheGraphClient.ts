import { Logger, TimeoutError, wait, withTimeout } from '@streamr/utils'
import { Response } from 'node-fetch'
import { Lifecycle, inject, scoped } from 'tsyringe'
import { ConfigInjectionToken, StrictStreamrClientConfig } from '../Config'
import { Gate } from './Gate'
import { LoggerFactory } from './LoggerFactory'

export interface GraphQLQuery {
    query: string
    variables?: Record<string, any>
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
        this.logger.debug('Wait until The Graph is synchronized', { blockTarget: blockNumber })
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
        this.logger.trace('Start polling')
        while (this.gates.size > 0) {
            const newBlockNumber = await this.getCurrentBlockNumber()
            if (newBlockNumber !== this.blockNumber) {
                this.blockNumber = newBlockNumber
                this.logger.trace('Polled', { blockNumber: this.blockNumber })
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
        this.logger.trace('Stop polling')
    }
}

/*
 * TheGraphClient is used to query The Graph index. It is very similar to the GraphQLClient class 
 * and has identical public API for executing queries.
 *
 * In this class there is an additional method `updateRequiredBlockNumber(n)`. If that method
 * is called, then any subsequent query will provide up-to-date data from The Graph (i.e. data
 * which has been indexed at least to that block number).
 *
 * If TheGraphClient is used, the client instance should be notified about any transaction which
 * writes to the blockchain indexed by The Graph. That way we can ensure that all read queries
 * from The Graph correspond the data written in those transactions.
 *
 * The notification can be done by calling the `updateRequiredBlockNumber(n)` method described above.
 * We can use the helper method `createWriteContract` to create a contract which automatically
 * updates the client when something is written to the blockchain via that contract.
 */
@scoped(Lifecycle.ContainerScoped)
export class TheGraphClient {

    private requiredBlockNumber = 0
    private readonly indexingState: IndexingState
    private readonly serverUrl: string
    private readonly fetch: (url: string, init?: Record<string, unknown>) => Promise<Response>
    private readonly logger: Logger

    // TODO all dependencies without client-specific classes
    constructor(
        serverUrl: string,
        loggerFactory: LoggerFactory,
        fetch: (url: string, init?: Record<string, unknown>) => Promise<Response>,
        @inject(ConfigInjectionToken) config: Pick<StrictStreamrClientConfig, 'contracts' | '_timeouts'>
    ) {
        this.serverUrl = serverUrl
        this.logger = loggerFactory.createLogger(module)
        this.fetch = fetch
        this.indexingState = new IndexingState(
            () => this.getIndexBlockNumber(),
            // eslint-disable-next-line no-underscore-dangle
            config._timeouts.theGraph.timeout,
            // eslint-disable-next-line no-underscore-dangle
            config._timeouts.theGraph.retryInterval,
            loggerFactory
        )
    }

    async query(query: GraphQLQuery): Promise<any> {
        await this.indexingState.waitUntilIndexed(this.requiredBlockNumber)
        return this.sendQuery(query)
    }

    // TODO unify method naming (query vs. fetchPaginatedResults)
    async* fetchPaginatedResults<T extends { id: string }>(
        createQuery: (lastId: string, pageSize: number) => GraphQLQuery,
        /*
         * For simple queries there is one root level property, e.g. "streams" or "permissions"
         * which contain array of items. If the query contains more than one root level property
         * or we want to return non-root elements as items, the caller must pass a custom 
         * function to parse the items.
         */
        parseItems: ((response: any) => T[]) = (response: any) => {
            const rootKey = Object.keys(response)[0]
            return response[rootKey]
        },
        pageSize = 1000
    ): AsyncGenerator<T, void, undefined> {
        await this.indexingState.waitUntilIndexed(this.requiredBlockNumber)
        let lastResultSet: T[] | undefined
        do {
            const lastId = (lastResultSet !== undefined) ? lastResultSet[lastResultSet.length - 1].id : ''
            const query = createQuery(lastId, pageSize)
            const response = await this.sendQuery(query)
            const items: T[] = parseItems(response)
            yield* items
            lastResultSet = items
        } while (lastResultSet.length === pageSize)
    }

    updateRequiredBlockNumber(blockNumber: number): void {
        this.requiredBlockNumber = Math.max(blockNumber, this.requiredBlockNumber)
    }

    private async sendQuery(query: GraphQLQuery): Promise<any> {
        this.logger.trace('Send GraphQL query', { query })
        const res = await this.fetch(this.serverUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                accept: '*/*',
            },
            body: JSON.stringify(query)
        })
        const resText = await res.text()
        let resJson
        try {
            resJson = JSON.parse(resText)
        } catch {
            throw new Error(`GraphQL query failed with "${resText}", check that your theGraphUrl="${this.serverUrl}" is correct`)
        }
        this.logger.trace('Received GraphQL response', { resJson })
        if (!resJson.data) {
            if (resJson.errors && resJson.errors.length > 0) {
                throw new Error('GraphQL query failed: ' + JSON.stringify(resJson.errors.map((e: any) => e.message)))
            } else {
                throw new Error('GraphQL query failed')
            }
        }
        return resJson.data
    }

    private async getIndexBlockNumber(): Promise<number> {
        const response: any = await this.sendQuery({ query: '{ _meta { block { number } } }' } )
        // eslint-disable-next-line no-underscore-dangle
        return response._meta.block.number
    }

    static createWhereClause(variables: Record<string, any>): string {
        const parameterList = Object.keys(variables)
            .filter((k) => variables[k] !== undefined)
            .map((k) => k + ': $' + k)
            .join(' ')
        return `where: { ${parameterList} }`
    }
}
