import 'reflect-metadata'
import Config, { StrictStreamrClientConfig, StreamrClientConfig } from '../Config'
import defaultsDeep from 'lodash/defaultsDeep'
import cloneDeep from 'lodash/cloneDeep'
import { NetworkNodeOptions } from 'streamr-network'
import { NodeRegistryOptions } from './NodeRegistry'
import { EncryptionConfig } from './encryption/KeyExchangeUtils'

export type BrubeckClientConfig = StreamrClientConfig & {
    network?: Partial<NetworkNodeOptions>
    nodeRegistry?: Partial<NodeRegistryOptions>
}

export {
    NetworkNodeOptions as NetworkNodeConfig,
    NodeRegistryOptions as NodeRegistryConfig
}

export type StrictBrubeckClientConfig = StrictStreamrClientConfig & {
    network: NetworkNodeOptions
    nodeRegistry: NodeRegistryOptions
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

export * from '../Config'

export { BrubeckConfigInjection as Config }

// TODO: Production values
const BRUBECK_CLIENT_DEFAULTS = {
    nodeRegistry: {
        contractAddress: '0xbAA81A0179015bE47Ad439566374F2Bae098686F',
        jsonRpcProvider: 'http://10.200.10.1:8546',
    },
    network: {
        trackers: [
            'ws://127.0.0.1:30301',
            'ws://127.0.0.1:30302',
            'ws://127.0.0.1:30303'
        ],
    },
}

export default function BrubeckConfig(config: BrubeckClientConfig): StrictBrubeckClientConfig {
    return cloneDeep(defaultsDeep({}, BRUBECK_CLIENT_DEFAULTS, Config(config)))
}
