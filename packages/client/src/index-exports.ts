/**
 * This file captures named exports so we can manipulate them for cjs/browser builds.
 */
export * from './StreamrClient'
export * from './Config'
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
import ConfigTest from './ConfigTest'
import { validateConfig } from './ConfigBase'
import { NetworkNodeStub } from './BrubeckNode'

export { ConfigTest, validateConfig, NetworkNodeStub }
export * from './dataunion/DataUnion'
export { NotFoundError, ErrorCode } from './authFetch'
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