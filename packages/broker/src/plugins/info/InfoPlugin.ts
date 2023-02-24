import { Request, Response } from 'express'
import { HttpServerEndpoint, Plugin } from '../../Plugin'

export class InfoPlugin extends Plugin<void> {

    async start(): Promise<void> {
        this.addHttpServerEndpoint(this.createEndpoint())
    }

    private createEndpoint(): HttpServerEndpoint {
        return {
            path: '/info',
            method: 'get',
            requestHandlers: [async (_req: Request, res: Response) => {
                const node = await this.streamrClient.getNode()
                res.json({
                    nodeId: node.getNodeId()
                })
            }]
        }
    }

    // eslint-disable-next-line class-methods-use-this
    async stop(): Promise<void> {
    }
}
