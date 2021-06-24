import { PluginDefinition, PluginOptions } from './Plugin'
import publishHttpPluginDefinition from './plugins/publishHttp/PublishHttpPlugin'
import legacyPublishHttpPluginDefinition from './plugins/legacyPublishHttp/PublishHttpPlugin'
import metricsPluginDefinition from './plugins/metrics/MetricsPlugin'
import websocketPluginDefinition from './plugins/websocket/WebsocketPlugin'
import legacyWebsocketPluginDefinition from './plugins/legacyWebsocket/WebsocketPlugin'
import mqttPluginDefinition from './plugins/mqtt/MqttPlugin'
import legacyMqttPluginDefinition from './plugins/legacyMqtt/MqttPlugin'
import storagePluginDefinition from './plugins/storage/StoragePlugin'

const DEFINITIONS: readonly PluginDefinition<any>[] = [
    publishHttpPluginDefinition,
    legacyPublishHttpPluginDefinition,
    metricsPluginDefinition,
    websocketPluginDefinition,
    legacyWebsocketPluginDefinition,
    mqttPluginDefinition,
    legacyMqttPluginDefinition,
    storagePluginDefinition
]

export const getPluginDefinition = (name: string): PluginDefinition<any>|never => {
    const definition = DEFINITIONS.find((d: PluginDefinition<any>) => d.name == name) 
    if (definition === undefined) {
        throw new Error(`Unknown plugin: ${name}`)
    }
    return definition
}

export const createPlugin = (name: string, pluginOptions: PluginOptions) => {
    return getPluginDefinition(name).createInstance(pluginOptions)
}
