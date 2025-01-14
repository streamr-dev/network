import WebSocket from 'ws'
import qs from 'qs'
import { StreamrClient, Subscription } from '@streamr/sdk'
import { waitForEvent, until, merge } from '@streamr/utils'
import { WebsocketServer } from '../../../../src/plugins/websocket/WebsocketServer'
import { PlainPayloadFormat } from '../../../../src/helpers/PayloadFormat'
import { mock, MockProxy } from 'jest-mock-extended'

const PORT = 12398
const MOCK_STREAM_ID = '0x1234567890123456789012345678901234567890/mock-path'
const MOCK_MESSAGE = {
    foo: 'bar'
}
const PATH_PUBLISH_MOCK_STREAM = `/streams/${encodeURIComponent(MOCK_STREAM_ID)}/publish`
const PATH_SUBSCRIBE_MOCK_STREAM = `/streams/${encodeURIComponent(MOCK_STREAM_ID)}/subscribe`
const REQUIRED_API_KEY = 'required-api-key'

const createTestClient = (path: string, queryParams?: any): WebSocket => {
    const queryParamsSuffix = qs.stringify(
        merge(
            {
                apiKey: REQUIRED_API_KEY
            },
            queryParams
        )
    )
    return new WebSocket(`ws://127.0.0.1:${PORT}${path}?${queryParamsSuffix}`)
}

