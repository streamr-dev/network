/**
 * @module StreamrClientConfig
 */

import qs from 'qs'
import { ControlLayer, MessageLayer } from 'streamr-client-protocol'
import { ExternalProvider, JsonRpcFetchFunc } from '@ethersproject/providers'
import { BigNumber } from '@ethersproject/bignumber'
import { getVersionString } from './utils'
import { ConnectionInfo } from '@ethersproject/web'
import { EthereumAddress, Todo } from './types'
import { BytesLike } from '@ethersproject/bytes'
import { isAddress } from '@ethersproject/address'
import has from 'lodash.has'
import get from 'lodash.get'

export type EthereumConfig = ExternalProvider|JsonRpcFetchFunc

/**
 * @category Important
 */
export type StrictStreamrClientOptions = {
    /**
    * Authentication: identity used by this StreamrClient instance.
    * Can contain member privateKey or (window.)ethereum
    */
    auth: {
        privateKey?: BytesLike
        ethereum?: EthereumConfig
        apiKey?: string
        username?: string
        password?: string
    }
    /** Websocket server to connect to */
    url: string
    /** Core HTTP API calls go here */
    restUrl: string
    /** joinPartAgent when using EE for join part handling */
    streamrNodeAddress: EthereumAddress
    /** Automatically connect on first subscribe */
    autoConnect: boolean
    /**  Automatically disconnect on last unsubscribe */
    autoDisconnect: boolean
    /** Attempt to order messages */
    orderMessages: boolean
    retryResendAfter: number
    gapFillTimeout: number
    maxGapRequests: number
    maxPublishQueueSize: number
    publishWithSignature: Todo
    verifySignatures: Todo
    publisherStoreKeyHistory: boolean
    groupKeys: Todo
    keyExchange: Todo
    mainnet?: ConnectionInfo|string
    sidechain: ConnectionInfo & { chainId?: number }
    tokenAddress: EthereumAddress,
    tokenSidechainAddress: EthereumAddress,
    dataUnion: {
        /**
         * Threshold value set in AMB configs, smallest token amount to pass over the bridge if
         * someone else pays for the gas when transporting the withdraw tx to mainnet;
         * otherwise the client does the transport as self-service and pays the mainnet gas costs
         */
        minimumWithdrawTokenWei: BigNumber|number|string
        freeWithdraw: boolean
        factoryMainnetAddress: EthereumAddress
        factorySidechainAddress: EthereumAddress
        templateMainnetAddress: EthereumAddress
        templateSidechainAddress: EthereumAddress
    },
    cache: {
        maxSize: number,
        maxAge: number
    }
}

export type StreamrClientOptions = Partial<Omit<StrictStreamrClientOptions, 'dataUnion'> & {
    dataUnion: Partial<StrictStreamrClientOptions['dataUnion']>
}>

const { ControlMessage } = ControlLayer
const { StreamMessage } = MessageLayer

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
export const STREAM_CLIENT_DEFAULTS: StrictStreamrClientOptions = {
    auth: {},

    // Streamr Core options
    url: 'wss://streamr.network/api/v1/ws',
    restUrl: 'https://streamr.network/api/v1',
    streamrNodeAddress: '0xf3E5A65851C3779f468c9EcB32E6f25D9D68601a',

    // P2P Streamr Network options
    autoConnect: true,
    autoDisconnect: true,
    orderMessages: true,
    retryResendAfter: 5000,
    gapFillTimeout: 5000,
    maxGapRequests: 5,
    maxPublishQueueSize: 10000,

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
        url: 'https://rpc.xdaichain.com/',
        chainId: 100
    },
    tokenAddress: '0x0Cf0Ee63788A0849fE5297F3407f701E122cC023',
    tokenSidechainAddress: '0xE4a2620edE1058D61BEe5F45F6414314fdf10548',
    dataUnion: {
        minimumWithdrawTokenWei: '1000000',
        freeWithdraw: false,
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
export default function ClientConfig(opts: StreamrClientOptions = {}) {

    // validate all Ethereum addresses which are required in StrictStreamrClientOptions: if user
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
        'dataUnion.templateSidechainAddress'
    ])

    const options: StrictStreamrClientOptions = {
        ...STREAM_CLIENT_DEFAULTS,
        ...opts,
        dataUnion: {
            ...STREAM_CLIENT_DEFAULTS.dataUnion,
            ...opts.dataUnion
        },
        cache: {
            ...opts.cache,
            ...STREAM_CLIENT_DEFAULTS.cache,
        }
        // NOTE: sidechain is not merged with the defaults
    }

    const parts = options.url!.split('?')
    if (parts.length === 1) { // there is no query string
        const controlLayer = `controlLayerVersion=${ControlMessage.LATEST_VERSION}`
        const messageLayer = `messageLayerVersion=${StreamMessage.LATEST_VERSION}`
        options.url = `${options.url}?${controlLayer}&${messageLayer}`
    } else {
        const queryObj = qs.parse(parts[1])
        if (!queryObj.controlLayerVersion) {
            options.url = `${options.url}&controlLayerVersion=1`
        }

        if (!queryObj.messageLayerVersion) {
            options.url = `${options.url}&messageLayerVersion=31`
        }
    }

    // always add streamrClient version
    options.url = `${options.url}&streamrClient=${getVersionString()}`

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
