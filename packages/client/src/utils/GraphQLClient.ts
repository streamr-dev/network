import fetch from 'node-fetch'
import { scoped, Lifecycle, inject } from 'tsyringe'
import { instanceId } from './index'
import { Config, StrictStreamrClientConfig } from '../Config'
import { Context } from './Context'
import { Debugger } from 'debug'

@scoped(Lifecycle.ContainerScoped)
export class GraphQLClient {

    private debug: Debugger

    constructor(
        context: Context,
        @inject(Config.Root) private config: StrictStreamrClientConfig
    ) {
        this.debug = context.debug.extend(instanceId(this))
    }

    async sendQuery(gqlQuery: string): Promise<Object> {
        this.debug('GraphQL query: %s', gqlQuery)
        const res = await fetch(this.config.theGraphUrl, {
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
        this.debug('GraphQL response: %o', resJson)
        if (!resJson.data) {
            if (resJson.errors && resJson.errors.length > 0) {
                throw new Error('GraphQL query failed: ' + JSON.stringify(resJson.errors.map((e: any) => e.message)))
            } else {
                throw new Error('GraphQL query failed')
            }
        }
        return resJson.data
    }
}
