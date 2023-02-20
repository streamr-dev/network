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
import { StrictStreamrClientConfig as _StrictStreamrClientConfig } from './Config'
/** @deprecated */
type StrictStreamrClientConfig = _StrictStreamrClientConfig
export { StrictStreamrClientConfig }
export {
    StreamrClientConfig,
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

export { CONFIG_TEST, ConfigTest } from './ConfigTest'
export { NetworkNodeStub } from './NetworkNodeFacade'
export { StreamDefinition } from './types'
export { formStorageNodeAssignmentStreamId } from './utils/utils'

export type { StreamID, StreamPartID, TrackerRegistryRecord } from '@streamr/protocol'
export { ProxyDirection } from '@streamr/protocol'
export type { BrandedString, EthereumAddress, LogLevel, Metric, MetricsContext, MetricsDefinition, MetricsReport } from '@streamr/utils'
export type { IceServer, Location } from '@streamr/network-node'
import type { NetworkNodeOptions } from '@streamr/network-node'
/** @deprecated */
type NetworkNodeConfig = NetworkNodeOptions
export { NetworkNodeConfig }

// These are currently exported because NetworkNodeStub uses methods which operate on StreamMessage.
// If we remove that semi-public class we can maybe remove these exports.
export type {
    EncryptedGroupKey,
    MessageID,
    MessageRef,
    StreamMessage,
    StreamMessageOptions,
} from '@streamr/protocol'
export {
    ContentType,
    EncryptionType,
    StreamMessageType
} from '@streamr/protocol'

export type { ConnectionInfo } from '@ethersproject/web'
export type { ExternalProvider } from '@ethersproject/providers'
