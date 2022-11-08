import 'reflect-metadata'
import type { BigNumber } from '@ethersproject/bignumber'
import type { Overrides } from '@ethersproject/contracts'
import cloneDeep from 'lodash/cloneDeep'
import Ajv, { ErrorObject } from 'ajv'
import addFormats from 'ajv-formats'
import merge from 'lodash/merge'
import type { ExternalProvider } from '@ethersproject/providers'

import CONFIG_SCHEMA from './config.schema.json'
import { TrackerRegistryRecord } from '@streamr/protocol'
import { LogLevel } from '@streamr/utils'

import { NetworkNodeOptions, STREAMR_ICE_SERVERS } from '@streamr/network-node'
import type { ConnectionInfo } from '@ethersproject/web'
import { generateClientId } from './utils/utils'
import { XOR } from './types'

export interface ProviderAuthConfig {
    ethereum: ExternalProvider
}

export interface PrivateKeyAuthConfig {
    privateKey: string
    // The address property is not used. It is included to make the object
    // compatible with StreamrClient.generateEthereumAccount(), as we typically
    // use that method to generate the client "auth" option.
    address?: string
}

export interface TrackerRegistryContract {
    jsonRpcProvider?: ConnectionInfo
    contractAddress: string
}

export interface ChainConnectionInfo { rpcs: ConnectionInfo[], chainId?: number, name?: string }

// these should come from ETH-184 config package when it's ready
export interface EthereumNetworkConfig {
    chainId: number
    overrides?: Overrides
    gasPriceStrategy?: (estimatedGasPrice: BigNumber) => BigNumber
}

/**
 * @category Important
 */
export interface StrictStreamrClientConfig {
    /** Custom human-readable debug id for client. Used in logging. */
    id: string
    logLevel: LogLevel
    /**
    * Authentication: identity used by this StreamrClient instance.
    * Can contain member privateKey or (window.)ethereum
    */
    auth?: XOR<PrivateKeyAuthConfig, ProviderAuthConfig>

    /** Attempt to order messages */
    orderMessages: boolean
    gapFill: boolean
    maxGapRequests: number
    retryResendAfter: number
    gapFillTimeout: number

    network: Omit<NetworkNodeOptions, 'trackers' | 'metricsContext'> & {
        trackers: TrackerRegistryRecord[] | TrackerRegistryContract
    }

    contracts: {
        streamRegistryChainAddress: string
        streamStorageRegistryChainAddress: string
        storageNodeRegistryChainAddress: string
        ensCacheChainAddress: string
        mainChainRPCs?: ChainConnectionInfo
        streamRegistryChainRPCs: ChainConnectionInfo
        // most of the above should go into ethereumNetworks configs once ETH-184 is ready
        ethereumNetworks?: Record<string, EthereumNetworkConfig>
        /** Some TheGraph instance, that indexes the streamr registries */
        theGraphUrl: string
        maxConcurrentCalls: number
    }

    decryption: {
        keyRequestTimeout: number
        maxKeyRequestsPerSecond: number
    }

    cache: {
        maxSize: number
        maxAge: number
    }

    metrics: {
        periods: {
            streamId: string
            duration: number
        }[]
        maxPublishDelay: number
    }

    /** @internal */
    _timeouts: {
        theGraph: {
            timeout: number
            retryInterval: number
        }
        storageNode: {
            timeout: number
            retryInterval: number
        }
        jsonRpc: {
            timeout: number
            retryInterval: number
        }
        httpFetchTimeout: number
    }
}

export type StreamrClientConfig = Partial<Omit<StrictStreamrClientConfig, 'network' | 'contracts' | 'decryption' | 'metrics'> & {
    network: Partial<StrictStreamrClientConfig['network']>
    contracts: Partial<StrictStreamrClientConfig['contracts']>
    decryption: Partial<StrictStreamrClientConfig['decryption']>
    metrics: Partial<StrictStreamrClientConfig['metrics']> | boolean
}>

export const STREAMR_STORAGE_NODE_GERMANY = '0x31546eEA76F2B2b3C5cC06B1c93601dc35c9D916'

/**
 * @category Important
 */
