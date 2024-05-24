import { Logger } from '@streamr/utils'
import { keccak256, toUtf8Bytes } from 'ethers'
import { once } from 'events'
import express, { Request, Response } from 'express'
import { Server } from 'http'
import { AddressInfo } from 'net'
import { promisify } from 'util'

export const CHAIN_ID = 5555
const TRUE = '0x0000000000000000000000000000000000000000000000000000000000000001'
const BLOCK_NUMBER = 123

const logger = new Logger(module)

const toHex = (val: number) => {
    return '0x' + val.toString(16)
}

const getLabelHash = (methodSignature: string) => keccak256(toUtf8Bytes(methodSignature))

const getContractMethodHash = (methodSignature: string) => getLabelHash(methodSignature).substring(2, 10)

export interface JsonRpcRequest {
    method: string
    timestamp: number
    serverPort: number
}

export type ErrorState = { httpStatus: number } | 'doNotRespond'

export class FakeJsonRpcServer {

    private requests: JsonRpcRequest[] = []
    private errorState?: ErrorState = undefined
    private httpServer?: Server
    private pendingResponses: Response[] = []

    async start(): Promise<void> {
        const app = express()
        app.use(express.json())
        const createResponse = (result: any, requestId: any) => {
            return {
                jsonrpc: '2.0',
                id: requestId,
                result
            }
        }
        app.post('/', async (req: Request, res: Response) => {
            const method = req.body.method
            this.requests.push({ method, timestamp: Date.now(), serverPort: this.getPort() })
            if (this.errorState !== undefined) {
                if (this.errorState !== 'doNotRespond') {
                    res.sendStatus(this.errorState.httpStatus)
                } else {
                    this.pendingResponses.push(res)
                }
                return
            }
            const sendResponse = (result: any) => {
                res.json(createResponse(result, req.body.id))
            }
            if (method === 'eth_chainId') {
                sendResponse(toHex(CHAIN_ID))
            } else if (method === 'eth_blockNumber') {
                sendResponse(toHex(BLOCK_NUMBER))
            } else if (method === 'eth_call') {
                const data = req.body.params[0].data
                const contractMethodHash = data.substring(2, 10)
                if (contractMethodHash === getContractMethodHash('hasPermission(string,address,uint8)')) {
                    sendResponse(TRUE)
                } else {
                    logger.warn(`Unknown contract method: ${contractMethodHash}, request: ${JSON.stringify(req.body.params[0])}`)
                }
            } else {
                logger.warn(`Unknown method: ${method}, request: ${JSON.stringify(req.body)}`)
            }
        })
        this.httpServer = app.listen(0)  // uses random port
        await once(this.httpServer, 'listening')
    }

    async stop(): Promise<void> {
        for (const r of this.pendingResponses) {
            await promisify(r.end.bind(r))()
        }
        this.httpServer!.close()
        await once(this.httpServer!, 'close')
    }

    setError(state: ErrorState): void {
        this.errorState = state
    }

    getRequests(): JsonRpcRequest[] {
        return this.requests
    }

    getPort(): number {
        return (this.httpServer!.address() as AddressInfo).port
    }
}
