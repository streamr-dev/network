import 'reflect-metadata'

export { StreamrClient, type SubscribeOptions, type ExtraSubscribeOptions } from './StreamrClient'
export { Stream } from './Stream'
export { type StreamMetadata, parseMetadata as parseStreamMetadata, getPartitionCount as getStreamPartitionCount } from './StreamMetadata'
export type { Message, MessageMetadata, MessageSignatureType } from './Message'
export type { StreamrClientEvents } from './events'
export type { PublishMetadata } from './publish/Publisher'
export { Subscription, type SubscriptionEvents, } from './subscribe/Subscription'
export type { MessageStream, MessageListener } from './subscribe/MessageStream'
export type { ResendOptions, ResendLastOptions, ResendFromOptions, ResendRangeOptions, ResendRef } from './subscribe/Resends'
export {
    StreamPermission,
    type PermissionQuery,
    type UserPermissionQuery,
    type PublicPermissionQuery,
    type PermissionAssignment,
    type UserPermissionAssignment,
    type PublicPermissionAssignment
} from './permission'
export type { StreamCreationEvent } from './contracts/StreamRegistry'
export type { StorageNodeAssignmentEvent } from './contracts/StreamStorageRegistry'
export type { SponsorshipCreatedEvent } from './contracts/SponsorshipFactory'
export type { StorageNodeMetadata } from './contracts/StorageNodeRegistry'
export type { SearchStreamsPermissionFilter } from './contracts/searchStreams'
export {
    type StreamrClientConfig,
    type ConnectionInfo,
    type EthereumNetworkConfig,
    type IdentityConfig,
    type KeyPairIdentityConfig,
    type EthereumProviderIdentityConfig,
    type CustomIdentityConfig,
    STREAMR_STORAGE_NODE_GERMANY,
    STREAMR_STORAGE_NODE_ADDRESS,
    type NetworkConfig,
    type ControlLayerConfig,
    type NetworkNodeConfig,
    type NetworkPeerDescriptor,
    type ConnectivityMethod,
    NetworkNodeType,
    type StrictStreamrClientConfig,
    type EnvironmentId,
    ENVIRONMENT_IDS,
    DEFAULT_ENVIRONMENT_ID,
    type EntryPointDiscovery,
    type GapFillStrategy,
    ConfigInjectionToken,
} from './ConfigTypes'

export { DEFAULT_KEY_TYPE } from './identity/IdentityMapping'
export { GroupKey as EncryptionKey } from './encryption/GroupKey'
export type { UpdateEncryptionKeyOptions } from './encryption/LocalGroupKeyStore'
export type { StreamDefinition } from './types'
export { formStorageNodeAssignmentStreamId, peerDescriptorTranslator } from './utils/utils'
export { Identity, type SignerWithProvider } from './identity/Identity'
export { KeyPairIdentity } from './identity/KeyPairIdentity'
export { EthereumKeyPairIdentity } from './identity/EthereumKeyPairIdentity'
export { EthereumProviderIdentity } from './identity/EthereumProviderIdentity'
export { MLDSAKeyPairIdentity } from './identity/MLDSAKeyPairIdentity'
export { ECDSAKeyPairIdentity } from './identity/ECDSAKeyPairIdentity'
export { MessageSigner } from './signature/MessageSigner'
export { RpcProviderSource } from './RpcProviderSource'

export { convertBytesToStreamMessage, convertStreamMessageToBytes } from './protocol/oldStreamMessageBinaryUtils'

export type { DhtAddress } from '@streamr/dht'
export { ContentType, EncryptedGroupKey, EncryptionType,
    ProxyDirection, SignatureType } from '@streamr/trackerless-network'
export type { StreamPartDeliveryOptions } from '@streamr/trackerless-network'
export type { 
    StreamID,
    StreamPartID,
    BrandedString,
    EthereumAddress,
    KeyType,
    LogLevel,
    Metric,
    MetricsContext,
    MetricsDefinition,
    MetricsReport
} from '@streamr/utils'

// These are currently exported because NetworkNodeStub uses methods which operate on StreamMessage.
// If we remove that semi-public class we can maybe remove these exports.
export type { UserID } from '@streamr/utils'
export { MessageID } from './protocol/MessageID'
export { MessageRef } from './protocol/MessageRef'
export {
    StreamMessage,
    type StreamMessageAESEncrypted,
    type StreamMessageOptions,
    StreamMessageType
} from './protocol/StreamMessage'

// These are exported for the internal Operator class
export {
    Operator,
    type OperatorEvents,
    type StakeEvent,
    type ReviewRequestEvent,
    type GetOperatorSponsorshipsResult,
    type Flag
} from './contracts/Operator'
import {
    delegate,
    undelegate,
    deploySponsorshipContract,
    deployOperatorContract,
    DeployOperatorContractOpts,
    sponsor,
    stake,
    unstake,
    DeploySponsorshipContractOpts,
    getOperatorContract,
    TransactionOpts
} from './contracts/operatorContractUtils'

/**
 * @deprecated
 * @hidden
 */
// eslint-disable-next-line no-underscore-dangle
const _operatorContractUtils = {
    delegate,
    undelegate,
    deploySponsorshipContract,
    sponsor,
    stake,
    unstake,
    deployOperatorContract,
    getOperatorContract,
}
export { _operatorContractUtils }
export type { DeployOperatorContractOpts, DeploySponsorshipContractOpts, TransactionOpts }

export type { IceServer, PeerDescriptor, PortRange } from '@streamr/dht'
export type { AbstractSigner, Eip1193Provider, Overrides } from 'ethers'
