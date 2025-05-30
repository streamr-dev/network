import { Plugin } from './Plugin'
import { StrictConfig } from './config/config'
import { AutostakerPlugin } from './plugins/autostaker/AutostakerPlugin'
import { ConsoleMetricsPlugin } from './plugins/consoleMetrics/ConsoleMetricsPlugin'
import { HttpPlugin } from './plugins/http/HttpPlugin'
import { InfoPlugin } from './plugins/info/InfoPlugin'
import { MqttPlugin } from './plugins/mqtt/MqttPlugin'
import { OperatorPlugin } from './plugins/operator/OperatorPlugin'
import { StoragePlugin } from './plugins/storage/StoragePlugin'
import { SubscriberPlugin } from './plugins/subscriber/SubscriberPlugin'
import { WebsocketPlugin } from './plugins/websocket/WebsocketPlugin'

export const createPlugin = (name: string, brokerConfig: StrictConfig): Plugin<any> | never => {
    switch (name) {
        case 'http':
            return new HttpPlugin(name, brokerConfig)
        case 'consoleMetrics':
            return new ConsoleMetricsPlugin(name, brokerConfig)
        case 'websocket':
            return new WebsocketPlugin(name, brokerConfig)
        case 'mqtt':
            return new MqttPlugin(name, brokerConfig)
        case 'storage':
            return new StoragePlugin(name, brokerConfig)
        case 'operator':
            return new OperatorPlugin(name, brokerConfig)
        case 'subscriber':
            return new SubscriberPlugin(name, brokerConfig)
        case 'info':
            return new InfoPlugin(name, brokerConfig)
        case 'autostaker':
            return new AutostakerPlugin(name, brokerConfig)
        default:
            throw new Error(`Unknown plugin: ${name}`)
    }
}
