/**
 * New Brubeck Configuration.
 * Old Config in ConfigBase.
 * TODO: Disolve ConfigBase.
 */
import 'reflect-metadata'
import Config from './ConfigBase'
import cloneDeep from 'lodash/cloneDeep'
import merge from 'lodash/merge'
import type { NetworkNodeOptions } from 'streamr-network'
import type { InspectOptions } from 'util'
import type { StrictStreamrClientConfig, StreamrClientConfig } from './ConfigBase'
import type { ConnectionInfo } from '@ethersproject/web'
import { SmartContractRecord } from 'streamr-client-protocol'

export type TrackerRegistrySmartContract = { jsonRpcProvider?: ConnectionInfo, contractAddress: string }
export type BrubeckNodeOptions = Omit<NetworkNodeOptions, 'trackers'> & {
    trackers: SmartContractRecord[] | TrackerRegistrySmartContract
}

/**
 * @category Important
 */
export type StreamrClientOptions = StreamrClientConfig & {
    network?: Omit<Partial<BrubeckNodeOptions>, 'metricsContext'>
    debug?: Partial<DebugConfig>
}

export type NetworkNodeConfig = NetworkNodeOptions

export type DebugConfig = {
    inspectOpts: InspectOptions
}

export type StrictBrubeckClientConfig = StrictStreamrClientConfig & {
    network: BrubeckNodeOptions
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
    StorageNodeRegistry: Symbol('Config.StorageNodeRegistry'),
    Encryption: Symbol('Config.Encryption'),
}

export * from './ConfigBase'

export { BrubeckConfigInjection as Config }

// TODO: Production values
export const BRUBECK_CLIENT_DEFAULTS = {
    debug: {
        inspectOpts: {
            depth: 5,
            maxStringLength: 512
        }
    },
    network: {
        trackers: {
            contractAddress: '0xab9BEb0e8B106078c953CcAB4D6bF9142BeF854d'
        },
        acceptProxyConnections: false
    },
}

export default function BrubeckConfig(config: StreamrClientOptions): StrictBrubeckClientConfig {
    const clonedConfig = cloneDeep(config)
    const defaults = cloneDeep(BRUBECK_CLIENT_DEFAULTS)
    const userConfig = Config(clonedConfig)
    const result: StrictBrubeckClientConfig = {
        ...defaults,
        ...userConfig,
        network: {
            ...merge(defaults.network || {}, clonedConfig.network),
            trackers: clonedConfig.network?.trackers ?? defaults.network.trackers,
        },
        debug: merge(defaults.debug || {}, clonedConfig.debug),
    }

    return result
}
