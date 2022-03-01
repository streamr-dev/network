/**
 * This file captures named exports so we can manipulate them for cjs/browser builds.
 */
export * from './StreamrClient'
export * from './Stream'
export * from './encryption/Encryption'
export { Subscription, SubscriptionOnMessage } from './subscribe/Subscription'
export { MessageStreamOnMessage } from './subscribe/MessageStream'
export type { MessageStream } from './subscribe/MessageStream'
export { ResendSubscription } from './subscribe/ResendSubscription'
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
export { UserDetails } from './LoginEndpoints'
export { StreamValidationInfo, StreamMessageAsObject } from './StreamEndpoints'
export { StorageNodeAssignmentEvent } from './StorageNodeRegistry'
export { SearchStreamsPermissionFilter } from './searchStreams'
export {
    StreamrClientConfig,
    StrictStreamrClientConfig,
    SubscribeConfig,
    ConnectionConfig,
    DataUnionConfig,
    TrackerRegistrySmartContract,
    NetworkConfig,
    DebugConfig,
    CacheConfig,
    STREAMR_STORAGE_NODE_GERMANY,
    STREAM_CLIENT_DEFAULTS,
    validateConfig
} from './Config'
export {
    AuthConfig,
    AuthenticatedConfig,
    EthereumConfig,
    ChainConnectionInfo,
    EthereumNetworkConfig,
    UnauthenticatedAuthConfig,
    ProviderAuthConfig,
    ProviderConfig,
    PrivateKeyAuthConfig,
    SessionTokenAuthConfig,
    XOR,
    Without
} from './Ethereum'
export { EncryptionConfig, GroupKeysSerialized, GroupKeyId } from './encryption/KeyExchangeUtils'
export { GroupKey, GroupKeyish, GroupKeyObject } from './encryption/Encryption'

export { ConfigTest } from './ConfigTest'
export { NetworkNodeStub } from './BrubeckNode'
export * from './dataunion/DataUnion'
export { NotFoundError, ErrorCode } from './authFetch'
export { SignalListener } from './utils/Signal'
export * from './types'

export { EthereumAddress, StreamPartID } from 'streamr-client-protocol'

// TODO should export these to support StreamMessageAsObject:
// export {
//   StreamMessageType, ContentType, EncryptionType, SignatureType
// } from 'streamr-client-protocol/dist/src/protocol/message_layer/StreamMessage'
export { BigNumber } from '@ethersproject/bignumber'
export type { ConnectionInfo } from '@ethersproject/web'
export { Contract } from '@ethersproject/contracts'
export type { BytesLike, Bytes } from '@ethersproject/bytes'
export type { ContractReceipt, ContractTransaction } from '@ethersproject/contracts'
export type { ExternalProvider } from '@ethersproject/providers'
