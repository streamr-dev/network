import { Queue } from '@streamr/test-utils'
import { waitForEvent } from '@streamr/utils'
import WebSocket from 'ws'
import { Message } from '../../../../src/helpers/PayloadFormat'
import { createMessagingPluginTest, PAYLOAD_FORMAT } from '../../createMessagingPluginTest'

jest.setTimeout(30000)

const WEBSOCKET_PORT = 12400

createMessagingPluginTest(
    'websocket',
    {
        createClient: async (
            action: 'publish' | 'subscribe',
            streamId: string,
            apiKey?: string
        ): Promise<WebSocket> => {
            const apiKeySuffix = apiKey !== undefined ? `?apiKey=${apiKey}` : ''
            const client = new WebSocket(
                `ws://127.0.0.1:${WEBSOCKET_PORT}/streams/${encodeURIComponent(streamId)}/${action}${apiKeySuffix}`
            )
            return Promise.race([
                (async () => {
                    await waitForEvent(client, 'open')
                    return client
                })(),
                (async () => {
                    const errors = await waitForEvent(client, 'error')
                    throw errors[0]
                })()
            ])
        },
        closeClient: async (client: WebSocket): Promise<void> => {
            client.close()
        },
        publish: async (msg: Message, _streamId: string, client: WebSocket): Promise<void> => {
            client.send(PAYLOAD_FORMAT.createPayload(msg.content, msg.metadata))
        },
        subscribe: async (messageQueue: Queue<Message>, _streamId: string, client: WebSocket): Promise<void> => {
            client.on('message', (data: WebSocket.RawData) => {
                const payload = data.toString()
                messageQueue.push(PAYLOAD_FORMAT.createMessage(payload))
            })
        },
        errors: {
            unauthorized: 'Unexpected server response: 401',
            forbidden: 'Unexpected server response: 403'
        }
    },
    {
        plugin: WEBSOCKET_PORT
    },
    module
)
