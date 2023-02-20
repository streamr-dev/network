import 'reflect-metadata'
import type { Overrides } from '@ethersproject/contracts'
import cloneDeep from 'lodash/cloneDeep'
import Ajv, { ErrorObject } from 'ajv'
import addFormats from 'ajv-formats'
import type { ExternalProvider } from '@ethersproject/providers'
import { MarkOptional, DeepRequired } from 'ts-essentials'

import CONFIG_SCHEMA from './config.schema.json'
import { TrackerRegistryRecord } from '@streamr/protocol'
import { LogLevel } from '@streamr/utils'

import { IceServer, Location } from '@streamr/network-node'
import type { ConnectionInfo } from '@ethersproject/web'
import { generateClientId } from './utils/utils'

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

export interface ChainConnectionInfo { 
    rpcs: ConnectionInfo[]
    chainId?: number
    name?: string
}

// these should come from ETH-184 config package when it's ready
export interface EthereumNetworkConfig {
    chainId: number
    overrides?: Overrides
    highGasPriceStrategy?: boolean
}

/**
 * @category Important
 */
export interface StreamrClientConfig {
    /** Custom human-readable debug id for client. Used in logging. */
    id?: string
    logLevel?: LogLevel
    /**
    * Authentication: identity used by this StreamrClient instance.
    * Can contain member privateKey or (window.)ethereum
    */
    auth?: PrivateKeyAuthConfig | ProviderAuthConfig

    /** Attempt to order messages */
    orderMessages?: boolean
    gapFill?: boolean
    maxGapRequests?: number
    retryResendAfter?: number
    gapFillTimeout?: number

    /**
     * Message encryption/decryption
     */
    encryption?: {
        /**
         * Enable experimental Lit Protocol key exchange.
         *
         * When enabled encryption key storing and fetching will be primarily done through the Lit Protocol and
         * secondarily through the standard Streamr key-exchange system.
         */
        litProtocolEnabled?: boolean
        /**
         * Enable log messages of the Lit Protocol library to be printed to stdout.
         */
        litProtocolLogging?: boolean
        // TODO keyRequestTimeout and maxKeyRequestsPerSecond config options could be applied
        // to lit protocol key requests (both encryption and decryption?)
        keyRequestTimeout?: number
        maxKeyRequestsPerSecond?: number
    }

    network?: {
        id?: string
        acceptProxyConnections?: boolean
        trackers?: TrackerRegistryRecord[] | TrackerRegistryContract
        trackerPingInterval?: number
        trackerConnectionMaintenanceInterval?: number
        webrtcDisallowPrivateAddresses?: boolean
        newWebrtcConnectionTimeout?: number
        webrtcDatachannelBufferThresholdLow?: number
        webrtcDatachannelBufferThresholdHigh?: number
        /**
         * The maximum amount of outgoing messages to be buffered on a single WebRTC connection.
         */
        webrtcSendBufferMaxMessageCount?: number
        disconnectionWaitTime?: number
        peerPingInterval?: number
        rttUpdateTimeout?: number
        iceServers?: ReadonlyArray<IceServer>
        location?: Location
    }

    contracts?: {
        streamRegistryChainAddress?: string
        streamStorageRegistryChainAddress?: string
        storageNodeRegistryChainAddress?: string
        mainChainRPCs?: ChainConnectionInfo
        streamRegistryChainRPCs?: ChainConnectionInfo
        // most of the above should go into ethereumNetworks configs once ETH-184 is ready
        ethereumNetworks?: Record<string, EthereumNetworkConfig>
        /** Some TheGraph instance, that indexes the streamr registries */
        theGraphUrl?: string
        maxConcurrentCalls?: number
    }

    metrics?: {
        periods?: {
            streamId: string
            duration: number
        }[]
        maxPublishDelay?: number
    } | boolean

    cache?: {
        maxSize?: number
        maxAge?: number
    }

    /** @internal */
    _timeouts?: {
        theGraph?: {
            timeout?: number
            retryInterval?: number
        }
        storageNode?: {
            timeout?: number
            retryInterval?: number
        }
        jsonRpc?: {
            timeout?: number
            retryInterval?: number
        }
        httpFetchTimeout?: number
    }
}

export type StrictStreamrClientConfig = MarkOptional<Required<StreamrClientConfig>, 'auth' | 'metrics'> & {
    network: MarkOptional<Exclude<Required<StreamrClientConfig['network']>, undefined>, 'location'>
    contracts: Exclude<Required<StreamrClientConfig['contracts']>, undefined>
    encryption: Exclude<Required<StreamrClientConfig['encryption']>, undefined>
    cache: Exclude<Required<StreamrClientConfig['cache']>, undefined>
    _timeouts: Exclude<DeepRequired<StreamrClientConfig['_timeouts']>, undefined>
}

export const STREAMR_STORAGE_NODE_GERMANY = '0x31546eEA76F2B2b3C5cC06B1c93601dc35c9D916'

export const createStrictConfig = (input: StreamrClientConfig = {}): StrictStreamrClientConfig => {
    // TODO is it good to cloneDeep the input object as it may have object references (e.g. auth.ethereum)?
    const config: StrictStreamrClientConfig = validateConfig(cloneDeep(input))
    config.id ??= generateClientId()
    return config
}

export const validateConfig = (data: unknown): StrictStreamrClientConfig | never => {
    const ajv = new Ajv({
        useDefaults: true
    })
    addFormats(ajv)
    ajv.addFormat('ethereum-address', /^0x[a-zA-Z0-9]{40}$/)
    ajv.addFormat('ethereum-private-key', /^(0x)?[a-zA-Z0-9]{64}$/)
    const validate = ajv.compile<StrictStreamrClientConfig>(CONFIG_SCHEMA)
    if (!validate(data)) {
        throw new Error(validate.errors!.map((e: ErrorObject) => {
            let text = ajv.errorsText([e], { dataVar: '' }).trim()
            if (e.params.additionalProperty) {
                text += `: ${e.params.additionalProperty}`
            }
            return text
        }).join('\n'))
    }
    return data
}

export const redactConfig = (config: StrictStreamrClientConfig): void => {
    if ((config.auth as PrivateKeyAuthConfig)?.privateKey !== undefined) {
        (config.auth as PrivateKeyAuthConfig).privateKey = '(redacted)'
    }
}

export const ConfigInjectionToken = Symbol('Config')
