import './setupTsyringe'

import type { Overrides, Eip1193Provider } from 'ethers'
import type { DeepRequired, MarkOptional } from 'ts-essentials'
import type { HexString, LogLevel, KeyType } from '@streamr/utils'
import type { IceServer, PortRange, TlsCertificate } from '@streamr/dht'
import type { Identity } from './identity/Identity'

/**
 * For passing in an Ethereum provider (= wallet) for signing. Any {@link https://eips.ethereum.org/EIPS/eip-1193 EIP-1193}
 * compatible provider will do. The {@link https://docs.ethers.org/v6/api/providers/#Eip1193Provider Eip1193Provider} type
 * definition used here is from the `ethers` library.
 */
export interface EthereumProviderIdentityConfig {
    ethereum: Eip1193Provider
}
/**
 * For configuring identities based on a cryptographic key / key pair
 */
export interface KeyPairIdentityConfig {
    publicKey?: string
    privateKey: string
    keyType?: KeyType
}

/**
 * For passing in an Identity implementation
 */
export interface CustomIdentityConfig {
    identity: Identity
}

export type IdentityConfig = KeyPairIdentityConfig | EthereumProviderIdentityConfig | CustomIdentityConfig

export interface ControlLayerConfig {

    /**
     * The list of entry point PeerDescriptors used to join the Streamr Network.
     */
    entryPoints?: NetworkPeerDescriptor[]

    /**
     * The maximum number of connections before unwanted connections are clean up.
     * This is a soft limit, meaning that the number of connections may exceed the count temporarily.
     * Locked connections such as the ones used for stream operations are not counted towards this limit.
    */
    maxConnections?: number

    /**
     * If true, an attempt is made to discover additional network entrypoint nodes
     * by querying them from The Graph. If false, only the nodes
     * listed in entryPoints are used.
     */
    entryPointDiscovery?: EntryPointDiscovery

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
     * Sets the low-water mark used by send buffers of WebRTC connections.
    */
    webrtcDatachannelBufferThresholdLow?: number

    /**
     * Sets the high-water mark used by send buffers of WebRTC connections.
    */
    webrtcDatachannelBufferThresholdHigh?: number

    /**
     * Defines a custom UDP port range to be used for WebRTC connections.
     * This port range should not be restricted by enclosing firewalls
     * or virtual private cloud configurations. NodeJS only.
     */
    webrtcPortRange?: PortRange

    /**
     * The maximum outgoing message size (in bytes) accepted by connections.
     * Messages exceeding the maximum size are simply discarded.
     */
    maxMessageSize?: number

    /**
     * Contains connectivity information to the client's Network Node, used in the network layer.
     * Can be used in cases where the client's public IP address is known before
     * starting the network node. If not specified, the PeerDescriptor will be auto-generated.
    */
    peerDescriptor?: NetworkPeerDescriptor

    /**
     * The port range used to find a free port for the client's network layer WebSocket server.
     * If set to `null`, a server will not be started.
     * The server is used by the network layer to accept incoming connections
     * over the public internet to improve the network node's connectivity.
     */
    websocketPortRange?: PortRange | null

    /**
     * The host name or IP address of the WebSocket server used to connect to it over the internet.
     * If not specified, the host name will be auto-detected.
     * Can be useful in situations where the host is running behind a reverse-proxy or load balancer.
     */
    websocketHost?: string

    /**
     * TLS configuration for the WebSocket server
     */
    tlsCertificate?: TlsCertificate

    /*
     * Used to assign a custom external IPv4 address for the node.
     * Useful in cases where the node has a public IP address but
     * the hosts network interface does not know of it.
     *
     * Works only if the Full Cone NAT that the node is behind preserves local
     * port mappings on the public side.
    */
    externalIp?: string

    /**
     * The maximum time to wait when establishing connectivity to the control layer. If the connection
     * is not formed within this time, the client's network node will throw an error.
     */
    networkConnectivityTimeout?: number

