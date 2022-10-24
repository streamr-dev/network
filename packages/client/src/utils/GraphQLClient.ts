import { scoped, Lifecycle, inject } from 'tsyringe'
import { ConfigInjectionToken, ConnectionConfig } from '../Config'
import { HttpFetcher } from './HttpFetcher'
import { LoggerFactory } from './LoggerFactory'
import { Logger } from '@streamr/utils'

@scoped(Lifecycle.ContainerScoped)
export class GraphQLClient {
    private readonly logger: Logger

    constructor(
        @inject(LoggerFactory) loggerFactory: LoggerFactory,
        @inject(HttpFetcher) private httpFetcher: HttpFetcher,
        @inject(ConfigInjectionToken.Connection) private config: ConnectionConfig,
    ) {
        this.logger = loggerFactory.createLogger(module)
    }

    async sendQuery(gqlQuery: string): Promise<any> {
        this.logger.debug('GraphQL query: %s', gqlQuery)
        const res = await this.httpFetcher.fetch(this.config.theGraphUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                accept: '*/*',
            },
            body: gqlQuery
        })
        const resText = await res.text()
        let resJson
        try {
            resJson = JSON.parse(resText)
        } catch {
            throw new Error(`GraphQL query failed with "${resText}", check that your theGraphUrl="${this.config.theGraphUrl}" is correct`)
        }
        this.logger.debug('GraphQL response: %j', resJson)
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
        createQuery: (lastId: string, pageSize: number) => string,
        pageSize = 1000
    ): AsyncGenerator<T, void, undefined> {
        let lastResultSet: T[] | undefined
        do {
            const lastId = (lastResultSet !== undefined) ? lastResultSet[lastResultSet.length - 1].id : ''
            const query = createQuery(lastId, pageSize)
            const response = await this.sendQuery(query)
            const rootKey = Object.keys(response)[0] // there is a always a one root level property, e.g. "streams" or "permissions"
            const items: T[] = (response as any)[rootKey] as T[]
            yield* items
            lastResultSet = items
        } while (lastResultSet.length === pageSize)
    }

    async getIndexBlockNumber(): Promise<number> {
        const gqlQuery = JSON.stringify({
            query: '{ _meta { block { number } } }'
        })
        const response: any = await this.sendQuery(gqlQuery)
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
