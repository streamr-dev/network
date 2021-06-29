import WebSocket from 'ws'
import { waitForEvent } from 'streamr-test-utils'
import { Message } from '../../../../src/helpers/PayloadFormat'
import { createMessagingPluginTest } from '../../createMessagingPluginTest'
import { Queue } from '../../../utils'

const WEBSOCKET_PORT = 12400
const LEGACY_WEBSOCKET_PORT = 12401
const TRACKER_PORT = 12402
const NETWORK_PORT = 12403

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
    {
        plugin: WEBSOCKET_PORT,
        legacyWebsocket: LEGACY_WEBSOCKET_PORT,
        tracker: TRACKER_PORT,
        network: NETWORK_PORT
    },
    module,
    {
        sslCertificate: null
    }
)
