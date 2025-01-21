/**
 * This file captures named exports so we can manipulate them for cjs/browser builds.
 */
export { StreamrClient, SubscribeOptions, ExtraSubscribeOptions } from './StreamrClient'
export { Stream } from './Stream'
export { StreamMetadata, parseMetadata as parseStreamMetadata, getPartitionCount as getStreamPartitionCount } from './StreamMetadata'
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
    ENVIRONMENT_IDS,
    DEFAULT_ENVIRONMENT_ID,
    EntryPointDiscovery
} from './Config'
export { GroupKey as EncryptionKey } from './encryption/GroupKey'
export { UpdateEncryptionKeyOptions } from './encryption/LocalGroupKeyStore'
export { StreamDefinition } from './types'
export { formStorageNodeAssignmentStreamId, peerDescriptorTranslator } from './utils/utils'
export { SignerWithProvider } from './Authentication'
export { convertBytesToStreamMessage, convertStreamMessageToBytes } from './protocol/oldStreamMessageBinaryUtils'

export { DhtAddress } from '@streamr/dht'
export { ProxyDirection } from '@streamr/trackerless-network'
export type { 
    StreamID,
    StreamPartID,
    BrandedString,
    EthereumAddress,
    LogLevel,
    Metric,
    MetricsContext,
    MetricsDefinition,
    MetricsReport
} from '@streamr/utils'

// These are currently exported because NetworkNodeStub uses methods which operate on StreamMessage.
// If we remove that semi-public class we can maybe remove these exports.
export type { UserID } from '@streamr/utils'
export type { EncryptedGroupKey } from './protocol/EncryptedGroupKey'
export { MessageID } from './protocol/MessageID'
export { MessageRef } from './protocol/MessageRef'
export {
    ContentType,
    EncryptionType,
    SignatureType,
    StreamMessage,
    StreamMessageAESEncrypted,
    StreamMessageOptions,
    StreamMessageType
} from './protocol/StreamMessage'

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
    undelegate,
    deploySponsorshipContract,
    setupOperatorContract,
    SetupOperatorContractOpts,
    SetupOperatorContractReturnType,
    deployOperatorContract,
    DeployOperatorContractOpts,
    sponsor,
    stake,
    unstake,
    getProvider,
    DeploySponsorshipContractOpts,
    getTestTokenContract,
    getTestAdminWallet,
    getOperatorContract
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
    setupOperatorContract,
    sponsor,
    stake,
    unstake,
    getProvider,
    deployOperatorContract,
    getTestTokenContract,
    getTestAdminWallet,
    getOperatorContract
}
export { _operatorContractUtils }
export type { SetupOperatorContractOpts, SetupOperatorContractReturnType, DeployOperatorContractOpts, DeploySponsorshipContractOpts }

export type { IceServer, PeerDescriptor, PortRange } from '@streamr/dht'
export type { AbstractSigner, Eip1193Provider, Overrides } from 'ethers'
