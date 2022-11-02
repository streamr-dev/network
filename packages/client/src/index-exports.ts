/**
 * This file captures named exports so we can manipulate them for cjs/browser builds.
 */
export * from './StreamrClient'
export * from './Stream'
export { Message } from './Message'
export { DecryptError } from './encryption/EncryptionUtil'
export { StreamrClientEvents } from './events'
export { MessageMetadata } from './publish/Publisher'
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
    TrackerRegistrySmartContract,
    NetworkConfig,
    CacheConfig,
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
export { GroupKey as EncryptionKey, GroupKeyId as EncryptionKeyId } from './encryption/GroupKey'
export { UpdateEncryptionKeyOptions } from './encryption/GroupKeyStore'

export { ConfigTest } from './ConfigTest'
export { NetworkNodeStub } from './NetworkNodeFacade'
export { NotFoundError, ErrorCode } from './HttpUtil'
export * from './types'
export { formStorageNodeAssignmentStreamId } from './utils/utils'

export { StreamPartID } from 'streamr-client-protocol'

export { BigNumber } from '@ethersproject/bignumber'
export type { ConnectionInfo } from '@ethersproject/web'
export { Contract } from '@ethersproject/contracts'
export type { BytesLike, Bytes } from '@ethersproject/bytes'
export type { ContractReceipt, ContractTransaction } from '@ethersproject/contracts'
export type { ExternalProvider } from '@ethersproject/providers'
