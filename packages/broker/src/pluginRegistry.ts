import { Plugin, PluginOptions } from './Plugin'
import { PublishHttpPlugin } from './plugins/publishHttp/PublishHttpPlugin'
import { MetricsPlugin } from './plugins/metrics/MetricsPlugin'
import { ConsoleMetricsPlugin } from './plugins/consoleMetrics/ConsoleMetricsPlugin'
import { WebsocketPlugin } from './plugins/websocket/WebsocketPlugin'
import { MqttPlugin } from './plugins/mqtt/MqttPlugin'
import { StoragePlugin } from './plugins/storage/StoragePlugin'
import { BrubeckMinerPlugin } from './plugins/brubeckMiner/BrubeckMinerPlugin'
import { SubscriberPlugin } from './plugins/subscriber/SubscriberPlugin'
import { InfoPlugin } from './plugins/info/InfoPlugin'

export const createPlugin = (name: string, pluginOptions: PluginOptions): Plugin<any>|never => {
    switch (name) {
        case 'publishHttp':
            return new PublishHttpPlugin(pluginOptions)
        case 'metrics':
            return new MetricsPlugin(pluginOptions)
        case 'consoleMetrics':
            return new ConsoleMetricsPlugin(pluginOptions)
        case 'websocket':
            return new WebsocketPlugin(pluginOptions)
        case 'mqtt':
            return new MqttPlugin(pluginOptions)
        case 'storage':
            return new StoragePlugin(pluginOptions)
        case 'brubeckMiner':
            return new BrubeckMinerPlugin(pluginOptions)
        case 'subscriber':
            return new SubscriberPlugin(pluginOptions)
        case 'info':
            return new InfoPlugin(pluginOptions)
        default:
            throw new Error(`Unknown plugin: ${name}`)
    }
}