describe('WebsocketServer', () => {
    let wsServer: WebsocketServer
    let wsClient: WebSocket
    let streamrClient: MockProxy<StreamrClient>

    const assertConnectionError = async (expectedHttpStatus: number) => {
        const [error] = await waitForEvent(wsClient, 'error')
        expect((error as Error).message).toBe(`Unexpected server response: ${expectedHttpStatus}`)
    }

    beforeEach(async () => {
        streamrClient = mock<StreamrClient>()
        streamrClient.subscribe.mockResolvedValue(mock<Subscription>())
        wsServer = new WebsocketServer(streamrClient, 0, 0)
        await wsServer.start(PORT, new PlainPayloadFormat(), {
            keys: [REQUIRED_API_KEY]
        })
    })

    afterEach(async () => {
        wsClient.close()
        await wsServer.stop()
    })

    describe.each([['/streams/dummy/invalid-action'], ['/invalid-path'], ['/']])(
        'invalid connection url',
        (path: string) => {
            it(path, async () => {
                wsClient = createTestClient(path)
                await assertConnectionError(400)
            })
        }
    )

    describe('publish', () => {
        const connectAndPublish = async (queryParams?: any) => {
            wsClient = createTestClient(PATH_PUBLISH_MOCK_STREAM, queryParams)
            await waitForEvent(wsClient, 'open')
            wsClient.send(JSON.stringify(MOCK_MESSAGE))
            await until(() => streamrClient.publish.mock.calls.length === 1)
        }

        it('without parameters', async () => {
            await connectAndPublish()
            expect(streamrClient.publish).toHaveBeenCalledWith(
                {
                    id: MOCK_STREAM_ID,
                    partition: undefined
                },
                MOCK_MESSAGE,
                {
                    msgChainId: expect.any(String)
                }
            )
        })

        it('valid partition', async () => {
            await connectAndPublish({ partition: 50 })
            expect(streamrClient.publish).toHaveBeenCalledWith(
                {
                    id: MOCK_STREAM_ID,
                    partition: 50
                },
                MOCK_MESSAGE,
                {
                    msgChainId: expect.any(String)
                }
            )
        })

        it('valid partitionKey', async () => {
            await connectAndPublish({ partitionKey: 'mock-key' })
            expect(streamrClient.publish).toHaveBeenCalledWith(
                {
                    id: MOCK_STREAM_ID,
                    partition: undefined
                },
                MOCK_MESSAGE,
                {
                    partitionKey: 'mock-key',
                    msgChainId: expect.any(String)
                }
            )
        })

        it('valid partitionKeyField', async () => {
            await connectAndPublish({ partitionKeyField: 'foo' })
            expect(streamrClient.publish).toHaveBeenCalledWith(
                {
                    id: MOCK_STREAM_ID,
                    partition: undefined
                },
                MOCK_MESSAGE,
                {
                    partitionKey: 'bar',
                    msgChainId: expect.any(String)
                }
            )
        })

        describe.each([
            [{ partition: -1 }],
            [{ partition: 123, partitionKey: 'mock-key' }],
            [{ partition: 123, partitionKeyField: 'foo' }],
            [{ partitionKey: 'mock-key', partitionKeyField: 'foo' }]
        ])('invalid partition definition', (queryParams: any) => {
            it(qs.stringify(queryParams), async () => {
                wsClient = createTestClient(PATH_PUBLISH_MOCK_STREAM, queryParams)
                await assertConnectionError(400)
            })
        })
    })

    describe('subscribe', () => {
        it('without parameters', async () => {
            wsClient = createTestClient(PATH_SUBSCRIBE_MOCK_STREAM)
            await waitForEvent(wsClient, 'open')
            expect(streamrClient.subscribe).toHaveBeenCalledTimes(1)
            expect(streamrClient.subscribe).toHaveBeenCalledWith(
                { id: MOCK_STREAM_ID, partition: undefined },
                expect.anything()
            )
        })

        it('valid partitions', async () => {
            wsClient = createTestClient(PATH_SUBSCRIBE_MOCK_STREAM, { partitions: '0,2,5' })
            await waitForEvent(wsClient, 'open')
            expect(streamrClient.subscribe).toHaveBeenCalledTimes(3)
            expect(streamrClient.subscribe).toHaveBeenNthCalledWith(
                1,
                { id: MOCK_STREAM_ID, partition: 0 },
                expect.anything()
            )
            expect(streamrClient.subscribe).toHaveBeenNthCalledWith(
                2,
                { id: MOCK_STREAM_ID, partition: 2 },
                expect.anything()
            )
            expect(streamrClient.subscribe).toHaveBeenNthCalledWith(
                3,
                { id: MOCK_STREAM_ID, partition: 5 },
                expect.anything()
            )
        })

        it('invalid partitions', async () => {
            wsClient = createTestClient(PATH_SUBSCRIBE_MOCK_STREAM, { partitions: '111,-222,333' })
            await assertConnectionError(400)
        })

        it('receive message from StreamrClient', async () => {
            wsClient = createTestClient(PATH_SUBSCRIBE_MOCK_STREAM)
            await waitForEvent(wsClient, 'open')
            const payloadPromise = waitForEvent(wsClient, 'message')
            const onMessageCallback = (streamrClient.subscribe as any).mock.calls[0][1]
            onMessageCallback(MOCK_MESSAGE, {})
            const firstPayload = (await payloadPromise)[0]
            expect(JSON.parse(firstPayload as string)).toEqual(MOCK_MESSAGE)
        })

        it('if client#subscribe throws, passed subscriptions are cleaned', async () => {
            const singletonSubscription = mock<Subscription>()
            streamrClient.subscribe
                .mockResolvedValueOnce(singletonSubscription)
                .mockResolvedValueOnce(singletonSubscription)
                .mockRejectedValue(new Error('bad partition'))
            wsClient = createTestClient(PATH_SUBSCRIBE_MOCK_STREAM, { partitions: '0,2,350' })
            await waitForEvent(wsClient, 'close')
            expect(singletonSubscription.unsubscribe).toHaveBeenCalledTimes(2)
        })

        it('on client disconnect subscriptions are cleaned', async () => {
            const singletonSubscription = mock<Subscription>()
            streamrClient.subscribe.mockResolvedValue(singletonSubscription)
            wsClient = createTestClient(PATH_SUBSCRIBE_MOCK_STREAM, { partitions: '0,2,5' })
            await waitForEvent(wsClient, 'open')
            wsClient.close()
            await until(() => singletonSubscription.unsubscribe.mock.calls.length === 3)
        })
    })
})
