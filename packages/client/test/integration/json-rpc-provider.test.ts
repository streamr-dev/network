import 'reflect-metadata'

import { randomEthereumAddress } from '@streamr/test-utils'
import { wait, waitForCondition } from '@streamr/utils'
import { range, sortBy } from 'lodash'
import { QUORUM } from '../../src/RpcProviderSource'
import { StreamrClient } from '../../src/StreamrClient'
import { StreamCreationEvent } from '../../src/contracts/StreamRegistry'
import { CHAIN_ID, ErrorState, FakeJsonRpcServer, JsonRpcRequest } from '../test-utils/FakeJsonRpcServer'

const SERVER_COUNT = 3
const POLL_INTERVAL = 500
const TIMEOUT = 2000

describe('use JsonRpcProvider', () => {

    let client: StreamrClient
    let servers: FakeJsonRpcServer[]

    const getRequests = () => {
        return sortBy(servers.map((s) => s.getRequests()).flat(), (r) => r.timestamp)
    }

    const getNewRequests = (minTimestamp: number): JsonRpcRequest[] => {
        return getRequests().filter((r) => r.timestamp >= minTimestamp)
    }

    beforeEach(async () => {
        servers = await Promise.all(range(SERVER_COUNT).map(async () => {
            const server = new FakeJsonRpcServer()
            await server.start()
            return server
        }))
        client = new StreamrClient({
            contracts: {
                ethereumNetwork: {
                    chainId: CHAIN_ID
                },
                rpcs: servers.map((server) => ({
                    url: `http://localhost:${server.getPort()}`
                })),
                pollInterval: POLL_INTERVAL
            },
            _timeouts: {
                jsonRpcTimeout: TIMEOUT
            }
        })
    })

    afterEach(async () => {
        await Promise.all(servers.map((server) => server.stop()))
        await client.destroy()
    })

    describe('read', () => {

        const runErrorTest = async (errorState: ErrorState): Promise<JsonRpcRequest[]> => {
            await client.isStreamPublisher('/stream1', randomEthereumAddress())
            const errorServer = servers[0]
            errorServer.setError('eth_call', errorState)
            let now: number
            let hasQueriedErrorServer = false
            do {
                now = Date.now()
                await client.isStreamPublisher('/stream1', randomEthereumAddress())
                hasQueriedErrorServer = getNewRequests(now).some((r) => r.serverPort === errorServer.getPort())
            } while (!hasQueriedErrorServer)
            return getNewRequests(now).filter((r) => r.method === 'eth_call')
        }

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
            expect(requests).toHaveLength(QUORUM + 1)
        })

        it('uses another server, if server doesn\'t respond', async () => {
            const requests = await runErrorTest('doNotRespond')
            expect(requests).toHaveLength(QUORUM + 1)
        })

        it('reading information from contract doesn\'t cause multiple chainId requests', async () => {
            await client.isStreamPublisher('/stream1', randomEthereumAddress())
            const now = Date.now()
            await client.isStreamPublisher('/stream1', randomEthereumAddress())
            await client.isStreamPublisher('/stream1', randomEthereumAddress())
            const requests = getNewRequests(now).filter((r) => r.method === 'eth_chainId')
            expect(requests).toHaveLength(0)
        })
    })

    describe('events', () => {

        const runErrorTest = async (errorState: ErrorState, extraWait = 0): Promise<void> => {
            servers.forEach((s) => s.setError('eth_getLogs', errorState))
            const receivedEvents: StreamCreationEvent[] = []
            client.on('createStream', (event: StreamCreationEvent) => {
                receivedEvents.push(event)
            })
            await waitForCondition(() => getRequests().some((r) => r.method === 'eth_getLogs'), 5000 + extraWait)
            servers.forEach((s) => s.setError('eth_getLogs', undefined))
            await wait(1.5 * POLL_INTERVAL + extraWait)
            expect(receivedEvents).toEqual([{
                streamId: '0x0000000000000000000000000000000000000001/foo',
                metadata: {
                    partitions: 1
                },
                blockNumber: 123
            }])
        }

        it('happy path', async () => {
            const receivedEvents: StreamCreationEvent[] = []
            const now = Date.now()
            client.on('createStream', (event: StreamCreationEvent) => {
                receivedEvents.push(event)
            })
            await wait(0.5 * POLL_INTERVAL)
            expect(getNewRequests(now).filter((r) => r.method === 'eth_getLogs')).toHaveLength(1)
            await wait(1.5 * POLL_INTERVAL)
            expect(getNewRequests(now).filter((r) => r.method === 'eth_getLogs')).toHaveLength(2)
            expect(receivedEvents).toEqual([{
                streamId: '0x0000000000000000000000000000000000000001/foo',
                metadata: {
                    partitions: 1
                },
                blockNumber: 123
            }])
        })

        it('continues polling after HTTP 503 response', async () => {
            await runErrorTest({ httpStatus: 503 })
        })

        it('continues polling after HTTP 429 response', async () => {
            await runErrorTest({ httpStatus: 429 })
        })
        
        it('continues polling, if server doesn\'t respond', async () => {
            await runErrorTest('doNotRespond', TIMEOUT)
        })
    })
})
