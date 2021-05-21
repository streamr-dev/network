import { PluginOptions } from './Plugin'
import { HttpPlugin } from './http/HttpPlugin'
import { WebsocketPlugin } from './websocket/WebsocketPlugin'
import { MqttPlugin } from './mqtt/MqttPlugin'
import { StoragePlugin } from './storage/StoragePlugin'

export const createPlugin = (name: string, pluginOptions: PluginOptions) => {
    switch (name) {
        case 'http':
            return new HttpPlugin(pluginOptions)
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