    /**
     * URL of the autocertifier service used to obtain TLS certificates and subdomain names for the WS server.
     */
    autoCertifierUrl?: string

    /**
     * File path to the autocertified subdomain file. The file contains the autocertified subdomain name
     * and it's TLS certificate.
     */
    autoCertifierConfigFile?: string

    /**
     * If the node is running a WS server, this option can be used to disable TLS autocertification to
     * run the server without TLS. This will speed up the starting time of the network node
     * (especially when starting the node for the first time on a new machine).
     */
    websocketServerEnableTls?: boolean

    /**
     * Define a geo ip database folder path to be used by the network node. When left undefined
     * geoip functionality is disabled.
     */
    geoIpDatabaseFolder?: string
}

export interface NetworkNodeConfig {

    /**
     * The number of connections the client's network node should have
     * on each stream partition.
    */
    streamPartitionNeighborTargetCount?: number

    /**
     * The minimum number of peers in a stream partition that the client's network node
     * will attempt to propagate messages to
     */
    streamPartitionMinPropagationTargets?: number

    /**
     * The maximum number of messages that can be buffered in the propagation buffer.
     */
    streamPartitionMaxPropagationBufferSize?: number

    /**
     * Whether to buffer while connecting in the content delivery layer.
     */
    contentDeliveryBufferWhileConnecting?: boolean

    /**
     * Whether to accept proxy connections. Enabling this option allows
     * this network node to act as proxy on behalf of other nodes / clients.
     * When enabling this option, a WebSocket server should be configured for the client
     * and the node needs to be in the open internet. The server can be started by setting
     * the websocketPort configuration to a free port in the network control layer configuration.
     */
    acceptProxyConnections?: boolean
}

export interface NetworkConfig {
    controlLayer?: ControlLayerConfig
    node?: NetworkNodeConfig
}

export enum NetworkNodeType {
    NODEJS = 'nodejs',
    BROWSER = 'browser'
}

export interface NetworkPeerDescriptor {
    nodeId: string
    type?: NetworkNodeType
    websocket?: ConnectivityMethod
    region?: number
}

export interface EntryPointDiscovery {
    enabled?: boolean
    maxEntryPoints?: number
    maxQueryResults?: number
    maxHeartbeatAgeHours?: number
}

export interface ConnectivityMethod {
    host: string
    port: number
    tls: boolean
}

export interface ConnectionInfo {
    url: string
}

// these should come from ETH-184 config package when it's ready
export interface EthereumNetworkConfig {
    chainId: number
    overrides?: Overrides
    highGasPriceStrategy?: boolean
}

// a subset of environment ids which are available in @streamr/config
// - do not include legacy configs, which no longer work, e.g. "dev0"
// - and no need to include configs, which users won't use in practice
// - note that there is no special handling for empty arrays in the applyConfig and therefore
//   empty arrays will be applied as-is: we may want to remove "enthereum.rpcEndpoints" key
//   from @streamr/config as the intention is to use system-defaults (e.g. Metamask defaults)
//   in Ethereum network
export const ENVIRONMENT_IDS = ['polygon', 'polygonAmoy', 'peaq', 'iotex', 'dev2'] as const
export type EnvironmentId = typeof ENVIRONMENT_IDS[number]
export const DEFAULT_ENVIRONMENT_ID: EnvironmentId = 'polygon'

export type GapFillStrategy = 'light' | 'full'

/**
 * @category Important
 */
export interface StreamrClientConfig {

    environment?: EnvironmentId

    /** Custom human-readable debug id for client. Used in logging. */
    id?: string

    /**
     * Override the default logging level.
     */
    logLevel?: LogLevel

