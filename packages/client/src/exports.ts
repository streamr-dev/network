/**
 * This file captures named exports so we can manipulate them for cjs/browser builds.
 */
export { StreamrClient, SubscribeOptions, ExtraSubscribeOptions } from './StreamrClient'
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
export { StreamCreationEvent } from './registry/StreamRegistry'
export { StorageNodeAssignmentEvent } from './registry/StreamStorageRegistry'
export { StorageNodeMetadata } from './registry/StorageNodeRegistry'
export { SearchStreamsPermissionFilter, SearchStreamsOrderBy } from './registry/searchStreams'
export {
    StreamrClientConfig,
    TrackerRegistryContract,
    ChainConnectionInfo,
    EthereumNetworkConfig,
    ProviderAuthConfig,
    PrivateKeyAuthConfig,
    STREAMR_STORAGE_NODE_GERMANY,
} from './Config'
export { GroupKey as EncryptionKey } from './encryption/GroupKey'
export { UpdateEncryptionKeyOptions } from './encryption/LocalGroupKeyStore'

export { CONFIG_TEST } from './ConfigTest'
export { NetworkNodeStub } from './NetworkNodeFacade'
export { StreamDefinition } from './types'
export { formStorageNodeAssignmentStreamId } from './utils/utils'

export type { StreamID, StreamPartID, TrackerRegistryRecord } from '@streamr/protocol'
export { ProxyDirection } from '@streamr/protocol'
export type { BrandedString, EthereumAddress, LogLevel, Metric, MetricsContext, MetricsDefinition, MetricsReport } from '@streamr/utils'
export type { IceServer, Location, WebRtcPortRange } from '@streamr/network-node'

// These are currently exported because NetworkNodeStub uses methods which operate on StreamMessage.
// If we remove that semi-public class we can maybe remove these exports.
export type {
    EncryptedGroupKey,
    MessageID,
    MessageRef,
    StreamMessage,
    StreamMessageOptions,
    StreamMessageAESEncrypted
} from '@streamr/protocol'
export {
    ContentType,
    EncryptionType,
    StreamMessageType
} from '@streamr/protocol'

export type { ConnectionInfo } from '@ethersproject/web'
export type { ExternalProvider } from '@ethersproject/providers'
