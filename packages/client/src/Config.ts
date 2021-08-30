/**
 * New Brubeck Configuration.
 * Old Config in ConfigBase.
 * TODO: Disolve ConfigBase.
 */
import 'reflect-metadata'
import Config, { StrictStreamrClientConfig, StreamrClientConfig } from './ConfigBase'
import cloneDeep from 'lodash/cloneDeep'
import merge from 'lodash/merge'
import { NetworkNodeOptions } from 'streamr-network'
import { NodeRegistryOptions } from './NodeRegistry'
import { InspectOptions } from 'util'
import { StorageNode } from './StorageNode'

export type BrubeckClientConfig = StreamrClientConfig & {
    network?: Partial<NetworkNodeOptions>
    nodeRegistry?: NodeRegistryOptions
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

/**
 * DI Injection tokens for pieces of config.
 * tsyringe needs a concrete value to use as the injection token.
 * In the case of interfaces & types, these have no runtime value
 * so we have to introduce some token to use for their injection.
 * These symbols represent subsections of the full config.
 *
 * For example:
 * config.ethereum can be injected with a token like: @inject(Config.Ethereum)
 */
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
            maxStringLength: 512
        }
    },
    nodeRegistry: [{
        address: StorageNode.STREAMR_GERMANY.getAddress(),
        url: 'https://corea1.streamr.network:8001',
    }],
    network: {
        trackers: [{
            ws: 'wss://testnet1.streamr.network:30300',
            http: 'https://testnet1.streamr.network:30300',
            id: '0x49D45c17bCA1Caf692001D21c38aDECCB4c08504',
        }],
    },
}

export default function BrubeckConfig(config: BrubeckClientConfig): StrictBrubeckClientConfig {
    const defaults = cloneDeep(BRUBECK_CLIENT_DEFAULTS)
    const userConfig = Config(config)
    return {
        ...defaults,
        ...userConfig,
        debug: merge(defaults.debug || {}, config.debug),
    }
}
