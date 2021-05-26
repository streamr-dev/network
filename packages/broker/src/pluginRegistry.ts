import { PluginOptions } from './Plugin'
import { PublishHttpPlugin } from './plugins/publishHttp/PublishHttpPlugin'
import { MetricsPlugin } from './plugins/metrics/MetricsPlugin'
import { WebsocketPlugin } from './plugins/websocket/WebsocketPlugin'
import { MqttPlugin } from './plugins/mqtt/MqttPlugin'
import { StoragePlugin } from './plugins/storage/StoragePlugin'

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
