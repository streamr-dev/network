import { Logger } from '@streamr/utils'
import { keccak256, toUtf8Bytes } from 'ethers'
import { once } from 'events'
import express, { Request, Response } from 'express'
import { Server } from 'http'
import { AddressInfo } from 'net'
import { promisify } from 'util'
import { isArray } from 'lodash'

export const CHAIN_ID = 5555
const TRUE = '0x0000000000000000000000000000000000000000000000000000000000000001'
const BLOCK_NUMBER = 123

const toHex = (val: number) => {
    return '0x' + val.toString(16)
}

const getLabelHash = (methodSignature: string) => keccak256(toUtf8Bytes(methodSignature))

const getContractMethodHash = (methodSignature: string) => getLabelHash(methodSignature).substring(2, 10)

export interface JsonRpcRequest {
    id: string
    method: string
    params: any[]
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
        app.post('/', async (httpRequest: Request, httpResponse: Response) => {
            const requests = this.parseRpcRequests(httpRequest)
            this.requests.push(...requests)
            if (this.errorState !== undefined) {
                if (this.errorState !== 'doNotRespond') {
                    httpResponse.sendStatus(this.errorState.httpStatus)
                } else {
                    this.pendingResponses.push(httpResponse)
                }
                return
            }
            const responses = requests.map((req) => ({
                jsonrpc: '2.0',
                id: req.id,
                result: this.createResult(req)
            }))
            new Logger(module).info('SIZE=' + requests.length + ' ' + JSON.stringify(requests))
            const responseJson = (requests.length === 1) ? responses[0] : responses
            httpResponse.json(responseJson)
        })
        this.httpServer = app.listen(0)  // uses random port
        await once(this.httpServer, 'listening')
    }

    private parseRpcRequests(httpRequest: Request): JsonRpcRequest[] {
        const timestamp = Date.now()
        const serverPort = this.getPort()
        const items = isArray(httpRequest.body) ? httpRequest.body : [httpRequest.body]
        return items.map((item) => ({ 
            id: item.id,
            method: item.method,
            params: item.params,
            timestamp,
            serverPort
        }))
    }

    // eslint-disable-next-line class-methods-use-this
    private createResult(request: JsonRpcRequest): any {
        if (request.method === 'eth_chainId') {
            return toHex(CHAIN_ID)
        } else if (request.method === 'eth_blockNumber') {
            return toHex(BLOCK_NUMBER)
        } else if (request.method === 'eth_call') {
            const data = request.params[0].data
            const contractMethodHash = data.substring(2, 10)
            if (contractMethodHash === getContractMethodHash('hasPermission(string,address,uint8)')) {
                return TRUE
            } else {
                throw new Error(`Unknown contract method: ${contractMethodHash}, request: ${JSON.stringify(request)}`)
            }
        } else {
            throw new Error(`Unknown method: ${request.method}, request: ${JSON.stringify(request)}`)
        }
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
