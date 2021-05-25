import { PluginOptions } from './Plugin'
import { PublishHttpPlugin } from './publishHttp/PublishHttpPlugin'
import { MetricsPlugin } from './metrics/MetricsPlugin'
import { WebsocketPlugin } from './websocket/WebsocketPlugin'
import { MqttPlugin } from './mqtt/MqttPlugin'
import { StoragePlugin } from './storage/StoragePlugin'

export const createPlugin = (name: string, pluginOptions: PluginOptions) => {
    switch (name) {
        case 'publishHttp':
            return new PublishHttpPlugin(pluginOptions)
        case 'metrics':
            return new MetricsPlugin(pluginOptions)
        case 'ws':
            return new WebsocketPlugin(pluginOptions)
        case 'mqtt':
            return new MqttPlugin(pluginOptions)
        case 'storage':
            return new StoragePlugin(pluginOptions)
        default:
            throw new Error(`Unknown plugin: ${name}`)
    }
}
