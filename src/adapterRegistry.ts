import { AdapterConfig, AdapterStartFn } from './Adapter'
import { BrokerUtils } from './types'
import { start as startHttp } from './http/index'
import { start as startWs } from './websocket/index'
import { start as startMqtt } from './mqtt/index'

const registry: Record<string,AdapterStartFn<AdapterConfig>> = {}

const register = <T extends AdapterConfig> (name: string, startFn: AdapterStartFn<T>) => {
    if (name in registry) {
        throw new Error(`adapterRegistry already contains adapter ${name}`)
    }
    // @ts-expect-error
    registry[name] = startFn
}

export const startAdapter = <T extends AdapterConfig> (name: string, adapterConfig: T, brokerUtils: BrokerUtils) => {
    if (!(name in registry)) {
        throw new Error(`adapterRegistry does not contain adapter ${name}`)
    }
    return registry[name](adapterConfig as any, brokerUtils)
}

register('http', startHttp)
register('ws', startWs)
register('mqtt', startMqtt)