/**
 * @module StreamrClientConfig
 *
 * Old Client Config
 * New Brubeck Configuration in Config.ts.
 * TODO: Disolve ConfigBase.
 */

import type { BigNumber } from '@ethersproject/bignumber'
import cloneDeep from 'lodash/cloneDeep'
import Ajv, { ErrorObject } from 'ajv'
import addFormats from 'ajv-formats'

import type { Todo } from './types'

import type { AuthConfig, EthereumConfig } from './Ethereum'
import type { EncryptionConfig } from './encryption/KeyExchangeUtils'

import CONFIG_SCHEMA from './config.schema.json'
import { EthereumAddress } from 'streamr-client-protocol'

export type CacheConfig = {
    maxSize: number,
    maxAge: number
}

export type PublishConfig = {
    publishWithSignature: Todo
    publishAutoDisconnectDelay: number,
}

export type SubscribeConfig = {
    /** Attempt to order messages */
    orderMessages: boolean
    gapFill: boolean
    maxGapRequests: number
    maxRetries: number
    verifySignatures: Todo
    retryResendAfter: number
    gapFillTimeout: number
}

export type ConnectionConfig = {
    /** Core HTTP API calls go here */
    restUrl: string
    /** Some TheGraph instance, that indexes the streamr registries */
    theGraphUrl: string
    /** Automatically connect on first subscribe */
    autoConnect: boolean
    /**  Automatically disconnect on last unsubscribe */
    autoDisconnect: boolean
}

export type DataUnionConfig = {
    /**
     * Threshold value set in AMB configs, smallest token amount to pass over the bridge if
     * someone else pays for the gas when transporting the withdraw tx to mainnet;
     * otherwise the client does the transport as self-service and pays the mainnet gas costs
     */
    minimumWithdrawTokenWei: BigNumber|number|string
    payForTransport: boolean
    factoryMainnetAddress: EthereumAddress
    factorySidechainAddress: EthereumAddress
    templateMainnetAddress: EthereumAddress
    templateSidechainAddress: EthereumAddress
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
    /** joinPartAgent when using EE for join part handling */
    streamrNodeAddress: EthereumAddress
    streamRegistryChainAddress: EthereumAddress, // this saves streams and permissions
    nodeRegistryChainAddress: EthereumAddress, // this saves sorage nodes with their urls
    streamStorageRegistryChainAddress: EthereumAddress, // this ueses the streamregistry and
        // noderegistry contracts and saves what streams are stored by which storagenodes
    ensCacheChainAddress: EthereumAddress,
    dataUnion: DataUnionConfig
    cache: CacheConfig,
} & (
    EthereumConfig
    & ConnectionConfig
    & PublishConfig
    & SubscribeConfig
    & EncryptionConfig
)

export type StreamrClientConfig = Partial<Omit<StrictStreamrClientConfig, 'dataUnion'> & {
    dataUnion: Partial<StrictStreamrClientConfig['dataUnion']>
}>

export const STREAMR_STORAGE_NODE_GERMANY = '0x31546eEA76F2B2b3C5cC06B1c93601dc35c9D916'

/**
 * @category Important
 */
export const STREAM_CLIENT_DEFAULTS: StrictStreamrClientConfig = {
    auth: {},

    // Streamr Core options
    restUrl: 'https://streamr.network/api/v1/',
    theGraphUrl: 'https://api.thegraph.com/subgraphs/name/streamr-dev/streams',
    streamrNodeAddress: '0xf3E5A65851C3779f468c9EcB32E6f25D9D68601a',
    // storageNodeAddressDev = new StorageNode('0xde1112f631486CfC759A50196853011528bC5FA0', '')

    // P2P Streamr Network options
    autoConnect: true,
    autoDisconnect: true,
    orderMessages: true,
    retryResendAfter: 5000,
    gapFillTimeout: 5000,
    gapFill: true,
    maxGapRequests: 5,
    maxRetries: 5,
    publishAutoDisconnectDelay: 5000,

    // Encryption options
    publishWithSignature: 'auto',
    verifySignatures: 'auto',
    groupKeys: {}, // {streamId: groupKey}

    // Ethereum and Data Union related options
    // For ethers.js provider params, see https://docs.ethers.io/ethers.js/v5-beta/api-providers.html#provider
    mainChainRPC: undefined, // Default to ethers.js default provider settings
    dataUnionChainRPC: {
        name: 'xdai',
        url: 'https://rpc.xdaichain.com/',
        chainId: 100
    },
    dataUnionBinanceWithdrawalChainRPC: {
        name: 'bsc',
        url: 'https://bsc-dataseed.binance.org/',
        chainId: 56
    },
    streamRegistryChainRPC: {
        name: 'polygon',
        url: 'https://polygon-rpc.com',
        chainId: 137
    },
    tokenAddress: '0x8f693ca8D21b157107184d29D398A8D082b38b76',
    tokenSidechainAddress: '0x256eb8a51f382650B2A1e946b8811953640ee47D',
    binanceAdapterAddress: '0x193888692673b5dD46e6BC90bA8cBFeDa515c8C1',
    binanceSmartChainAMBAddress: '0x05185872898b6f94aa600177ef41b9334b1fa48b',
    withdrawServerUrl: 'https://streamr.com:3000',
    streamRegistryChainAddress: '0x0D483E10612F327FC11965Fc82E90dC19b141641',
    nodeRegistryChainAddress: '0x080F34fec2bc33928999Ea9e39ADc798bEF3E0d6',
    streamStorageRegistryChainAddress: '0xe8e2660CeDf2a59C917a5ED05B72df4146b58399',
    ensCacheChainAddress: '0x870528c1aDe8f5eB4676AA2d15FC0B034E276A1A',
    dataUnion: {
        minimumWithdrawTokenWei: '1000000',
        payForTransport: true,
        factoryMainnetAddress: '0xE41439BF434F9CfBF0153f5231C205d4ae0C22e3',
        factorySidechainAddress: '0xFCE1FBFAaE61861B011B379442c8eE1DC868ABd0',
        templateMainnetAddress: '0x67352e3F7dBA907aF877020aE7E9450C0029C70c',
        templateSidechainAddress: '0xaCF9e8134047eDc671162D9404BF63a587435bAa',
    },

    ethereumNetworks: {
        polygon: {
            chainId: 137,
            overrides: {
                maxPriorityFeePerGas: '20000000000', // pay 20 gwei extra
            }
        }
    },

    cache: {
        maxSize: 10000,
        maxAge: 30 * 60 * 1000, // 30 minutes
    }
}

/** @internal */
export default function ClientConfig(inputOptions: StreamrClientConfig = {}) {
    validateConfig(inputOptions)
    const opts = cloneDeep(inputOptions)
    const defaults = cloneDeep(STREAM_CLIENT_DEFAULTS)

    const options: StrictStreamrClientConfig = {
        ...defaults,
        ...opts,
        dataUnion: {
            ...defaults.dataUnion,
            ...opts.dataUnion
        },
        cache: {
            ...defaults.cache,
            ...opts.cache,
        }
        // NOTE: sidechain and storageNode settings are not merged with the defaults
    }

    // Backwards compatibility for option 'authKey' => 'apiKey'
    // @ts-expect-error
    if (options.authKey && !options.apiKey) {
        // @ts-expect-error
        options.apiKey = options.authKey
    }

    // @ts-expect-error
    if (options.apiKey) {
        // @ts-expect-error
        options.auth.apiKey = options.apiKey
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

export const validateConfig = (data: unknown): void|never => {
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
