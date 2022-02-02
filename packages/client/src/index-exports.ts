/**
 * This file captures named exports so we can manipulate them for cjs/browser builds.
 */
export * from './StreamrClient'
export * from './Config'
export * from './Stream'
export * from './encryption/Encryption'
export * from './Subscriber'
export * from './LoginEndpoints'
export * from './StreamEndpoints'
export { StorageNodeAssignmentEvent } from './StorageNodeRegistry'
export { SearchStreamsPermissionFilter } from './searchStreams'
export { getTrackerRegistryFromContract } from './getTrackerRegistryFromContract'
import ConfigTest from './ConfigTest'
import validateConfig from './ConfigBase'

export { ConfigTest, validateConfig }
export * from './dataunion/DataUnion'
export * from './authFetch'
export * from './types'

// TODO should export these to support StreamMessageAsObject:
// export {
//   StreamMessageType, ContentType, EncryptionType, SignatureType
// } from 'streamr-client-protocol/dist/src/protocol/message_layer/StreamMessage'
export { BigNumber } from '@ethersproject/bignumber'
export type { ConnectionInfo } from '@ethersproject/web'
export { Contract } from '@ethersproject/contracts'
export type { BytesLike, Bytes } from '@ethersproject/bytes'
export type { ContractReceipt, ContractTransaction } from '@ethersproject/contracts'
