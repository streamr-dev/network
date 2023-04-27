import { scoped, Lifecycle, inject } from 'tsyringe'
import { ConfigInjectionToken, StrictStreamrClientConfig } from '../Config'
import { HttpFetcher } from './HttpFetcher'
import { LoggerFactory } from './LoggerFactory'
import { Logger } from '@streamr/utils'

export interface GraphQLQuery {
    query: string
    variables?: Record<string, any>
}

@scoped(Lifecycle.ContainerScoped)
export class GraphQLClient {

    private httpFetcher: HttpFetcher
    private config: Pick<StrictStreamrClientConfig, 'contracts'>
    private readonly logger: Logger

    constructor(
        @inject(LoggerFactory) loggerFactory: LoggerFactory,
        @inject(HttpFetcher) httpFetcher: HttpFetcher,
        @inject(ConfigInjectionToken) config: Pick<StrictStreamrClientConfig, 'contracts'>
    ) {
        this.httpFetcher = httpFetcher
        this.config = config
        this.logger = loggerFactory.createLogger(module)
    }

    async sendQuery(query: GraphQLQuery): Promise<any> {
        this.logger.trace('Send GraphQL query', { query })
        const res = await this.httpFetcher.fetch(this.config.contracts.theGraphUrl, {
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
            throw new Error(`GraphQL query failed with "${resText}", check that your theGraphUrl="${this.config.contracts.theGraphUrl}" is correct`)
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
            return (response as any)[rootKey]
        },
        pageSize = 1000
    ): AsyncGenerator<T, void, undefined> {
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

    async getIndexBlockNumber(): Promise<number> {
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
