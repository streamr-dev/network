/**
 * This file captures named exports so we can manipulate them for cjs/browser builds.
 */
export * from './StreamrClient'
export * from './Stream'
export { Message, MessageMetadata } from './Message'
export { StreamrClientEvents } from './events'
export { PublishMetadata } from './publish/Publisher'
export { Subscription, SubscriptionEvents, } from './subscribe/Subscription'
export type { MessageStream, MessageListener } from './subscribe/MessageStream'
export { ResendOptions, ResendLastOptions, ResendFromOptions, ResendRangeOptions, ResendRef } from './subscribe/Resends'
export {
    StreamPermission,
    PermissionQuery,
    UserPermissionQuery,
    PublicPermissionQuery,
    PermissionAssignment,
    UserPermissionAssignment,
    PublicPermissionAssignment
} from './permission'
export { StorageNodeAssignmentEvent } from './registry/StreamStorageRegistry'
export { StorageNodeMetadata } from './registry/StorageNodeRegistry'
export { SearchStreamsPermissionFilter } from './registry/searchStreams'
export {
    StreamrClientConfig,
    StrictStreamrClientConfig,
    SubscribeConfig,
    ConnectionConfig,
    TrackerRegistryContract,
    NetworkConfig,
    DecryptionConfig,
    CacheConfig,
    MetricsConfig,
    MetricsPeriodConfig,
    STREAMR_STORAGE_NODE_GERMANY,
    STREAM_CLIENT_DEFAULTS,
    validateConfig
} from './Config'
export {
    AuthConfig,
    ProviderAuthConfig,
    ProviderConfig,
    PrivateKeyAuthConfig
} from './Authentication'
export {
    EthereumConfig,
    ChainConnectionInfo,
    EthereumNetworkConfig,
} from './Ethereum'
export { GroupKey as EncryptionKey } from './encryption/GroupKey'
export { UpdateEncryptionKeyOptions } from './encryption/GroupKeyStore'

export { ConfigTest } from './ConfigTest'
export { NetworkNodeStub } from './NetworkNodeFacade'
export * from './types'
export { formStorageNodeAssignmentStreamId } from './utils/utils'

export type { ProxyDirection, StreamID, StreamPartID, TrackerRegistryRecord } from 'streamr-client-protocol'
export type { BrandedString, EthereumAddress, LogLevel, Metric, MetricsContext, MetricsDefinition, MetricsReport } from '@streamr/utils'
export type { IceServer, NetworkNodeOptions as NetworkNodeConfig, Location } from 'streamr-network'

export { BigNumber } from '@ethersproject/bignumber'
export type { ConnectionInfo } from '@ethersproject/web'
export { Contract } from '@ethersproject/contracts'
export type { BytesLike, Bytes } from '@ethersproject/bytes'
export type { ContractReceipt, ContractTransaction } from '@ethersproject/contracts'
export type { ExternalProvider } from '@ethersproject/providers'
