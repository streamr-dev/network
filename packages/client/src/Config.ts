import 'reflect-metadata'
import Config, { StrictStreamrClientConfig, StreamrClientConfig } from './ConfigBase'
import merge from 'lodash/merge'
import cloneDeep from 'lodash/cloneDeep'
import { NetworkNodeOptions } from 'streamr-network'
import { NodeRegistryOptions } from './NodeRegistry'
import { InspectOptions } from 'util'

export type BrubeckClientConfig = StreamrClientConfig & {
    network?: Partial<NetworkNodeOptions>
    nodeRegistry?: Partial<NodeRegistryOptions>
    debug?: Partial<DebugConfig>
}

export {
    NetworkNodeOptions as NetworkNodeConfig,
    NodeRegistryOptions as NodeRegistryConfig
}

export type DebugConfig = {
    inspectOpts: InspectOptions
}

export type StrictBrubeckClientConfig = StrictStreamrClientConfig & {
    network: NetworkNodeOptions
    nodeRegistry: NodeRegistryOptions
    debug: DebugConfig
}

const BrubeckConfigInjection = {
    Root: Symbol('Config.Root'),
    Auth: Symbol('Config.Auth'),
    Ethereum: Symbol('Config.Ethereum'),
    Network: Symbol('Config.Network'),
    Connection: Symbol('Config.Connection'),
    Subscribe: Symbol('Config.Subscribe'),
    Publish: Symbol('Config.Publish'),
    Cache: Symbol('Config.Cache'),
    NodeRegistry: Symbol('Config.NodeRegistry'),
    Encryption: Symbol('Config.Encryption'),
}

export * from './ConfigBase'

export { BrubeckConfigInjection as Config }

// TODO: Production values
const BRUBECK_CLIENT_DEFAULTS = {
    debug: {
        inspectOpts: {
            depth: 5,
            maxStringLength: 256
        }
    },
    nodeRegistry: {
        contractAddress: '0xbAA81A0179015bE47Ad439566374F2Bae098686F',
        jsonRpcProvider: 'http://10.200.10.1:8546',
    },
    network: {
        trackers: [
            {
                id: '0xDE11165537ef6C01260ee89A850a281525A5b63F',
                ws: 'ws://127.0.0.1:30301',
                http: 'http://127.0.0.1:30301'
            }, {
                id: '0xDE22222da3F861c2Ec63b03e16a1dce153Cf069c',
                ws: 'ws://127.0.0.1:30302',
                http: 'http://127.0.0.1:30302'
            }, {
                id: '0xDE33390cC85aBf61d9c27715Fa61d8E5efC61e75',
                ws: 'ws://127.0.0.1:30303',
                http: 'http://127.0.0.1:30303'
            }
        ],
    },
}

export default function BrubeckConfig(config: BrubeckClientConfig): StrictBrubeckClientConfig {
    return cloneDeep(merge({}, BRUBECK_CLIENT_DEFAULTS, Config(config)))
}
