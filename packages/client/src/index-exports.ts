/**
 * This file captures named exports so we can manipulate them for cjs/browser builds.
 */
export { StreamrClient } from './StreamrClient'
export { Stream, StreamMetadata, Field, VALID_FIELD_TYPES } from './Stream'
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
    TrackerRegistryContract,
    ChainConnectionInfo,
    EthereumNetworkConfig,
    ProviderAuthConfig,
    PrivateKeyAuthConfig,
    STREAMR_STORAGE_NODE_GERMANY,
    STREAM_CLIENT_DEFAULTS,
    validateConfig
} from './Config'
export { GroupKey as EncryptionKey } from './encryption/GroupKey'
export { UpdateEncryptionKeyOptions } from './encryption/GroupKeyStore'

export { ConfigTest } from './ConfigTest'
export { NetworkNodeStub } from './NetworkNodeFacade'
export { StreamDefinition, Without, XOR } from './types'
export { formStorageNodeAssignmentStreamId } from './utils/utils'

export type { ProxyDirection, StreamID, StreamPartID, TrackerRegistryRecord } from '@streamr/protocol'
export type { BrandedString, EthereumAddress, LogLevel, Metric, MetricsContext, MetricsDefinition, MetricsReport } from '@streamr/utils'
export type { IceServer, NetworkNodeOptions as NetworkNodeConfig, Location } from '@streamr/network-node'

// These are currently exported because NetworkNodeStub uses methods which operate on StreamMessage.
// If we remove that semi-public class we can maybe remove these exports.
export type {
    ContentType,
    EncryptedGroupKey,
    EncryptionType,
    MessageID,
    MessageRef,
    StreamMessage,
    StreamMessageOptions,
    StreamMessageType
} from '@streamr/protocol'

export type { BigNumber } from '@ethersproject/bignumber'
export type { ConnectionInfo } from '@ethersproject/web'
export type { ExternalProvider } from '@ethersproject/providers'
