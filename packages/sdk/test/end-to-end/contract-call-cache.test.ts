import { config as CHAIN_CONFIG } from '@streamr/config'
import { fetchPrivateKeyWithGas } from '@streamr/test-utils'
import { collect, StreamID, until } from '@streamr/utils'
import { Wallet } from 'ethers'
import { StreamPermission } from '../../src/permission'
import { StreamrClient } from '../../src/StreamrClient'
import { ProxyHttpServer, ProxyHttpServerRequest } from '../test-utils/ProxyHttpServer'
import {
    createRelativeTestStreamId,
    createTestClient,
    createTestStream,
    formEthereumFunctionSelector,
    parseEthereumFunctionSelectorFromCallData
} from '../test-utils/utils'
import { nextValue } from './../../src/utils/iterators'

const waitForTheGraphToHaveIndexed = async (streamId: StreamID, client: StreamrClient): Promise<void> => {
    await until(async () => {
        const streams = await collect(client.searchStreams(streamId, undefined))
        return streams.length > 0
    })
}

describe('contract call cache', () => {
    describe('metadata', () => {
        let client: StreamrClient
        let authenticatedUser: Wallet
        let server: ProxyHttpServer
        let existingStreamId: StreamID
        const METADATA_QUERY_FUNCTION_SELECTOR = formEthereumFunctionSelector('getStreamMetadata(string)')

        const getMethodCalls = (): ProxyHttpServerRequest[] => {
            const methodCalls = server.getRequests().filter((r) => r.body.method === 'eth_call')
            return methodCalls.filter((c) => {
                return (
                    parseEthereumFunctionSelectorFromCallData(c.body.params[0].data) ===
                    METADATA_QUERY_FUNCTION_SELECTOR
                )
            })
        }

        beforeAll(async () => {
            authenticatedUser = new Wallet(await fetchPrivateKeyWithGas())
            const creator = createTestClient(await fetchPrivateKeyWithGas())
            existingStreamId = (await createTestStream(creator, module)).id
            creator.grantPermissions(existingStreamId, {
                userId: authenticatedUser.address,
                permissions: [StreamPermission.EDIT]
            })
            await creator.destroy()
            await waitForTheGraphToHaveIndexed(existingStreamId, creator)
        })

        beforeEach(async () => {
            server = new ProxyHttpServer(CHAIN_CONFIG.dev2.rpcEndpoints[0].url)
            await server.start()
            client = new StreamrClient({
                environment: 'dev2',
                auth: {
                    privateKey: authenticatedUser.privateKey
                },
                contracts: {
                    rpcs: [
                        {
                            url: `http://localhost:${server.getPort()}`
                        }
                    ]
                }
            })
        })

        afterEach(async () => {
            await client.destroy()
            await server.stop()
        })

        it('is in cache after calling getStream()', async () => {
            const stream = await client.getStream(existingStreamId)
            expect(getMethodCalls()).toHaveLength(1)
            await stream.getMetadata()
            expect(getMethodCalls()).toHaveLength(1)
        })

        it('is in cache after calling createStream()', async () => {
            const stream = await client.createStream(createRelativeTestStreamId(module))
            await stream.getMetadata()
            expect(getMethodCalls()).toHaveLength(0)
        })

        it('is in cache after calling searchStreams()', async () => {
            const stream = (await nextValue(client.searchStreams(existingStreamId, undefined)[Symbol.asyncIterator]()))!
            await stream.getMetadata()
            expect(getMethodCalls()).toHaveLength(0)
        })

        it('is not in cache after calling deleteStream()', async () => {
            const stream = await client.createStream(createRelativeTestStreamId(module))
            await client.deleteStream(stream.id)
            const otherClient = createTestClient(authenticatedUser.privateKey)
            await otherClient.createStream(stream.id)
            await otherClient.destroy()
            await client.getStreamMetadata(stream.id)
            expect(getMethodCalls()).toHaveLength(1)
        })

        it('cache updated when calling setStreamMetatadata()', async () => {
            const NEW_METADATA = { foo: Date.now() }
            await client.setStreamMetadata(existingStreamId, NEW_METADATA)
            expect(await client.getStreamMetadata(existingStreamId)).toEqual(NEW_METADATA)
            expect(getMethodCalls()).toHaveLength(0)
        })
    })
})
