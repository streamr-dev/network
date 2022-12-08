import WebSocket from 'ws'
import { Queue } from '@streamr/test-utils'
import { waitForEvent } from '@streamr/utils'
import { Message } from '../../../../src/helpers/PayloadFormat'
import { createMessagingPluginTest } from '../../createMessagingPluginTest'

jest.setTimeout(60000)

const WEBSOCKET_PORT = 12400
const BROKER_NETWORKNODE_PORT = 44410

createMessagingPluginTest('websocket', 
    {
        createClient: async (action: 'publish' | 'subscribe', streamId: string, apiKey: string): Promise<WebSocket> => {
            const client = new WebSocket(`ws://localhost:${WEBSOCKET_PORT}/streams/${encodeURIComponent(streamId)}/${action}?apiKey=${apiKey}`)
            await waitForEvent(client, 'open')
            return client
        },
        closeClient: async (client: WebSocket): Promise<void> => {
            client.close()
        },
        publish: async (msg: Message, _streamId: string, client: WebSocket): Promise<void> => {
            client.send(JSON.stringify(msg))
        },
        subscribe: async (messageQueue: Queue<Message>, _streamId: string, client: WebSocket): Promise<void> => {
            client.on('message', (payload: string) => messageQueue.push(JSON.parse(payload)))
        }
    },
    {
        plugin: WEBSOCKET_PORT,
        brokerConnectionManager: BROKER_NETWORKNODE_PORT
    },
    module
)
