import { Logger } from '@streamr/utils'
import { once } from 'events'
import express, { Request, Response } from 'express'
import { Server } from 'http'
import { AddressInfo } from 'net'

export interface ProxyHttpServerRequest {
    body?: any
    response: any
    timestamp: number
}

const logger = new Logger(module)

/**
 * Forwards requests to targetUrl. Supports only JSON requests and responses.
 */
export class ProxyHttpServer {
    private httpServer?: Server
    private readonly targetUrl: string
    private readonly requests: ProxyHttpServerRequest[] = []

    constructor(targetUrl: string) {
        this.targetUrl = targetUrl
    }

    async start(): Promise<void> {
        logger.debug('Starting proxy server')
        const app = express()
        app.use(express.json())
        app.all('/', async (req: Request, res: Response) => {
            logger.debug('Query proxy server', { body: req.body })
            const isPost = req.method === 'POST'
            const requestInit: RequestInit = {
                method: req.method,
                body: isPost ? JSON.stringify(req.body) : undefined
            }
            const targetResponse = await fetch(this.targetUrl, requestInit)
            const targetBody = await targetResponse.json()
            res.json(targetBody)
            this.requests.push({
                body: isPost ? req.body : undefined,
                response: targetBody,
                timestamp: Date.now()
            })
        })
        this.httpServer = app.listen(0) // uses random port
        await once(this.httpServer, 'listening')
        logger.debug(`Started proxy server at port ${this.getPort()}`)
    }

    async stop(): Promise<void> {
        this.httpServer!.close()
        await once(this.httpServer!, 'close')
        logger.debug('Stopped proxy server')
    }

    getRequests(): ProxyHttpServerRequest[] {
        return this.requests
    }

    getPort(): number {
        return (this.httpServer!.address() as AddressInfo).port
    }
}
