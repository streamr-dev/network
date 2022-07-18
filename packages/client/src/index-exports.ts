/**
 * This file captures named exports so we can manipulate them for cjs/browser builds.
 */
export * from './StreamrClient'
export * from './Stream'
export { UnableToDecryptError } from './encryption/EncryptionUtil'
export { StreamrClientEvents } from './events'
export { MessageMetadata } from './publish/PublishPipeline'
export { Subscription, SubscriptionOnMessage } from './subscribe/Subscription'
export { MessageStreamOnMessage } from './subscribe/MessageStream'
export type { MessageStream } from './subscribe/MessageStream'
export { ResendSubscription, ResendSubscriptionEvents } from './subscribe/ResendSubscription'
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
    UnauthenticatedAuthConfig,
    ProviderAuthConfig,
    ProviderConfig,
    PrivateKeyAuthConfig
} from './Authentication'
export {
    EthereumConfig,
    ChainConnectionInfo,
    EthereumNetworkConfig,
} from './Ethereum'
export { EncryptionConfig, GroupKeyId as EncryptionKeyId } from './encryption/KeyExchangeStream'
export { GroupKey as EncryptionKey } from './encryption/GroupKey'
export { UpdateEncryptionKeyOptions } from './encryption/GroupKeyStoreFactory'

export { ConfigTest } from './ConfigTest'
export { NetworkNodeStub } from './BrubeckNode'
export { NotFoundError, ErrorCode } from './HttpUtil'
export * from './types'
export { formStorageNodeAssignmentStreamId } from './utils/utils'

export { EthereumAddress, StreamPartID } from 'streamr-client-protocol'

export { BigNumber } from '@ethersproject/bignumber'
export type { ConnectionInfo } from '@ethersproject/web'
export { Contract } from '@ethersproject/contracts'
export type { BytesLike, Bytes } from '@ethersproject/bytes'
export type { ContractReceipt, ContractTransaction } from '@ethersproject/contracts'
export type { ExternalProvider } from '@ethersproject/providers'
