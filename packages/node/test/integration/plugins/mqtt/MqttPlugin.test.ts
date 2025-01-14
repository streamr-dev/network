import { Queue } from '@streamr/test-utils'
import mqtt, { AsyncMqttClient } from 'async-mqtt'
import { Message } from '../../../../src/helpers/PayloadFormat'
import { createMessagingPluginTest, PAYLOAD_FORMAT } from '../../createMessagingPluginTest'

const MQTT_PORT = 12430

jest.setTimeout(30000)

createMessagingPluginTest(
    'mqtt',
    {
        createClient: async (
            _action: 'publish' | 'subscribe',
            _streamId: string,
            apiKey?: string
        ): Promise<AsyncMqttClient> => {
            const opts =
                apiKey !== undefined
                    ? {
                          username: '',
                          password: apiKey
                      }
                    : undefined
            return mqtt.connectAsync(`mqtt://127.0.0.1:${MQTT_PORT}`, opts)
        },
        closeClient: async (client: AsyncMqttClient): Promise<void> => {
            await client.end(true)
        },
        publish: async (msg: Message, streamId: string, client: AsyncMqttClient): Promise<void> => {
            await client.publish(streamId, PAYLOAD_FORMAT.createPayload(msg.content, msg.metadata))
        },
        subscribe: async (messageQueue: Queue<Message>, streamId: string, client: AsyncMqttClient): Promise<void> => {
            client.once('message', (topic: string, message: Buffer) => {
                if (topic === streamId) {
                    messageQueue.push(PAYLOAD_FORMAT.createMessage(message.toString()))
                }
            })
            await client.subscribe(streamId)
        },
        errors: {
            unauthorized: 'Connection refused: Not authorized',
            forbidden: 'Connection refused: Bad username or password'
        }
    },
    {
        plugin: MQTT_PORT
    },
    module
)
