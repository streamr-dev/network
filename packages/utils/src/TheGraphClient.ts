import { Gate } from './Gate'
import { Logger } from './Logger'
import { wait } from './wait'
import { TimeoutError, withTimeout } from './withTimeout'

export interface GraphQLQuery {
    query: string
    variables?: Record<string, any>
}

/**
 * Query one entity with queryEntity method, and a list of entitities with queryEntities method.
 * The queryEntities method does pagination automatically.
 *
 * If we want to ensure that The Graph index is up-to-date, we can call the updateRequiredBlockNumber()
 * method. In that case a queryEntity()/queryEntities() waits until The Graph has been indexed at least
 * to that block number. If the indexing takes longer than opts.indexTimeout, the query call rejects
 * with a TimeoutError.
 */
export class TheGraphClient {
    private requiredBlockNumber = 0
    private readonly indexingState: IndexingState
    private readonly serverUrl: string
    private readonly fetch: (url: string, init?: Record<string, unknown>) => Promise<Response>
    private readonly logger: Logger

    constructor(opts: {
        serverUrl: string
        fetch: (url: string, init?: Record<string, unknown>) => Promise<Response>
        logger?: Logger
        indexTimeout?: number
        indexPollInterval?: number
    }) {
        this.serverUrl = opts.serverUrl
        this.fetch = opts.fetch
        this.logger = opts.logger ?? new Logger(module)
        this.indexingState = new IndexingState(
            () => this.getIndexBlockNumber(),
            opts.indexTimeout ?? 60000,
            opts.indexPollInterval ?? 1000,
            this.logger
        )
    }

    async queryEntity<T extends object>(query: GraphQLQuery): Promise<T> {
        await this.indexingState.waitUntilIndexed(this.requiredBlockNumber)
        return this.sendQuery(query)
    }

    async *queryEntities<T extends { id: string }>(
        createQuery: (lastId: string, pageSize: number) => GraphQLQuery,
        /*
         * For simple queries there is one root level property, e.g. "streams" or "permissions"
         * which contain array of items. If the query contains more than one root level property
         * or we want to return non-root elements as items, the caller must pass a custom
         * function to parse the items.
         */
        parseItems: (response: any) => T[] = (response: any) => {
            const rootKey = Object.keys(response)[0]
            return response[rootKey]
        },
        pageSize = 1000
    ): AsyncGenerator<T, void, undefined> {
        await this.indexingState.waitUntilIndexed(this.requiredBlockNumber)
        let lastResultSet: T[] | undefined
        do {
            const lastId = lastResultSet !== undefined ? lastResultSet[lastResultSet.length - 1].id : ''
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
                accept: '*/*'
            },
            body: JSON.stringify(query)
        })
        const resText = await res.text()
        let resJson
        try {
            resJson = JSON.parse(resText)
        } catch {
            throw new Error(`GraphQL query failed with "${resText}"`)
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
        const response: any = await this.sendQuery({ query: '{ _meta { block { number } } }' })
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

class BlockNumberGate extends Gate {
    blockNumber: number

    constructor(blockNumber: number) {
        super(true)
        this.blockNumber = blockNumber
    }
}

class IndexingState {
    private blockNumber = 0
    private gates: Set<BlockNumberGate> = new Set()
    private readonly getCurrentBlockNumber: () => Promise<number | undefined>
    private readonly timeout: number
    private readonly pollInterval: number
    private readonly logger: Logger

    constructor(getCurrentBlockNumber: () => Promise<number>, timeout: number, pollInterval: number, logger: Logger) {
        this.getCurrentBlockNumber = async () => {
            try {
                return await getCurrentBlockNumber()
            } catch (err) {
                logger.warn('Failed to get current block number', { reason: err?.reason })
                return undefined
            }
        }
        this.timeout = timeout
        this.pollInterval = pollInterval
        this.logger = logger
    }

    async waitUntilIndexed(blockNumber: number): Promise<void> {
        this.logger.debug('Wait until The Graph is synchronized', { blockTarget: blockNumber })
        const gate = this.getOrCreateGate(blockNumber)
        try {
            await withTimeout(
                gate.waitUntilOpen(),
                this.timeout,
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
            if (newBlockNumber !== undefined && newBlockNumber !== this.blockNumber) {
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
                await wait(this.pollInterval)
            }
        }
        this.logger.trace('Stop polling')
    }
}
