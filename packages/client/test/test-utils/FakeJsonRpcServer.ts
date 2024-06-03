import { Logger } from '@streamr/utils'
import { keccak256, toUtf8Bytes, AbiCoder } from 'ethers'
import { once } from 'events'
import express, { Request, Response } from 'express'
import { Server } from 'http'
import { AddressInfo } from 'net'
import { promisify } from 'util'
import { isArray } from 'lodash'

export const CHAIN_ID = 5555
const TRUE = '0x0000000000000000000000000000000000000000000000000000000000000001'
const BLOCK_NUMBER = 123
const EVENT_STREAM_ID = '0x0000000000000000000000000000000000000001/foo'

const toHex = (val: number) => {
    return '0x' + val.toString(16)
}

const getLabelHash = (methodSignature: string) => keccak256(toUtf8Bytes(methodSignature))

const getContractMethodHash = (methodSignature: string) => getLabelHash(methodSignature).substring(2, 10)

const getEventTopicHash = (eventSignature: string) => getLabelHash(eventSignature)

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
            new Logger(module).info('REQUEST: ' + JSON.stringify(requests))
            this.requests.push(...requests)
            if (this.errorState !== undefined) {
                new Logger(module).error('ERROR STATE: ' + JSON.stringify(this.errorState))
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
            //new Logger(module).info('SIZE=' + requests.length + ' ' + JSON.stringify(requests))
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
        } else if (request.method === 'eth_getLogs') {
            const topics = request.params[0].topics
            if (topics.length !== 1) {
                throw new Error('Not implemented')
            }
            if ((topics[0] === getEventTopicHash('StreamCreated(string,string)'))) {
                if (request.params[0].toBlock !== 'latest') {
                    throw new Error('Not implemented')
                }
                const fromBlock = parseInt(request.params[0].fromBlock, 16)
                if (BLOCK_NUMBER >= fromBlock) {
                    const data = new AbiCoder().encode(['string', 'string'], [EVENT_STREAM_ID, JSON.stringify({ partitions: 1 })])
                    return [{
                        address: request.params[0].address,
                        topics,
                        data,
                        blockNumber: toHex(BLOCK_NUMBER),
                        transactionHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
                        transactionIndex: '0x0',
                        blockHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
                        logIndex: '0x0',
                        removed: false
                    }]
                } else {
                    return []
                }
            } else {
                throw new Error(`Unknown topic: ${request.method}, request: ${JSON.stringify(request)}`)
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
