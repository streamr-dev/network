import qs from 'qs'
import { ControlLayer, MessageLayer } from 'streamr-client-protocol'
import Debug from 'debug'

import { getVersionString, counterId } from './utils'

const { ControlMessage } = ControlLayer
const { StreamMessage } = MessageLayer

export default function ClientConfig(opts = {}) {
    const { id = counterId('StreamrClient') } = opts
    // Default options
    const options = {
        debug: Debug(id),
        // The server to connect to
        url: 'wss://streamr.network/api/v1/ws',
        restUrl: 'https://streamr.network/api/v1',
        // Automatically connect on first subscribe
        autoConnect: true,
        // Automatically disconnect on last unsubscribe
        autoDisconnect: true,
        orderMessages: true,
        auth: {},
        groupKeys: {},
        publishWithSignature: 'auto',
        verifySignatures: 'auto',
        retryResendAfter: 5000,
        gapFillTimeout: 5000,
        maxPublishQueueSize: 10000,
        streamrNodeAddress: '0xf3E5A65851C3779f468c9EcB32E6f25D9D68601a',
        streamrOperatorAddress: '0xc0aa4dC0763550161a6B59fa430361b5a26df28C',
        tokenAddress: '0x0Cf0Ee63788A0849fE5297F3407f701E122cC023',
        keyExchange: {},
        ...opts,
        cache: {
            maxSize: 10000,
            maxAge: 30 * 60 * 1000, // 30 minutes
            ...opts.cache,
        }
    }

    const parts = options.url.split('?')
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
    if (options.authKey && !options.apiKey) {
        options.apiKey = options.authKey
    }

    if (options.apiKey) {
        options.auth.apiKey = options.apiKey
    }

    if (options.auth.privateKey && !options.auth.privateKey.startsWith('0x')) {
        options.auth.privateKey = `0x${options.auth.privateKey}`
    }

    return options
}
