/**
 * This file captures named exports so we can manipulate them for cjs/browser builds.
 */
export * from './StreamrClient'
export * from './Stream'
export * from './encryption/Encryption'
export { Subscription, SubscriptionOnMessage } from './subscribe/Subscription'
export { MessageStreamOnMessage } from './subscribe/MessageStream'
export { ResendSubscription } from './subscribe/ResendSubscription'
export { ResendOptions, ResendLastOptions, ResendFromOptions, ResendRangeOptions } from './subscribe/Resends'
export {
    StreamPermission,
    PermissionQuery,
    UserPermissionQuery,
    PublicPermissionQuery,
    PermissionAssignment,
    UserPermissionAssignment,
    PublicPermissionAssignment
} from './permission'
export * from './LoginEndpoints'
export * from './StreamEndpoints'
export { StorageNodeAssignmentEvent } from './StorageNodeRegistry'
export { SearchStreamsPermissionFilter } from './searchStreams'
export { getTrackerRegistryFromContract } from './getTrackerRegistryFromContract'
export type {
    CacheConfig,
    SubscribeConfig,
    ConnectionConfig,
    DataUnionConfig,
    TrackerRegistrySmartContract,
    NetworkConfig,
    DebugConfig,
    StrictStreamrClientConfig,
    StreamrClientConfig as StreamrClientOptions
} from './ConfigBase'
export {
    STREAMR_STORAGE_NODE_GERMANY,
    STREAM_CLIENT_DEFAULTS,
    validateConfig
} from './ConfigBase'

export { ConfigTest } from './ConfigTest'
import { NetworkNodeStub } from './BrubeckNode'

export { NetworkNodeStub }
export * from './dataunion/DataUnion'
export * from './authFetch'
export * from './types'

export { StreamPartID } from 'streamr-client-protocol'

// TODO should export these to support StreamMessageAsObject:
// export {
//   StreamMessageType, ContentType, EncryptionType, SignatureType
// } from 'streamr-client-protocol/dist/src/protocol/message_layer/StreamMessage'
export { BigNumber } from '@ethersproject/bignumber'
export type { ConnectionInfo } from '@ethersproject/web'
export { Contract } from '@ethersproject/contracts'
export type { BytesLike, Bytes } from '@ethersproject/bytes'
export type { ContractReceipt, ContractTransaction } from '@ethersproject/contracts'
