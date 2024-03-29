import {
    ContentType,
    EncryptionType,
    GroupKeyRequest as OldGroupKeyRequest,
    GroupKeyResponse as OldGroupKeyResponse,
    MessageID,
    SignatureType,
    StreamMessage,
    StreamMessageType,
    StreamPartID,
    StreamPartIDUtils
} from '@streamr/protocol'
import { convertBytesToGroupKeyResponse, convertGroupKeyRequestToBytes } from '@streamr/trackerless-network'
import { EthereumAddress, Logger } from '@streamr/utils'
import { inject, Lifecycle, scoped } from 'tsyringe'
import { v4 as uuidv4 } from 'uuid'
import { Authentication, AuthenticationInjectionToken } from '../Authentication'
import { ConfigInjectionToken, StrictStreamrClientConfig } from '../Config'
import { NetworkNodeFacade } from '../NetworkNodeFacade'
import { createSignedMessage } from '../publish/MessageFactory'
import { createRandomMsgChainId } from '../publish/messageChain'
import { StreamRegistry } from '../contracts/StreamRegistry'
import { LoggerFactory } from '../utils/LoggerFactory'
import { pOnce, withThrottling } from '../utils/promises'
import { MaxSizedSet } from '../utils/utils'
import { validateStreamMessage } from '../utils/validateStreamMessage'
import { GroupKey } from './GroupKey'
import { LocalGroupKeyStore } from './LocalGroupKeyStore'
import { RSAKeyPair } from './RSAKeyPair'
import { ERC1271ContractFacade } from '../contracts/ERC1271ContractFacade'
import { Subscriber } from '../subscribe/Subscriber'

const MAX_PENDING_REQUEST_COUNT = 50000 // just some limit, we can tweak the number if needed

/*
 * Sends group key requests and receives group key responses
 */

@scoped(Lifecycle.ContainerScoped)
export class SubscriberKeyExchange {

    private rsaKeyPair?: RSAKeyPair
    private readonly pendingRequests: MaxSizedSet<string> = new MaxSizedSet(MAX_PENDING_REQUEST_COUNT)
    private readonly networkNodeFacade: NetworkNodeFacade
    private readonly streamRegistry: StreamRegistry
    private readonly erc1271ContractFacade: ERC1271ContractFacade
    private readonly store: LocalGroupKeyStore
    private readonly subscriber: Subscriber
    private readonly authentication: Authentication
    private readonly logger: Logger
    private readonly ensureStarted: () => Promise<void>
    requestGroupKey: (groupKeyId: string, publisherId: EthereumAddress, streamPartId: StreamPartID) => Promise<void>

    constructor(
        networkNodeFacade: NetworkNodeFacade,
        streamRegistry: StreamRegistry,
        @inject(ERC1271ContractFacade) erc1271ContractFacade: ERC1271ContractFacade,
        store: LocalGroupKeyStore,
        subscriber: Subscriber,
        @inject(ConfigInjectionToken) config: Pick<StrictStreamrClientConfig, 'encryption'>,
        @inject(AuthenticationInjectionToken) authentication: Authentication,
        loggerFactory: LoggerFactory
    ) {
        this.networkNodeFacade = networkNodeFacade
        this.streamRegistry = streamRegistry
        this.erc1271ContractFacade = erc1271ContractFacade
        this.store = store
        this.subscriber = subscriber
        this.authentication = authentication
        this.logger = loggerFactory.createLogger(module)
        this.ensureStarted = pOnce(async () => {
            // eslint-disable-next-line no-underscore-dangle
            this.rsaKeyPair = await RSAKeyPair.create(config.encryption.rsaKeyLength)
            const node = await networkNodeFacade.getNode()
            node.addMessageListener((msg: StreamMessage) => this.onMessage(msg))
            this.logger.debug('Started')
        })
        this.requestGroupKey = withThrottling((groupKeyId: string, publisherId: EthereumAddress, streamPartId: StreamPartID) => {
            return this.doRequestGroupKey(groupKeyId, publisherId, streamPartId)
        }, config.encryption.maxKeyRequestsPerSecond)
    }

    private async doRequestGroupKey(groupKeyId: string, publisherId: EthereumAddress, streamPartId: StreamPartID): Promise<void> {
        await this.ensureStarted()
        const requestId = uuidv4()
        const request = await this.createRequest(
            groupKeyId,
            streamPartId,
            publisherId,
            this.rsaKeyPair!.getPublicKey(),
            requestId)
        const node = await this.networkNodeFacade.getNode()
        await node.broadcast(request)
        this.pendingRequests.add(requestId)
        this.logger.debug('Sent group key request (waiting for response)', {
            groupKeyId,
            requestId,
            publisherId
        })
    }

    private async createRequest(
        groupKeyId: string,
        streamPartId: StreamPartID,
        publisherId: EthereumAddress,
        rsaPublicKey: string,
        requestId: string
    ): Promise<StreamMessage> {
        const requestContent = new OldGroupKeyRequest({
            recipient: publisherId,
            requestId,
            rsaPublicKey,
            groupKeyIds: [groupKeyId],
        })
        const erc1271contract = this.subscriber.getERC1271ContractAddress(streamPartId)
        return createSignedMessage({
            messageId: new MessageID(
                StreamPartIDUtils.getStreamID(streamPartId),
                StreamPartIDUtils.getStreamPartition(streamPartId),
                Date.now(),
                0,
                erc1271contract === undefined ? await this.authentication.getAddress() : erc1271contract,
                createRandomMsgChainId()
            ),
            content: convertGroupKeyRequestToBytes(requestContent),
            contentType: ContentType.BINARY,
            messageType: StreamMessageType.GROUP_KEY_REQUEST,
            encryptionType: EncryptionType.NONE,
            authentication: this.authentication,
            signatureType: erc1271contract === undefined ? SignatureType.SECP256K1 : SignatureType.ERC_1271
        })
    }

    private async onMessage(msg: StreamMessage): Promise<void> {
        if (OldGroupKeyResponse.is(msg)) {
            try {
                const { requestId, recipient, encryptedGroupKeys } = convertBytesToGroupKeyResponse(msg.content)
                if (await this.isAssignedToMe(msg.getStreamPartID(), recipient, requestId)) {
                    this.logger.debug('Handle group key response', { requestId })
                    this.pendingRequests.delete(requestId)
                    await validateStreamMessage(msg, this.streamRegistry, this.erc1271ContractFacade)
                    await Promise.all(encryptedGroupKeys.map(async (encryptedKey) => {
                        const key = GroupKey.decryptRSAEncrypted(encryptedKey, this.rsaKeyPair!.getPrivateKey())
                        await this.store.set(key.id, msg.getPublisherId(), key.data)
                    }))
                }
            } catch (err: any) {
                this.logger.debug('Failed to handle group key response', { err })
            }
        }
    }

    private async isAssignedToMe(streamPartId: StreamPartID, recipient: EthereumAddress, requestId: string): Promise<boolean> {
        if (this.pendingRequests.has(requestId)) {
            const authenticatedUser = await this.authentication.getAddress()
            const erc1271Contract = this.subscriber.getERC1271ContractAddress(streamPartId)
            return (recipient === authenticatedUser) || (recipient === erc1271Contract)
        }
        return false
    }
}
