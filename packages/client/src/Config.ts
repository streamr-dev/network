import 'reflect-metadata'
import type { Overrides } from '@ethersproject/contracts'
import cloneDeep from 'lodash/cloneDeep'
import Ajv, { ErrorObject } from 'ajv'
import addFormats from 'ajv-formats'
import type { ExternalProvider } from '@ethersproject/providers'
import { MarkOptional, DeepRequired } from 'ts-essentials'

import CONFIG_SCHEMA from './config.schema.json'
import { LogLevel } from '@streamr/utils'
import { IceServer, NodeType } from '@streamr/dht'

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

export interface ControlLayerConfig {

    /**
     * The list of entry point PeerDescriptors used to join the Streamr Network.
     */
    entryPoints?: JsonPeerDescriptor[]

    /**
     * The list of STUN and TURN servers to use in ICE protocol when
     * forming WebRTC connections.
    */
    iceServers?: IceServer[]

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
    webrtcAllowPrivateAddresses?: boolean

    /**
     * Defines WebRTC connection establishment timeout in milliseconds.
     *
     * When attempting to form a new connection, if not established within
     * this timeout, the attempt is considered as failed and further
     * waiting for it will cease.
    */
    webrtcNewConnectionTimeout?: number

    /**
     * Sets the low-water mark used by send buffers of WebRTC connections.
    */
    webrtcDatachannelBufferThresholdLow?: number

    /**
     * Sets the high-water mark used by send buffers of WebRTC connections.
    */
    webrtcDatachannelBufferThresholdHigh?: number

    /**
     * Contains connectivity information to the client's Network Node, used in the network layer.
     * Can be used in cases where the client's public IP address is known before
     * starting the network node. If not specified, the PeerDescriptor will be auto-generated.
    */
    peerDescriptor?: JsonPeerDescriptor

    /**
     * The port to use for the client's Network Node WebSocket server.
     * If not specified, the server will not be started
     */
    webSocketPort?: number
}

export interface NetworkNodeConfig {

    /** The Ethereum address of the node. */
    id?: string

    /** 
     * The number of connections the client's network node should have
     * on each stream partition. 
    */
    streamPartitionNumOfNeighbors?: number

    /**
     * The minimum number of peers in a stream partition that the client's network node
     * will attempt to propagate messages to
     */
    streamPartitionMinPropagationTargets?: number

    /**
     * The waited time for the first connection to be formed when first connecting 
     * to the network. If the connection is not formed within this time, the client's
     * network node will throw an error.
     */
    firstConnectionTimeout?: number

    /**
     * Whether to accept proxy connections. Enabling this option allows
     * this network node to act as proxy on behalf of other nodes / clients.
    */
    acceptProxyConnections?: boolean
}

export interface NetworkConfig {
    controlLayer?: ControlLayerConfig
    node?: NetworkNodeConfig
}

export interface JsonPeerDescriptor {
    id: string
    type: NodeType
    websocket?: ConnectivityMethod
    openInternet?: boolean
    region?: number
}

export interface ConnectivityMethod {
    ip: string
    port: number
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
     * Config for the decentralized network layer.
     */
    network?: NetworkConfig
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

        /**
         * Defines how strong RSA key, in bits, is used when an encryption key is
         * requested via the standard Streamr key-exchange.
         */
        rsaKeyLength?: number
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
            indexTimeout?: number
            indexPollInterval?: number
            fetchTimeout?: number
        }
        storageNode?: {
            timeout?: number
            retryInterval?: number
        }
        ensStreamCreation?: {
            timeout?: number
            retryInterval?: number
        }
    }
}

export type StrictStreamrClientConfig = MarkOptional<Required<StreamrClientConfig>, 'auth' | 'metrics'> & {
    network: Exclude<Required<StreamrClientConfig['network']>, undefined>
    contracts: Exclude<Required<StreamrClientConfig['contracts']>, undefined>
    encryption: Exclude<Required<StreamrClientConfig['encryption']>, undefined>
    cache: Exclude<Required<StreamrClientConfig['cache']>, undefined>
    /** @internal */
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
