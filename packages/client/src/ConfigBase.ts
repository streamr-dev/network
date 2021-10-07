/**
 * @module StreamrClientConfig
 *
 * Old Client Config
 * New Brubeck Configuration in Config.ts.
 * TODO: Disolve ConfigBase.
 */

import { BigNumber } from '@ethersproject/bignumber'
import { isAddress } from '@ethersproject/address'
import has from 'lodash/has'
import get from 'lodash/get'
import cloneDeep from 'lodash/cloneDeep'

import { EthereumAddress, Todo } from './types'

import { AuthConfig, EthereumConfig } from './Ethereum'
import { EncryptionConfig } from './encryption/KeyExchangeUtils'
import { ControlMessage, StreamMessage } from 'streamr-client-protocol'

export type CacheConfig = {
    maxSize: number,
    maxAge: number
}

export type PublishConfig = {
    maxPublishQueueSize: number
    publishWithSignature: Todo
    publisherStoreKeyHistory: boolean
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
    streamRegistrySidechainAddress: EthereumAddress,
    nodeRegistrySidechainAddress: EthereumAddress,
    streamStorageRegistrySidechainAddress: EthereumAddress,
    ensCacheSidechainAddress: EthereumAddress,
    keyExchange: Todo
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

const validateOverridedEthereumAddresses = (opts: any, propertyPaths: string[]) => {
    for (const propertyPath of propertyPaths) {
        if (has(opts, propertyPath)) {
            const value = get(opts, propertyPath)
            if (!isAddress(value)) {
                throw new Error(`${propertyPath} is not a valid Ethereum address`)
            }
        }
    }
}

/**
 * @category Important
 */
export const STREAM_CLIENT_DEFAULTS: StrictStreamrClientConfig = {
    auth: {},

    // Streamr Core options
    restUrl: 'https://streamr.network/api/v1',
    theGraphUrl: 'http://127.0.0.1:8000/subgraphs/name/githubname/subgraphname',
    streamrNodeAddress: '0xf3E5A65851C3779f468c9EcB32E6f25D9D68601a',

    // P2P Streamr Network options
    autoConnect: true,
    autoDisconnect: true,
    orderMessages: true,
    retryResendAfter: 5000,
    gapFillTimeout: 5000,
    gapFill: true,
    maxGapRequests: 5,
    maxRetries: 5,
    maxPublishQueueSize: 10000,
    publishAutoDisconnectDelay: 5000,

    // Encryption options
    publishWithSignature: 'auto',
    verifySignatures: 'auto',
    publisherStoreKeyHistory: true,
    groupKeys: {}, // {streamId: groupKey}
    keyExchange: {},

    // Ethereum and Data Union related options
    // For ethers.js provider params, see https://docs.ethers.io/ethers.js/v5-beta/api-providers.html#provider
    mainnet: undefined, // Default to ethers.js default provider settings
    sidechain: {
        // url: 'https://rpc.xdaichain.com/',
        // chainId: 100
        url: 'http://10.200.10.1:8546/',
        chainId: 8997
    },
    binanceRPC: {
        url: 'https://bsc-dataseed.binance.org/',
        chainId: 56
    },
    tokenAddress: '0x0Cf0Ee63788A0849fE5297F3407f701E122cC023',
    tokenSidechainAddress: '0xE4a2620edE1058D61BEe5F45F6414314fdf10548',
    binanceAdapterAddress: '0x0c1aF6edA561fbDA48E9A7B1Dd46D216F31A97cC',
    binanceSmartChainAMBAddress: '0x05185872898b6f94aa600177ef41b9334b1fa48b',
    withdrawServerUrl: 'https://streamr.com:3000',
    streamRegistrySidechainAddress: '0x6cCdd5d866ea766f6DF5965aA98DeCCD629ff222',
    nodeRegistrySidechainAddress: '0x7739b57beC285539A62434DF9808f66ebB405ba3',
    streamStorageRegistrySidechainAddress: '0xCBAcfA0592B3D809aEc805d527f8ceAe9307D9C0',
    ensCacheSidechainAddress: '',
    dataUnion: {
        minimumWithdrawTokenWei: '1000000',
        payForTransport: true,
        factoryMainnetAddress: '0x7d55f9981d4E10A193314E001b96f72FCc901e40',
        factorySidechainAddress: '0x1b55587Beea0b5Bc96Bb2ADa56bD692870522e9f',
        templateMainnetAddress: '0x5FE790E3751dd775Cb92e9086Acd34a2adeB8C7b',
        templateSidechainAddress: '0xf1E9d6E254BeA3f0129018AcA1A50AEcb7D528be',
    },
    cache: {
        maxSize: 10000,
        maxAge: 30 * 60 * 1000, // 30 minutes
    }
}

/** @internal */
export default function ClientConfig(inputOptions: StreamrClientConfig = {}) {
    const opts = cloneDeep(inputOptions)
    const defaults = cloneDeep(STREAM_CLIENT_DEFAULTS)
    // validate all Ethereum addresses which are required in StrictStreamrClientConfig: if user
    // overrides a setting, which has a default value, it must be a non-null valid Ethereum address
    // TODO could also validate
    // - other optional Ethereum address (if there will be some)
    // - other overriden options (e.g. regexp check that "restUrl" is a valid url)
    validateOverridedEthereumAddresses(opts, [
        'streamrNodeAddress',
        'tokenAddress',
        'tokenSidechainAddress',
        'dataUnion.factoryMainnetAddress',
        'dataUnion.factorySidechainAddress',
        'dataUnion.templateMainnetAddress',
        'dataUnion.templateSidechainAddress',
        'storageNode.address'
    ])

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