export const STREAM_CLIENT_DEFAULTS: Omit<StrictStreamrClientConfig, 'id' | 'auth'> = {
    logLevel: 'info',

    orderMessages: true,
    retryResendAfter: 5000,
    gapFillTimeout: 5000,
    gapFill: true,
    maxGapRequests: 5,
    
    network: {
        trackers: {
            contractAddress: '0xab9BEb0e8B106078c953CcAB4D6bF9142BeF854d'
        },
        acceptProxyConnections: false
    },

    // For ethers.js provider params, see https://docs.ethers.io/ethers.js/v5-beta/api-providers.html#provider
    contracts: {
        streamRegistryChainAddress: '0x0D483E10612F327FC11965Fc82E90dC19b141641',
        streamStorageRegistryChainAddress: '0xe8e2660CeDf2a59C917a5ED05B72df4146b58399',
        storageNodeRegistryChainAddress: '0x080F34fec2bc33928999Ea9e39ADc798bEF3E0d6',
        ensCacheChainAddress: '0x870528c1aDe8f5eB4676AA2d15FC0B034E276A1A',
        mainChainRPCs: undefined, // Default to ethers.js default provider settings
        streamRegistryChainRPCs: {
            name: 'polygon',
            chainId: 137,
            rpcs: [{
                url: 'https://polygon-rpc.com',
                timeout: 120 * 1000
            }, {
                url: 'https://poly-rpc.gateway.pokt.network/',
                timeout: 120 * 1000
            }, {
                url: 'https://rpc-mainnet.matic.network',
                timeout: 120 * 1000
            }]
        },
        ethereumNetworks: {
            polygon: {
                chainId: 137,
                gasPriceStrategy: (estimatedGasPrice: BigNumber) => estimatedGasPrice.add('10000000000'),
            }
        },
        theGraphUrl: 'https://api.thegraph.com/subgraphs/name/streamr-dev/streams',
        maxConcurrentCalls: 10    
    },

    decryption: {
        keyRequestTimeout: 30 * 1000,
        maxKeyRequestsPerSecond: 20
    },
    cache: {
        maxSize: 10000,
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
    _timeouts: {
        theGraph: {
            timeout: 60 * 1000,
            retryInterval: 1000
        },
        storageNode: {
            timeout: 30 * 1000,
            retryInterval: 1000
        },
        jsonRpc: {
            timeout: 30 * 1000,
            retryInterval: 1000
        },
        httpFetchTimeout: 30 * 1000
    },
    metrics: {
        periods: [
            {
                duration: 60000,
                streamId: 'streamr.eth/metrics/nodes/firehose/min'
            },
            {
                duration: 3600000,
                streamId: 'streamr.eth/metrics/nodes/firehose/hour'
            },
            {
                duration: 86400000,
                streamId: 'streamr.eth/metrics/nodes/firehose/day'
            }
        ],
        maxPublishDelay: 30000
    }
}

export const createStrictConfig = (inputOptions: StreamrClientConfig = {}): StrictStreamrClientConfig => {
    validateConfig(inputOptions)
    const opts = cloneDeep(inputOptions)
    const defaults = cloneDeep(STREAM_CLIENT_DEFAULTS)

    const getMetricsConfig = () => {
        if (opts.metrics === true) {
            return defaults.metrics
        } else if (opts.metrics === false) {
            return {
                ...defaults.metrics,
                periods: []
            }
        } else if (opts.metrics !== undefined) {
            return {
                ...defaults.metrics,
                ...opts.metrics
            }
        } else {
            const isEthereumAuth = ((opts.auth as ProviderAuthConfig)?.ethereum !== undefined)
            return {
                ...defaults.metrics,
                periods: isEthereumAuth ? [] : defaults.metrics.periods
            }
        }
    }

    const options: StrictStreamrClientConfig = {
        id: generateClientId(),
        ...defaults,
        ...opts,
        network: {
            ...merge(defaults.network || {}, opts.network),
            trackers: opts.network?.trackers ?? defaults.network.trackers,
        },
        contracts: merge(defaults.contracts || {}, opts.contracts),
        decryption: merge(defaults.decryption || {}, opts.decryption),
        metrics: getMetricsConfig(),
        cache: {
            ...defaults.cache,
            ...opts.cache,
        }
        // NOTE: sidechain and storageNode settings are not merged with the defaults
    }

    const privateKey = (options.auth as PrivateKeyAuthConfig)?.privateKey
    if (privateKey !== undefined) {
        if (typeof privateKey === 'string' && !privateKey.startsWith('0x')) {
            (options.auth as PrivateKeyAuthConfig).privateKey = `0x${privateKey}`
        }
    }

    if (options.network.iceServers === undefined) {
        options.network.iceServers = STREAMR_ICE_SERVERS
    }

    return options
}

export const validateConfig = (data: unknown): void | never => {
    const ajv = new Ajv()
    addFormats(ajv)
    ajv.addFormat('ethereum-address', /^0x[a-zA-Z0-9]{40}$/)
    ajv.addFormat('ethereum-private-key', /^(0x)?[a-zA-Z0-9]{64}$/)
    if (!ajv.validate(CONFIG_SCHEMA, data)) {
        throw new Error(ajv.errors!.map((e: ErrorObject) => {
            let text = ajv.errorsText([e], { dataVar: '' }).trim()
            if (e.params.additionalProperty) {
                text += `: ${e.params.additionalProperty}`
            }
            return text
        }).join('\n'))
    }
}

export const ConfigInjectionToken = Symbol('Config')
