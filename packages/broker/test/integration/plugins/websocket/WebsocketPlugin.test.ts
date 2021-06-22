import WebSocket from 'ws'
import { waitForEvent } from 'streamr-test-utils'
import { Message } from '../../../../src/helpers/PayloadFormat'
import { createMessagingPluginTest } from '../../createMessagingPluginTest'
import { Queue } from '../../../utils'

const WEBSOCKET_PORT = 12400

createMessagingPluginTest('websocket', 
    {
        createClient: async (action: 'publish'|'subscribe', streamId: string, apiKey: string): Promise<WebSocket> => {
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
    WEBSOCKET_PORT,
    module,
    {
        sslCertificate: null
    }
)
