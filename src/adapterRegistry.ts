import { AdapterConfig, AdapterStartFn } from './Adapter'
import { BrokerUtils } from './types'

const registry: Record<string,AdapterStartFn> = {}

export const register = (name: string, startFn: AdapterStartFn) => {
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

require('./http/index')
require('./websocket/index')
require('./mqtt/index')
