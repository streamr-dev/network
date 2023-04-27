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

import { IceServer, Location, WebRtcPortRange } from '@streamr/network-node'
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

    /**
     * Override the default logging level.
     */
    logLevel?: LogLevel

    /**
    * The Ethereum identity to be used by the client. Either a private key
    * or a window.ethereum object.
    */
    auth?: PrivateKeyAuthConfig | ProviderAuthConfig

    /**
     * Due to the distributed nature of the network, messages may occasionally
     * arrive to the client out-of-order. Set this option to `true` if you want
     * the client to reorder received messages to the intended order.
     *
     * */
    orderMessages?: boolean

    /**
     * Set to true to enable gap filling.
     *
     * Some messages may occasionally not reach the client due to networking
     * issues. Missing messages form gaps that are often detectable and
     * retrievable on demand. By enabling gap filling, the client will detect
     * and fix gaps automatically for you.
     */
    gapFill?: boolean

    /**
     * When gap filling is enabled, this option controls the maximum amount of
     * times a gap will try to be actively filled before giving up and
     * proceeding forwards.
     */
    maxGapRequests?: number

    /**
     * When gap filling is enabled and a gap is encountered, this option
     * defines the amount of time in milliseconds to wait before attempting to
     * _actively_ fill in the gap.
     *
     * Rationale: data may just be arriving out-of-order and the missing
     * message(s) may be on their way. For efficiency, it makes sense to wait a
     * little before actively attempting to fill in a gap, as this involves
     * a resend request / response interaction with a storage node.
     */
    gapFillTimeout?: number

    /**
     * When gap filling is enabled and a gap is encountered, a resend request
     * may eventually be sent to a storage node in an attempt to _actively_
     * fill in the gap. This option controls how long to wait for, in
     * milliseconds, for a resend response from the storage node before
     * proceeding to the next attempt.
     */
    retryResendAfter?: number

    /**
     * Controls how messages encryption and decryption should be handled and
     * how encryption keys should be exchanged.
     */
    encryption?: {
        /**
         * Enable experimental Lit Protocol key exchange.
         *
         * When enabled encryption key storing and fetching will primarily be done through the
         * [Lit Protocol](https://litprotocol.com/) and secondarily through the standard Streamr
         * key-exchange system.
         */
        litProtocolEnabled?: boolean

        /**
         * Enable log messages of the Lit Protocol library to be printed to stdout.
         */
        litProtocolLogging?: boolean

        // TODO keyRequestTimeout and maxKeyRequestsPerSecond config options could be applied
        // to lit protocol key requests (both encryption and decryption?)
        /**
         * When requesting an encryption key using the standard Streamr
         * key-exchange system, defines how many milliseconds should a response
         * be awaited for.
         */
        keyRequestTimeout?: number

        /**
         * The maximum amount of encryption key requests that should be sent via
         * the standard Streamr key-exchange system per second.
         *
         * In streams with 1000+ publishers, it is important to limit the amount
         * of control message traffic that gets generated to avoid network buffers
         * from overflowing.
         */
        maxKeyRequestsPerSecond?: number
    }

    /**
     * These settings determine how the client performs and interacts with the
     * Streamr Network.
     */
    network?: {
        /**
         * The network-wide identifier of this node. Should be unique
         * within the Streamr Network.
         */
        id?: string

        /**
         * Whether to accept proxy connections. Enabling this option allows
         * this network node to act as proxy on behalf of other nodes / clients.
         */
        acceptProxyConnections?: boolean

        /**
         * Defines the trackers that should be used for peer discovery and
         * connection forming.
         *
         * Generally not intended to be configured by the end-user unless a
         * custom network is being formed.
         */
        trackers?: TrackerRegistryRecord[] | TrackerRegistryContract

        /**
         * Defines how often, in milliseconds, to ping connected tracker(s) to
         * determine connection aliveness.
         */
        trackerPingInterval?: number

        /**
         * Determines how often, in milliseconds, should tracker connections be
         * maintained. This involves connecting to any relevant trackers to
         * which a connection does not yet exist and disconnecting from
         * irrelevant ones.
         */
        trackerConnectionMaintenanceInterval?: number

        /**
         * When set to true private addresses will not be probed when forming
         * WebRTC connections.
         *
         * Probing private addresses can trigger false-positive incidents in
         * some port scanning detection systems employed by web hosting
         * providers. Disallowing private addresses may prevent direct
         * connections from being formed between nodes using IPv4 addresses
         * on a local network.
         *
         * Details: https://github.com/streamr-dev/network/wiki/WebRTC-private-addresses
         */
        webrtcDisallowPrivateAddresses?: boolean

        /**
         * Defines WebRTC connection establishment timeout in milliseconds.
         *
         * When attempting to form a new connection, if not established within
         * this timeout, the attempt is considered as failed and further
         * waiting for it will cease.
         */
        newWebrtcConnectionTimeout?: number

        /**
         * Sets the low-water mark used by send buffers of WebRTC connections.
         */
        webrtcDatachannelBufferThresholdLow?: number

        /**
         * Sets the high-water mark used by send buffers of WebRTC connections.
         */
        webrtcDatachannelBufferThresholdHigh?: number

        /**
         * The maximum outgoing message size (in bytes) accepted by WebRTC
         * connections. Messages exceeding the maximum size are simply
         * discarded.
         */
        webrtcMaxMessageSize?: number

        /**
         * Defines a custom UDP port range to be used for WebRTC connections.
         * This port range should not be restricted by enclosing firewalls
         * or virtual private cloud configurations.
         */
        webrtcPortRange?: WebRtcPortRange

        /**
         * The maximum amount of messages retained in the send queue of a WebRTC
         * connection.
         *
         * When the send queue becomes full, oldest messages are discarded
         * first to make room for new.
         */
        webrtcSendBufferMaxMessageCount?: number

        /**
         * Determines how long, in milliseconds, to keep non-relevant neighbor
         * connections around for before disconnecting them.
         *
         * A connection with another node is relevant when the two share
         * one or more streams and thus have messages to propagate to one
         * another. When this no longer holds, the connection may be cut.
         *
         * During the topology re-organization process, sometimes a neighbor
         * node may cease to be our neighbor only to become one once again in
         * a short period of time. For this reason, it can be beneficial not to
         * disconnect non-relevant neighbors right away.
         */
        disconnectionWaitTime?: number

        /**
         * Defines how often, in milliseconds, to ping connected nodes to
         * determine connection aliveness.
         */
        peerPingInterval?: number

        /**
         * Determines how often, in milliseconds, at most, to include
         * round-trip time (RTT) statistics in status updates to trackers.
         */
        rttUpdateTimeout?: number

        /**
         * The list of STUN and TURN servers to use in ICE protocol when
         * forming WebRTC connections.
         */
        iceServers?: ReadonlyArray<IceServer>

        /**
         * Defines an explicit geographic location for this node (overriding Geo
         * IP lookup).
         */
        location?: Location
    }

    /**
     * The smart contract addresses and RPC urls to be used in the client.
     * Generally not intended to be configured by the end-user unless a
     * custom network is being formed.
     */
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
        pollInterval?: number
    }

    /**
     * Determines the telemetry metrics that are sent to the Streamr Network
     * at regular intervals.
     *
     * By setting this to false, you disable the feature.
     */
    metrics?: {
        periods?: {
            streamId: string
            duration: number
        }[]
        maxPublishDelay?: number
    } | boolean

    /**
     * Determines caching behaviour for certain repeated smart contract queries.
     */
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
        ensStreamCreation?: {
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
