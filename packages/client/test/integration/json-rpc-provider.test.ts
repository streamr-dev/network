import { randomEthereumAddress } from '@streamr/test-utils'
import { range, sortBy } from 'lodash'
import { QUORUM } from '../../src/RpcProviderFactory'
import { StreamrClient } from '../../src/StreamrClient'
import { CHAIN_ID, ErrorState, FakeJsonRpcServer, JsonRpcRequest } from '../test-utils/FakeJsonRpcServer'

const SERVER_COUNT = 3

describe('use JsonRpcProvider', () => {

    let client: StreamrClient
    let servers: FakeJsonRpcServer[]

    const getNewRequests = (minTimestamp: number): JsonRpcRequest[] => {
        return sortBy(servers.map((s) => s.getRequests().filter((r) => r.timestamp >= minTimestamp)).flat(), (r) => r.timestamp)
    }

    const runErrorTest = async (errorState: ErrorState): Promise<JsonRpcRequest[]> => {
        await client.isStreamPublisher('/stream1', randomEthereumAddress())
        const errorServer = servers[0]
        errorServer.setError(errorState)
        let now: number
        let hasQueriedErrorServer = false
        do {
            now = Date.now()
            await client.isStreamPublisher('/stream1', randomEthereumAddress())
            hasQueriedErrorServer = getNewRequests(now).some((r) => r.serverPort === errorServer.getPort())
        } while (!hasQueriedErrorServer)
        return getNewRequests(now).filter((r) => r.method === 'eth_call')
    }

    beforeEach(async () => {
        servers = await Promise.all(range(SERVER_COUNT).map(async () => {
            const server = new FakeJsonRpcServer()
            await server.start()
            return server
        }))
        client = new StreamrClient({
            contracts: {
                streamRegistryChainRPCs: {
                    name: 'mock-name',
                    chainId: CHAIN_ID,
                    rpcs: servers.map((server) => ({
                        url: `http://localhost:${server.getPort()}`
                    }))
                }
            }
        })
    })

    afterEach(async () => {
        await Promise.all(servers.map((server) => server.stop()))
        await client.destroy()
    })

    it('reads from multiple servers', async () => {
        const now = Date.now()
        await client.isStreamPublisher('/stream1', '0x0000000000000000000000000000000000000010')
        const requests = getNewRequests(now).filter((r) => r.method === 'eth_call')
        expect(requests).toHaveLength(QUORUM)
    })

    it('uses another server, if server sends HTTP 503 response', async () => {
        const requests = await runErrorTest({ httpStatus: 503 } )
        expect(requests).toHaveLength(QUORUM + 1)
    })

    it('uses another server, if server sends HTTP 429 response', async () => {
        const requests = await runErrorTest({ httpStatus: 429 })
        expect(requests.length).toBeGreaterThanOrEqual(QUORUM + 1)
        // seems that the FallbackProvider retries the 429 server several times before it moves on
        expect(requests.length).toBeLessThanOrEqual(10)  // not a strict limit, just asserting that we get some finite count of requests
    })

    it('uses another server, if server doesn\'t respond', async () => {
        const requests = await runErrorTest('doNotRespond')
        expect(requests).toHaveLength(QUORUM + 1)
    }, 30 * 1000)

    it('reading information from contract doesn\'t cause multiple chainId requests', async () => {
        await client.isStreamPublisher('/stream1', randomEthereumAddress())
        const now = Date.now()
        await client.isStreamPublisher('/stream1', randomEthereumAddress())
        await client.isStreamPublisher('/stream1', randomEthereumAddress())
        const requests = getNewRequests(now).filter((r) => r.method === 'eth_chainId')
        expect(requests).toHaveLength(0)
    })
})
