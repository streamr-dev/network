/**
 * Streamr JavaScript Client
 *
 * @packageDocumentation
 * @module StreamrClient
 */

import { StreamrClient } from './StreamrClient'

export * from './StreamrClient'
export * from './Config'
export * from './Stream'
export * from './encryption/Encryption'
export * from './StorageNode'
export * from './Subscriber'
export * from './LoginEndpoints'
export * from './StreamEndpoints'
import ConfigTest from './ConfigTest'

export { ConfigTest }
// export * from './dataunion/DataUnion'
export * from './authFetch'
export * from './types'

// TODO should export these to support StreamMessageAsObject:
// export {
//   StreamMessageType, ContentType, EncryptionType, SignatureType
// } from 'streamr-client-protocol/dist/src/protocol/message_layer/StreamMessage'
export { BigNumber } from '@ethersproject/bignumber'
export { ConnectionInfo } from '@ethersproject/web'
export { Contract } from '@ethersproject/contracts'
export { BytesLike, Bytes } from '@ethersproject/bytes'
export { ContractReceipt, ContractTransaction } from '@ethersproject/contracts'

export default StreamrClient

// Note awful export wrappers in index-commonjs.js & index-esm.mjs
