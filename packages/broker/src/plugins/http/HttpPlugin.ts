import { createEndpoint } from './publishEndpoint'
import { Plugin } from '../../Plugin'

export class HttpPlugin extends Plugin<void> {
    async start(): Promise<void> {
        this.addHttpServerRouter(createEndpoint(this.streamrClient!))
    }

    // eslint-disable-next-line class-methods-use-this
    async stop(): Promise<void> {
    }
}
