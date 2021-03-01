import qs from 'qs'
import { ControlLayer, MessageLayer } from 'streamr-client-protocol'
import { ExternalProvider, JsonRpcFetchFunc } from '@ethersproject/providers'
import { BigNumber } from '@ethersproject/bignumber'
import { getVersionString } from './utils'
import { ConnectionInfo } from '@ethersproject/web'
import { Todo } from './types'

export type EthereumConfig = ExternalProvider|JsonRpcFetchFunc

export type StreamrClientOptions = {
    auth: {
        privateKey?: string
        ethereum?: EthereumConfig
        apiKey?: string
        username?: string
        password?: string
    }
    url: string
    restUrl: string
    streamrNodeAddress: string
    autoConnect: boolean
    autoDisconnect: boolean
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
    sidechain?: ConnectionInfo|string
    dataUnion?: string
    tokenAddress: string,
    minimumWithdrawTokenWei?: BigNumber|number|string
    factoryMainnetAddress: string
    factorySidechainAddress: string
    payForSignatureTransport: boolean
    cache: {
        maxSize: number,
        maxAge: number
    }
}

const { ControlMessage } = ControlLayer
const { StreamMessage } = MessageLayer

export default function ClientConfig(opts: Partial<StreamrClientOptions> = {}) {
    const defaults: StreamrClientOptions = {
        // Authentication: identity used by this StreamrClient instance
        auth: {}, // can contain member privateKey or (window.)ethereum

        // Streamr Core options
        url: 'wss://streamr.network/api/v1/ws', // The server to connect to
        restUrl: 'https://streamr.network/api/v1', // Core API calls go here
        streamrNodeAddress: '0xf3E5A65851C3779f468c9EcB32E6f25D9D68601a', // joinPartAgent when using EE for join part handling

        // P2P Streamr Network options
        autoConnect: true, // Automatically connect on first subscribe
        autoDisconnect: true, // Automatically disconnect on last unsubscribe
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
        sidechain: undefined, // TODO: add our default public service sidechain node, also find good PoA params below
        tokenAddress: '0x0Cf0Ee63788A0849fE5297F3407f701E122cC023',
        minimumWithdrawTokenWei: '1000000', // Threshold value set in AMB configs, smallest token amount to pass over the bridge
        factoryMainnetAddress: 'TODO', // TODO // Data Union factory that creates a new Data Union
        factorySidechainAddress: 'TODO',
        payForSignatureTransport: true, // someone must pay for transporting the withdraw tx to mainnet, either us or bridge operator
        cache: {
            maxSize: 10000,
            maxAge: 30 * 60 * 1000, // 30 minutes
        }
    }

    const options: StreamrClientOptions = {
        ...defaults,
        ...opts,
        cache: {
            ...opts.cache,
            ...defaults.cache,
        }
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
