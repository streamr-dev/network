import qs from 'qs'
import { ControlLayer, MessageLayer } from 'streamr-client-protocol'
import Debug from 'debug'

import { getVersionString, counterId } from './utils'
import { StreamrClientOptions } from './StreamrClient'

const { ControlMessage } = ControlLayer
const { StreamMessage } = MessageLayer

export default function ClientConfig(opts: StreamrClientOptions = {}) {
    const { id = counterId('StreamrClient') } = opts

    const options: StreamrClientOptions = {
        debug: Debug(id),
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
        maxPublishQueueSize: 10000,

        // Encryption options
        publishWithSignature: 'auto',
        verifySignatures: 'auto',
        publisherStoreKeyHistory: true,
        groupKeys: {}, // {streamId: groupKey}
        keyExchange: {},

        // Ethereum and Data Union related options
        // For ethers.js provider params, see https://docs.ethers.io/ethers.js/v5-beta/api-providers.html#provider
        mainnet: null, // Default to ethers.js default provider settings
        sidechain: {
            // @ts-expect-error
            url: null, // TODO: add our default public service sidechain node, also find good PoA params below
            // timeout:
            // pollingInterval:
        },
        // @ts-expect-error
        dataUnion: null, // Give a "default target" of all data union endpoint operations (no need to pass argument every time)
        tokenAddress: '0x0Cf0Ee63788A0849fE5297F3407f701E122cC023',
        minimumWithdrawTokenWei: '1000000', // Threshold value set in AMB configs, smallest token amount to pass over the bridge
        // @ts-expect-error
        sidechainTokenAddress: null, // TODO // sidechain token
        // @ts-expect-error
        factoryMainnetAddress: null, // TODO // Data Union factory that creates a new Data Union
        // @ts-expect-error
        sidechainAmbAddress: null, // Arbitrary Message-passing Bridge (AMB), see https://github.com/poanetwork/tokenbridge
        payForSignatureTransport: true, // someone must pay for transporting the withdraw tx to mainnet, either us or bridge operator
        ...opts,
        cache: {
            maxSize: 10000,
            maxAge: 30 * 60 * 1000, // 30 minutes
            ...opts.cache,
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

    if (options.auth!.privateKey && !options.auth!.privateKey.startsWith('0x')) {
        options.auth!.privateKey = `0x${options.auth!.privateKey}`
    }

    return options
}
