import { AbiCoder, id } from 'ethers'
import { once } from 'events'
import express, { Request, Response } from 'express'
import { Server } from 'http'
import { intersection, isArray } from 'lodash'
import { AddressInfo } from 'net'
import { promisify } from 'util'
import { formEthereumFunctionSelector, parseEthereumFunctionSelectorFromCallData } from './utils'

export const CHAIN_ID = 5555
const BLOCK_NUMBER = 123
const EVENT_STREAM_ID = '0x0000000000000000000000000000000000000001/foo'

const toHex = (val: number) => {
    return '0x' + val.toString(16)
}

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
    private errorStates: Map<string, ErrorState> = new Map()
    private httpServer?: Server
    private pendingResponses: Response[] = []

    async start(): Promise<void> {
        const app = express()
        app.use(express.json())
        app.post('/', async (httpRequest: Request, httpResponse: Response) => {
            const requests = this.parseRpcRequests(httpRequest)
            this.requests.push(...requests)
            // Note that a batch can contain requests to multiple methods. As we can't do partial failures,
            // we fail the whole batch if just some of the method is defined to be an error.
            const errorMethods = intersection(
                requests.map((r) => r.method),
                [...this.errorStates.keys()]
            )
            if (errorMethods.length > 0) {
                const errorState = this.errorStates.get(errorMethods[0])! // pick some error state if multiple methods match the request
                if (errorState !== 'doNotRespond') {
                    httpResponse.sendStatus(errorState.httpStatus)
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
            const responseJson = requests.length === 1 ? responses[0] : responses
            httpResponse.json(responseJson)
        })
        this.httpServer = app.listen(0) // uses random port
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
            const data: string = request.params[0].data
            const functionSelector = parseEthereumFunctionSelectorFromCallData(data)
            if (functionSelector === formEthereumFunctionSelector('getPermissionsForUserId(string,bytes)')) {
                // PermissionStructOutput: { canEdit: false, canDelete: false, publishExpiration: 0n, subscribeExpiration: 0n, canGrant: false }
                return '0x' + '0'.repeat(320)
            } else {
                throw new Error(`Unknown contract method: ${functionSelector}, request: ${JSON.stringify(request)}`)
            }
        } else if (request.method === 'eth_getLogs') {
            const topics = request.params[0].topics
            const topicId = id('StreamCreated(string,string)')
            if (topics.length !== 1 || topics[0] !== topicId) {
                throw new Error('Not implemented')
            }
            if (request.params[0].toBlock !== 'latest') {
                throw new Error('Not implemented')
            }
            const fromBlock = parseInt(request.params[0].fromBlock, 16)
            if (BLOCK_NUMBER >= fromBlock) {
                const data = new AbiCoder().encode(
                    ['string', 'string'],
                    [EVENT_STREAM_ID, JSON.stringify({ partitions: 1 })]
                )
                return [
                    {
                        address: request.params[0].address,
                        topics: [topicId],
                        data,
                        blockNumber: toHex(BLOCK_NUMBER),
                        transactionHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
                        transactionIndex: '0x0',
                        blockHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
                        logIndex: '0x0',
                        removed: false
                    }
                ]
            } else {
                return []
            }
        } else {
            throw new Error(`Unknown method: ${request.method}, request: ${JSON.stringify(request)}`)
        }
    }

    async stop(): Promise<void> {
        const closableResponses = this.pendingResponses.filter((r) => !r.closed)
        for (const r of closableResponses) {
            await promisify(r.end.bind(r))()
        }
        this.httpServer!.close()
        await once(this.httpServer!, 'close')
    }

    setError(method: string, state: ErrorState | undefined): void {
        if (state !== undefined) {
            this.errorStates.set(method, state)
        } else {
            this.errorStates.delete(method)
        }
    }

    clearRequests(): void {
        this.requests = []
    }

    getRequests(): JsonRpcRequest[] {
        return this.requests
    }

    getPort(): number {
        return (this.httpServer!.address() as AddressInfo).port
    }
}
