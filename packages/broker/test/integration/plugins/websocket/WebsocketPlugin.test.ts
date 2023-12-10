import WebSocket from 'ws'
import { Queue } from '@streamr/test-utils'
import { withTimeout } from '@streamr/utils'
import { Message } from '../../../../src/helpers/PayloadFormat'
import { createMessagingPluginTest } from '../../createMessagingPluginTest'

jest.setTimeout(30000)

const WEBSOCKET_PORT = 12400

createMessagingPluginTest('websocket', 
    {
        createClient: async (action: 'publish' | 'subscribe', streamId: string, apiKey?: string): Promise<WebSocket> => {
            const apiKeySuffix = (apiKey !== undefined) ? `?apiKey=${apiKey}` : ''
            const promise = new Promise<WebSocket>((resolve, reject) => {
                const client = new WebSocket(`ws://127.0.0.1:${WEBSOCKET_PORT}/${action}/${streamId}${apiKeySuffix}`)
                client.on('open', () => {
                    resolve(client)
                })
                client.on('error', (error) => {
                    reject(error)
                })
            })
            return withTimeout<WebSocket>(promise, 10000)
        },
        closeClient: async (client: WebSocket): Promise<void> => {
            client.close()
        },
        publish: async (msg: Message, _streamId: string, client: WebSocket): Promise<void> => {
            client.send(JSON.stringify(msg))
        },
        subscribe: async (messageQueue: Queue<Message>, _streamId: string, client: WebSocket): Promise<void> => {
            client.on('message', (data: WebSocket.RawData) => {
                const payload = data.toString()
                messageQueue.push(JSON.parse(payload))
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
