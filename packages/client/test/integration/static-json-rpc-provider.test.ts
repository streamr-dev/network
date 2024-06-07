import { Logger } from '@streamr/utils'
import { keccak256, toUtf8Bytes } from 'ethers'
import { once } from 'events'
import express, { Request, Response } from 'express'
import { StreamrClient } from '../../src/StreamrClient'

const MOCK_CHAIN_ID = 5555
const TRUE = '0x0000000000000000000000000000000000000000000000000000000000000001'
const SERVER_PORT = 9999

const logger = new Logger(module)

const toHex = (val: number) => {
    return '0x' + val.toString(16)
}

const getLabelHash = (methodSignature: string) => keccak256(toUtf8Bytes(methodSignature))

const getContractMethodHash = (methodSignature: string) => getLabelHash(methodSignature).substring(2, 10)

interface JsonRpcRequest {
    method: string
}

const startServer = async (): Promise<{ getRequests: () => JsonRpcRequest[], stop: () => Promise<void> }> => {
    const requests: JsonRpcRequest[] = []
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
        const sendResponse = (result: any) => {
            res.json(createResponse(result, req.body.id))
        }
        const method = req.body.method
        requests.push({ method })
        if (method === 'eth_chainId') {
            sendResponse(toHex(MOCK_CHAIN_ID))
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
    const server = app.listen(SERVER_PORT)
    await once(server, 'listening')
    return {
        getRequests: () => requests,
        stop: async () => {
            server.close()
            await once(server, 'close')
        }
    }
}

describe('use StaticJsonRpcProvider', () => {

    it('reading information from contract doesn\'t cause multiple chainId requests', async () => {
        const server = await startServer()
        const client = new StreamrClient({
            contracts: {
                ethereumNetwork: {
                    chainId: MOCK_CHAIN_ID
                },
                rpcs: [{
                    url: `http://localhost:${SERVER_PORT}`
                }]
            }
        })

        await client.isStreamPublisher('/stream1', '0x0000000000000000000000000000000000000010')
        const chainIdRequestCountAfterFirstRead = server.getRequests().filter((r) => r.method === 'eth_chainId').length
        await client.isStreamPublisher('/stream1', '0x0000000000000000000000000000000000000020')
        await client.isStreamPublisher('/stream1', '0x0000000000000000000000000000000000000030')
        const chainIdRequestCountAfterAllReads = server.getRequests().filter((r) => r.method === 'eth_chainId').length
        expect(chainIdRequestCountAfterFirstRead).toEqual(chainIdRequestCountAfterAllReads)

        await client.destroy()
        await server.stop()
    })
})
