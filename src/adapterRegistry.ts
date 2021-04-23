import { AdapterConfig, AdapterStartFn } from './Adapter'
import { BrokerUtils } from './types'
import { start as startHttp } from './http/index'
import { start as startWs } from './websocket/index'
import { start as startMqtt } from './mqtt/index'

const registry: Record<string,AdapterStartFn> = {}

const register = (name: string, startFn: AdapterStartFn) => {
    if (name in registry) {
        throw new Error(`adapterRegistry already contains adapter ${name}`)
    }
    registry[name] = startFn
}

export const startAdapter = (name: string, adapterConfig: AdapterConfig, brokerUtils: BrokerUtils) => {
    if (!(name in registry)) {
        throw new Error(`adapterRegistry does not contain adapter ${name}`)
    }
    return registry[name](adapterConfig, brokerUtils)
}

register('http', startHttp)
register('ws', startWs)
register('mqtt', startMqtt)