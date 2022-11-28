import 'reflect-metadata'
import type { BigNumber } from '@ethersproject/bignumber'
import type { Overrides } from '@ethersproject/contracts'
import cloneDeep from 'lodash/cloneDeep'
import Ajv, { ErrorObject } from 'ajv'
import addFormats from 'ajv-formats'
import type { ExternalProvider } from '@ethersproject/providers'

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
    /** @deprecated */
    gasPriceStrategy?: (estimatedGasPrice: BigNumber) => BigNumber
}

export interface StrictStreamrClientConfig {
    /** Custom human-readable debug id for client. Used in logging. */
    id: string
    logLevel: LogLevel
    /**
    * Authentication: identity used by this StreamrClient instance.
    * Can contain member privateKey or (window.)ethereum
    */
    auth?: PrivateKeyAuthConfig | ProviderAuthConfig

    /** Attempt to order messages */
    orderMessages: boolean
    gapFill: boolean
    maxGapRequests: number
    retryResendAfter: number
    gapFillTimeout: number

    network: {
        id?: string
        acceptProxyConnections?: boolean
        trackers: TrackerRegistryRecord[] | TrackerRegistryContract
        trackerPingInterval?: number
        trackerConnectionMaintenanceInterval?: number
        webrtcDisallowPrivateAddresses?: boolean
        newWebrtcConnectionTimeout?: number
        webrtcDatachannelBufferThresholdLow?: number
        webrtcDatachannelBufferThresholdHigh?: number
        disconnectionWaitTime?: number
        peerPingInterval?: number
        rttUpdateTimeout?: number
        iceServers?: ReadonlyArray<IceServer>
        location?: Location
    }

    contracts: {
        streamRegistryChainAddress: string
        streamStorageRegistryChainAddress: string
        storageNodeRegistryChainAddress: string
        mainChainRPCs: ChainConnectionInfo
        streamRegistryChainRPCs: ChainConnectionInfo
        // most of the above should go into ethereumNetworks configs once ETH-184 is ready
        ethereumNetworks: Record<string, EthereumNetworkConfig>
        /** Some TheGraph instance, that indexes the streamr registries */
        theGraphUrl: string
        maxConcurrentCalls: number
    }

    decryption: {
        keyRequestTimeout: number
        maxKeyRequestsPerSecond: number
    }

    metrics?: {
        periods?: {
            streamId: string
            duration: number
        }[]
        maxPublishDelay?: number
    } | boolean

    cache: {
        maxSize: number
        maxAge: number
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

/**
 * @category Important
 */
export type StreamrClientConfig = Partial<Omit<StrictStreamrClientConfig, 'network' | 'contracts' | 'decryption'> & {
    network: Partial<StrictStreamrClientConfig['network']>
    contracts: Partial<StrictStreamrClientConfig['contracts']>
    decryption: Partial<StrictStreamrClientConfig['decryption']>
}>

export const STREAMR_STORAGE_NODE_GERMANY = '0x31546eEA76F2B2b3C5cC06B1c93601dc35c9D916'

/** @deprecated */
export const STREAM_CLIENT_DEFAULTS: Omit<StrictStreamrClientConfig, 'id' | 'auth'> = {
    logLevel: 'info',

    orderMessages: true,
    gapFill: true,
    maxGapRequests: 5,
    retryResendAfter: 5000,
    gapFillTimeout: 5000,
    
    network: {
        trackers: {
            contractAddress: '0xab9BEb0e8B106078c953CcAB4D6bF9142BeF854d'
        },
        acceptProxyConnections: false,
        iceServers: [
            {
                url: 'stun:stun.streamr.network',
                port: 5349
            },
            {
                url: 'turn:turn.streamr.network',
                port: 5349,
                username: 'BrubeckTurn1',
                password: 'MIlbgtMw4nhpmbgqRrht1Q=='
            }
        ]
    },

    // For ethers.js provider params, see https://docs.ethers.io/ethers.js/v5-beta/api-providers.html#provider
    contracts: {
        streamRegistryChainAddress: '0x0D483E10612F327FC11965Fc82E90dC19b141641',
        streamStorageRegistryChainAddress: '0xe8e2660CeDf2a59C917a5ED05B72df4146b58399',
        storageNodeRegistryChainAddress: '0x080F34fec2bc33928999Ea9e39ADc798bEF3E0d6',
        mainChainRPCs: {
            name: 'ethereum',
            chainId: 1,
            rpcs: [
                {
                    url: 'https://eth-rpc.gateway.pokt.network',
                    timeout: 120 * 1000
                },
                {
                    url: 'https://ethereum.publicnode.com',
                    timeout: 120 * 1000
                },
                {
                    url: 'https://rpc.ankr.com/eth',
                    timeout: 120 * 1000
                },
            ]
        },
        streamRegistryChainRPCs: {
            name: 'polygon',
            chainId: 137,
            rpcs: [{
                url: 'https://polygon-rpc.com',
                timeout: 120 * 1000
            }, {
                url: 'https://poly-rpc.gateway.pokt.network/',
                timeout: 120 * 1000
            }]
        },
        ethereumNetworks: {
            polygon: {
                chainId: 137,
                highGasPriceStrategy: true
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
    }
}

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
