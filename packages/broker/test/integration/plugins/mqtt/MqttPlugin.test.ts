import { AsyncMqttClient } from 'async-mqtt'
import mqtt from 'async-mqtt'
import { Queue } from '@streamr/test-utils'
import { Message } from '../../../../src/helpers/PayloadFormat'
import { createMessagingPluginTest } from '../../createMessagingPluginTest'

const MQTT_PORT = 12430
const TRACKER_PORT = 12432

jest.setTimeout(30000)

createMessagingPluginTest('mqtt',
    {
        createClient: async (_action: 'publish' | 'subscribe', _streamId: string, apiKey?: string): Promise<AsyncMqttClient> => {
            const opts = (apiKey !== undefined) ? {
                username: '',
                password: apiKey
            } : undefined
            return mqtt.connectAsync(`mqtt://localhost:${MQTT_PORT}`, opts)
        },
        closeClient: async (client: AsyncMqttClient): Promise<void> => {
            await client.end(true)
        },
        publish: async (msg: Message, streamId: string, client: AsyncMqttClient): Promise<void> => {
            await client.publish(streamId, JSON.stringify(msg))
        },
        subscribe: async (messageQueue: Queue<Message>, streamId: string, client: AsyncMqttClient): Promise<void> => {
            client.once('message', (topic: string, message: Buffer) => {
                if (topic === streamId) {
                    messageQueue.push(JSON.parse(message.toString()))
                }
            })
            await client.subscribe(streamId)
        },
        errors: {
            unauthorized: 'Connection refused: Not authorized',
            forbidden: 'Connection refused: Bad username or password',
        }
    },
    {
        plugin: MQTT_PORT,
        tracker: TRACKER_PORT
    },
    module
)
