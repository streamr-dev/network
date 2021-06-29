import { AsyncMqttClient } from 'async-mqtt'
import mqtt from 'async-mqtt'
import { Message } from '../../../../src/helpers/PayloadFormat'
import { createMessagingPluginTest } from '../../createMessagingPluginTest'
import { Queue } from '../../../utils'

const MQTT_PORT = 12430
const LEGACY_WEBSOCKET_PORT = 12431
const TRACKER_PORT = 12432
const NETWORK_PORT = 12433

createMessagingPluginTest('mqtt',
    {
        createClient: async (_action: 'publish'|'subscribe', _streamId: string, apiKey: string): Promise<AsyncMqttClient> => {
            return mqtt.connectAsync('mqtt://localhost:' + MQTT_PORT, {
                username: '',
                password: apiKey,
            })
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
        }
    },
    {
        plugin: MQTT_PORT,
        legacyWebsocket: LEGACY_WEBSOCKET_PORT,
        tracker: TRACKER_PORT,
        network: NETWORK_PORT
    },
    module
)
