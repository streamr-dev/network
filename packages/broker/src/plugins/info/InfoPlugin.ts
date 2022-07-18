import express, { Request, Response } from 'express'
import { Plugin } from '../../Plugin'

export class InfoPlugin extends Plugin<void> {
    async start(): Promise<void> {
        this.addHttpServerRouter(this.createEndpoint())
    }

    private createEndpoint(): express.Router {
        const router = express.Router()
        router.get('/info', async (_req: Request, res: Response) => {
            const node = await this.streamrClient.getNode()
            res.json({
                nodeId: node.getNodeId()
            })
        })
        return router
    }

    async stop(): Promise<void> {
    }
}