    /**
    * The cryptographic identity to be used by the client. The chosen identity
    * also determines the type of signatures on published messages.
    */
    auth?: IdentityConfig

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
     * When gap filling is enabled, this setting controls whether to enable a
     * lighter (default) or a full gap fill strategy.
     *
     * While filling a gap, new gaps may emerge further along the message
     * chain. After a gap has been filled, the gap filling mechanism will
     * attend to the next gap until that has been resolved and so forth.
     *
     * This is great in theory, but sometimes in practice, especially in
     * streams with heavy traffic, the gap filling mechanism may never catch
     * up leading to permanently increased latency, and even dropped messages
     * (due to buffer overflows) further exacerbating the presence of gaps.
     *
     * With `light` strategy, when a gap cannot be successfully filled and
     * must be dropped, all subsequent accumulated gaps will be dropped as
     * well. This improves the ability to stay up-to-date at the cost of
     * potentially missing messages. With `full` strategy the subsequent gaps
     * will not be dropped.
     */
    gapFillStrategy?: GapFillStrategy

    /**
     * Controls how messages encryption and decryption should be handled and
     * how encryption keys should be exchanged.
     */
    encryption?: {
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

        /**
         * Default: false.
         *
         * The default behavior on subscribers is to request key exchange using ML-KEM if a quantum secure
         * identity key pair is configured, otherwise RSA.
         *
         * The default behavior on publishers is to do key exchange using whichever method requested by subscribers.
         *
         * If set to true, subscribers will always request using ML-KEM, and publishers will reject key requests that use RSA.
         */
        requireQuantumResistantKeyExchange?: boolean

        /**
         * Default: false. If true, configuring a non-quantum-resistant identity key pair will produce an error,
         * and subscribed messages will only be accepted if they are signed using a quantum resistant algorithm.
         */
        requireQuantumResistantSignatures?: boolean

        /**
         * Default: false. If true on subscribers, data encrypted with non-quantum-resistant methods will be rejected.
         * If true on publishers, only data encrypted with quantum resistant methods can be published.
         * Note that subscribers will still accept unencrypted (public) data despite this setting.
         */
        requireQuantumResistantEncryption?: boolean

        /**
         * If this is defined only these encryption keys will be used. This will disable the Streamr key-exchange.
         */
        keys?: Record<string, { id: string, data: HexString }>
    }

    contracts?: {
        streamRegistryChainAddress?: HexString
        streamStorageRegistryChainAddress?: HexString
        storageNodeRegistryChainAddress?: HexString
        sponsorshipFactoryChainAddress?: HexString
        // most of the above should go into ethereumNetworks configs once ETH-184 is ready
        ethereumNetwork?: EthereumNetworkConfig
        rpcs?: ConnectionInfo[]
        rpcQuorum?: number
        /** Some TheGraph instance, that indexes the streamr registries */
        theGraphUrl?: string
        maxConcurrentCalls?: number
        pollInterval?: number
    }

    validation?: {
        permissions?: boolean
        partitions?: boolean
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
        jsonRpcTimeout?: number
    }
}

export type StrictStreamrClientConfig = MarkOptional<Required<StreamrClientConfig>, 'auth' | 'metrics'> & {
    network: Exclude<Required<StreamrClientConfig['network']>, undefined>
    contracts: Exclude<Required<StreamrClientConfig['contracts']>, undefined>
    encryption: Exclude<Required<StreamrClientConfig['encryption']>, undefined>
    validation: Exclude<Required<StreamrClientConfig['validation']>, undefined>
    cache: Exclude<Required<StreamrClientConfig['cache']>, undefined>
    /** @internal */
    _timeouts: Exclude<DeepRequired<StreamrClientConfig['_timeouts']>, undefined>
}

/**
 * @deprecated use {@link STREAMR_STORAGE_NODE_ADDRESS} instead
 */
export const STREAMR_STORAGE_NODE_GERMANY = '0x31546eEA76F2B2b3C5cC06B1c93601dc35c9D916'

export const STREAMR_STORAGE_NODE_ADDRESS = '0x9dc08ff97f5c156181ec6a0b13fc3946454e529a' as HexString

export const ConfigInjectionToken = Symbol('Config')
