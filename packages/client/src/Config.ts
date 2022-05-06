import 'reflect-metadata'
import type { BigNumber } from '@ethersproject/bignumber'
import cloneDeep from 'lodash/cloneDeep'
import Ajv, { ErrorObject } from 'ajv'
import addFormats from 'ajv-formats'
import merge from 'lodash/merge'

import type { AuthConfig, EthereumConfig } from './Ethereum'
import type { EncryptionConfig } from './encryption/KeyExchangeStream'

import CONFIG_SCHEMA from './config.schema.json'
import { EthereumAddress, SmartContractRecord } from 'streamr-client-protocol'

import type { NetworkNodeOptions } from 'streamr-network'
import type { InspectOptions } from 'util'
import type { ConnectionInfo } from '@ethersproject/web'
import { Chains } from '@streamr/config'
import { toNumber } from 'lodash'

export type CacheConfig = {
    maxSize: number,
    maxAge: number
}

type TimeoutsConfig = {
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

export type SubscribeConfig = {
    /** Attempt to order messages */
    orderMessages: boolean
    gapFill: boolean
    maxGapRequests: number
    maxRetries: number
    verifySignatures: 'auto' | 'always' | 'never'
    retryResendAfter: number
    gapFillTimeout: number
}

export type ConnectionConfig = {
    /** Some TheGraph instance, that indexes the streamr registries */
    theGraphUrl: string
}

export type TrackerRegistrySmartContract = { jsonRpcProvider?: ConnectionInfo, contractAddress: EthereumAddress }

export type NetworkConfig = Omit<NetworkNodeOptions, 'trackers' | 'metricsContext'> & {
    trackers: SmartContractRecord[] | TrackerRegistrySmartContract
}

export type DebugConfig = {
    inspectOpts: InspectOptions
}

/**
 * @category Important
 */
export type StrictStreamrClientConfig = {
    /** Custom human-readable debug id for client. Used in logging. Unique id will be generated regardless. */
    id?: string,
    /**
    * Authentication: identity used by this StreamrClient instance.
    * Can contain member privateKey or (window.)ethereum
    */
    auth: AuthConfig
    streamRegistryChainAddress: EthereumAddress, // this saves streams and permissions
    streamStorageRegistryChainAddress: EthereumAddress, // this ueses the streamregistry and
    // noderegistry contracts and saves what streams are stored by which storagenodes
    storageNodeRegistryChainAddress: EthereumAddress, // this saves storage nodes with their urls
    ensCacheChainAddress: EthereumAddress,
    network: NetworkConfig
    cache: CacheConfig,
    /** @internal */
    _timeouts: TimeoutsConfig
    /** @internal */
    debug: DebugConfig
} & (
    EthereumConfig
    & ConnectionConfig
    & SubscribeConfig
    & EncryptionConfig
)

export type StreamrClientConfig = Partial<Omit<StrictStreamrClientConfig, 'network' | 'debug'> & {
    network: Partial<StrictStreamrClientConfig['network']>
    /** @internal */
    debug: Partial<StrictStreamrClientConfig['debug']>
}>

export const STREAMR_STORAGE_NODE_GERMANY = '0x31546eEA76F2B2b3C5cC06B1c93601dc35c9D916'

const chainConfig = Chains.load('production')

const DEFAULT_RPC_TIMEOUT = 120 * 1000

const mainChainConfig = {
    name: 'ethereum',
    chainId: chainConfig.ethereum.id,
    rpcs: chainConfig.ethereum.rpcEndpoints.map(({ url }) => ({
        url,
        timeout: DEFAULT_RPC_TIMEOUT
    }))
}

const sideChainConfig = {
    name: 'polygon',
    chainId: chainConfig.polygon.id,
    rpcs: chainConfig.polygon.rpcEndpoints.map(({ url }) => ({
        url,
        timeout: DEFAULT_RPC_TIMEOUT
    }))
}

/**
 * @category Important
 */
export const STREAM_CLIENT_DEFAULTS: StrictStreamrClientConfig = {
    auth: {},

    // Streamr Core options
    theGraphUrl: 'https://api.thegraph.com/subgraphs/name/streamr-dev/streams',

    // P2P Streamr Network options
    orderMessages: true,
    retryResendAfter: 5000,
    gapFillTimeout: 5000,
    gapFill: true,
    maxGapRequests: 5,
    maxRetries: 5,

    // Encryption options
    verifySignatures: 'auto',
    encryptionKeys: {},

    // Ethereum related options
    // For ethers.js provider params, see https://docs.ethers.io/ethers.js/v5-beta/api-providers.html#provider
    mainChainRPCs: mainChainConfig,
    streamRegistryChainRPCs: sideChainConfig,
    streamRegistryChainAddress: chainConfig.polygon.contracts.StreamRegistry,
    streamStorageRegistryChainAddress: chainConfig.polygon.contracts.StreamStorageRegistry,
    storageNodeRegistryChainAddress: chainConfig.polygon.contracts.StorageNodeRegistry,
    ensCacheChainAddress: chainConfig.polygon.contracts.ENSCache,
    network: {
        trackers: {
            contractAddress: chainConfig.ethereum.contracts.TrackerRegistry
        },
        acceptProxyConnections: false
    },
    ethereumNetworks: {
        polygon: {
            chainId: chainConfig.polygon.id,
            gasPriceStrategy: (estimatedGasPrice: BigNumber) => estimatedGasPrice.add('10000000000'),
        }
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
    debug: {
        inspectOpts: {
            depth: 5,
            maxStringLength: 512
        }
    }
}

export const createStrictConfig = (inputOptions: StreamrClientConfig = {}): StrictStreamrClientConfig => {
    validateConfig(inputOptions)
    const opts = cloneDeep(inputOptions)
    const defaults = cloneDeep(STREAM_CLIENT_DEFAULTS)

    const options: StrictStreamrClientConfig = {
        ...defaults,
        ...opts,
        network: {
            ...merge(defaults.network || {}, opts.network),
            trackers: opts.network?.trackers ?? defaults.network.trackers,
        },
        debug: merge(defaults.debug || {}, opts.debug),
        cache: {
            ...defaults.cache,
            ...opts.cache,
        }
        // NOTE: sidechain and storageNode settings are not merged with the defaults
    }

    options.auth = options.auth || {}

    if ('privateKey' in options.auth) {
        const { privateKey } = options.auth
        if (typeof privateKey === 'string' && !privateKey.startsWith('0x')) {
            options.auth.privateKey = `0x${options.auth!.privateKey}`
        }
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

/**
 * DI Injection tokens for pieces of config.
 * tsyringe needs a concrete value to use as the injection token.
 * In the case of interfaces & types, these have no runtime value
 * so we have to introduce some token to use for their injection.
 * These symbols represent subsections of the full config.
 *
 * For example:
 * config.ethereum can be injected with a token like: @inject(ConfigInjectionToken.Ethereum)
 */
export const ConfigInjectionToken = {
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
