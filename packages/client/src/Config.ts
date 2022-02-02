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

export type BrubeckClientConfig = StreamrClientConfig & {
    network?: Omit<Partial<NetworkNodeOptions>, 'metricsContext'>
    debug?: Partial<DebugConfig>
}

export {
    NetworkNodeOptions as NetworkNodeConfig
}

export type DebugConfig = {
    inspectOpts: InspectOptions
}

export type StrictBrubeckClientConfig = StrictStreamrClientConfig & {
    network: NetworkNodeOptions
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
const BRUBECK_CLIENT_DEFAULTS = {
    debug: {
        inspectOpts: {
            depth: 5,
            maxStringLength: 512
        }
    },
    network: {
        trackers: [
            {
                id: '0xFBB6066c44bc8132bA794C73f58F391273E3bdA1',
                ws: 'wss://brubeck3.streamr.network:30401',
                http: 'https://brubeck3.streamr.network:30401'
            },
            {
                id: '0x3D61bFeFA09CEAC1AFceAA50c7d79BE409E1ec24',
                ws: 'wss://brubeck3.streamr.network:30402',
                http: 'https://brubeck3.streamr.network:30402'
            },
            {
                id: '0xE80FB5322231cBC1e761A0F896Da8E0CA2952A66',
                ws: 'wss://brubeck3.streamr.network:30403',
                http: 'https://brubeck3.streamr.network:30403'
            },
            {
                id: '0xf626285C6AACDE39ae969B9Be90b1D9855F186e0',
                ws: 'wss://brubeck3.streamr.network:30404',
                http: 'https://brubeck3.streamr.network:30404'
            },
            {
                id: '0xce88Da7FE0165C8b8586aA0c7C4B26d880068219',
                ws: 'wss://brubeck3.streamr.network:30405',
                http: 'https://brubeck3.streamr.network:30405'
            },
            {
                id: '0x05e7a0A64f88F84fB1945a225eE48fFC2c48C38E',
                ws: 'wss://brubeck4.streamr.network:30401',
                http: 'https://brubeck4.streamr.network:30401'
            },
            {
                id: '0xF15784106ACd35b0542309CDF2b35cb5BA642C4F',
                ws: 'wss://brubeck4.streamr.network:30402',
                http: 'https://brubeck4.streamr.network:30402'
            },
            {
                id: '0x77FA7Af34108abdf8e92B8f4C4AeC7CbfD1d6B09',
                ws: 'wss://brubeck4.streamr.network:30403',
                http: 'https://brubeck4.streamr.network:30403'
            },
            {
                id: '0x7E83e0bdAF1eF06F31A02f35A07aFB48179E536B',
                ws: 'wss://brubeck4.streamr.network:30404',
                http: 'https://brubeck4.streamr.network:30404'
            },
            {
                id: '0x2EeF37180691c75858Bf1e781D13ae96943Dd388',
                ws: 'wss://brubeck4.streamr.network:30405',
                http: 'https://brubeck4.streamr.network:30405'
            }
        ],
        acceptProxyConnections: false
    },
}

export { BRUBECK_CLIENT_DEFAULTS as DEFAULTS }

export default function BrubeckConfig(config: BrubeckClientConfig): StrictBrubeckClientConfig {
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
