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
export { GapFillStrategy } from './subscribe/ordering/GapFiller'
export {
    StreamPermission,
    PermissionQuery,
    UserPermissionQuery,
    PublicPermissionQuery,
    PermissionAssignment,
    UserPermissionAssignment,
    PublicPermissionAssignment
} from './permission'
export { StreamCreationEvent } from './contracts/StreamRegistry'
export { StorageNodeAssignmentEvent } from './contracts/StreamStorageRegistry'
export { StorageNodeMetadata } from './contracts/StorageNodeRegistry'
export { SearchStreamsPermissionFilter, SearchStreamsOrderBy } from './contracts/searchStreams'
export {
    StreamrClientConfig,
    ConnectionInfo,
    EthereumNetworkConfig,
    ProviderAuthConfig,
    PrivateKeyAuthConfig,
    STREAMR_STORAGE_NODE_GERMANY,
    NetworkConfig,
    ControlLayerConfig,
    NetworkNodeConfig,
    NetworkPeerDescriptor,
    ConnectivityMethod,
    NetworkNodeType,
    StrictStreamrClientConfig,
    EnvironmentId,
    EntryPointDiscovery
} from './Config'
export { GroupKey as EncryptionKey } from './encryption/GroupKey'
export { UpdateEncryptionKeyOptions } from './encryption/LocalGroupKeyStore'
export { CONFIG_TEST } from './ConfigTest'
export { StreamDefinition } from './types'
export { formStorageNodeAssignmentStreamId } from './utils/utils'
export { SignerWithProvider } from './Authentication'
export { convertBytesToStreamMessage, convertStreamMessageToBytes } from './protocol/oldStreamMessageBinaryUtils'

export type { StreamID, StreamPartID } from '@streamr/protocol'
export { DhtAddress } from '@streamr/dht'
export { ProxyDirection } from '@streamr/trackerless-network'
export type { BrandedString, EthereumAddress, LogLevel, Metric, MetricsContext, MetricsDefinition, MetricsReport } from '@streamr/utils'

// These are currently exported because NetworkNodeStub uses methods which operate on StreamMessage.
// If we remove that semi-public class we can maybe remove these exports.
export type { EncryptedGroupKey } from './protocol/EncryptedGroupKey' 
export type { MessageID } from './protocol/MessageID'
export type { MessageRef } from './protocol/MessageRef'
export type { StreamMessage, StreamMessageOptions, StreamMessageAESEncrypted } from './protocol/StreamMessage'
export { ContentType, EncryptionType, StreamMessageType } from './protocol/StreamMessage'

// These are exported for the internal Operator class
export {
    Operator,
    OperatorEvents,
    StakeEvent,
    ReviewRequestEvent,
    GetOperatorSponsorshipsResult,
    Flag
} from './contracts/Operator'
import {
    delegate,
    deploySponsorshipContract,
    setupOperatorContract,
    SetupOperatorContractOpts,
    SetupOperatorContractReturnType,
    deployOperatorContract,
    DeployOperatorContractOpts,
    sponsor,
    stake,
    getProvider,
    generateWalletWithGasAndTokens,
    DeploySponsorshipContractOpts,
} from './contracts/operatorContractUtils'
/**
 * @deprecated
 * @hidden
 */
// eslint-disable-next-line no-underscore-dangle
const _operatorContractUtils = {
    delegate,
    deploySponsorshipContract,
    setupOperatorContract,
    sponsor,
    stake,
    getProvider,
    generateWalletWithGasAndTokens,
    deployOperatorContract
}
// eslint-disable-next-line no-underscore-dangle
export { _operatorContractUtils }
export type { SetupOperatorContractOpts, SetupOperatorContractReturnType, DeployOperatorContractOpts, DeploySponsorshipContractOpts }

export type { IceServer, PeerDescriptor, PortRange } from '@streamr/dht'
export type { Signer, Eip1193Provider, Overrides } from 'ethers'
