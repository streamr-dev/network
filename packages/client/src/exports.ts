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
export { NetworkNodeStub } from './NetworkNodeFacade'
export { StreamDefinition } from './types'
export { formStorageNodeAssignmentStreamId } from './utils/utils'
export { SignerWithProvider } from './Authentication'

export type { StreamID, StreamPartID } from '@streamr/protocol'
export { DhtAddress } from '@streamr/dht'
export { ProxyDirection } from '@streamr/trackerless-network'
export type { BrandedString, EthereumAddress, LogLevel, Metric, MetricsContext, MetricsDefinition, MetricsReport } from '@streamr/utils'

// These are currently exported because NetworkNodeStub uses methods which operate on StreamMessage.
// If we remove that semi-public class we can maybe remove these exports.
export type {
    EncryptedGroupKey,
    MessageID,
    MessageRef,
    StreamMessage,
    StreamMessageOptions,
    StreamMessageAESEncrypted
} from '@streamr/protocol'
export {
    ContentType,
    EncryptionType,
    StreamMessageType
} from '@streamr/protocol'

// These are exported for the internal OperatorContractFacade class
// TODO could we hide the class and the getOperatorContractFacade from API docs?
export { OperatorContractFacade } from './contracts/OperatorContractFacade'
// TODO maybe should use more specific name for these exports
export {
    ParseError,
    parsePartitionFromReviewRequestMetadata, ReviewRequestListener, SponsorshipResult,
    StakeEvent, ReviewRequestEvent
} from './contracts/OperatorContractFacade'
// TODO maybe should use more specific name for these exports (some utils may be for testing only), maybe move
// into OperatorContractFacade or new SponsorshitContractFacade?
export {
    createTheGraphClient,
    delegate,
    deploySponsorshipContract,
    getAdminWallet,
    setupOperatorContract,
    SetupOperatorContractReturnType,
    sponsor,
    stake,
    getProvider,
    generateWalletWithGasAndTokens,
    SetupOperatorContractOpts,
    deployOperatorContract,
} from './contracts/operatorContractUtils'

export type { IceServer, PeerDescriptor, PortRange } from '@streamr/dht'
export type { Signer, Eip1193Provider, Overrides } from 'ethers'
