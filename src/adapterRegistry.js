const registry = {} // name => startFn

module.exports = {
    register: (name, startFn) => {
        if (name in registry) {
            throw new Error(`adapterRegistry already contains adapter ${name}`)
        }
        registry[name] = startFn
    },
    startAdapter: (name, adapterConfig, brokerUtils) => {
        if (!(name in registry)) {
            throw new Error(`adapterRegistry does not contain adapter ${name}`)
        }
        return registry[name](adapterConfig, brokerUtils)
    },
}

require('./http/index')
require('./websocket/index')
require('./mqtt/index')
