import { Logger, StreamPartID, StreamPartIDUtils, UserID, toUserId } from '@streamr/utils'
import { Lifecycle, delay, inject, scoped } from 'tsyringe'
import { v4 as uuidv4 } from 'uuid'
import { Authentication, AuthenticationInjectionToken } from '../Authentication'
import { ConfigInjectionToken, StrictStreamrClientConfig } from '../Config'
import { NetworkNodeFacade } from '../NetworkNodeFacade'
import { StreamRegistry } from '../contracts/StreamRegistry'
import { GroupKeyRequest as OldGroupKeyRequest } from '../protocol/GroupKeyRequest'
import { GroupKeyResponse as OldGroupKeyResponse } from '../protocol/GroupKeyResponse'
import { MessageID } from '../protocol/MessageID'
import { ContentType, EncryptionType, SignatureType, StreamMessage, StreamMessageType } from '../protocol/StreamMessage'
import { convertBytesToGroupKeyResponse, convertGroupKeyRequestToBytes } from '../protocol/oldStreamMessageBinaryUtils'
import { createRandomMsgChainId } from '../publish/messageChain'
import { MessageSigner } from '../signature/MessageSigner'
import { SignatureValidator } from '../signature/SignatureValidator'
import { Subscriber } from '../subscribe/Subscriber'
import { LoggerFactory } from '../utils/LoggerFactory'
import { pOnce, withThrottling } from '../utils/promises'
import { MaxSizedSet } from '../utils/utils'
import { validateStreamMessage } from '../utils/validateStreamMessage'
import { GroupKey } from './GroupKey'
import { LocalGroupKeyStore } from './LocalGroupKeyStore'
import { RSAKeyPair } from './RSAKeyPair'

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
    private readonly signatureValidator: SignatureValidator
    private readonly messageSigner: MessageSigner
    private readonly store: LocalGroupKeyStore
    private readonly subscriber: Subscriber
    private readonly authentication: Authentication
    private readonly logger: Logger
    private readonly ensureStarted: () => Promise<void>
    requestGroupKey: (groupKeyId: string, publisherId: UserID, streamPartId: StreamPartID) => Promise<void>

    constructor(
        networkNodeFacade: NetworkNodeFacade,
        @inject(delay(() => StreamRegistry)) streamRegistry: StreamRegistry,
        signatureValidator: SignatureValidator,
        messageSigner: MessageSigner,
        store: LocalGroupKeyStore,
        subscriber: Subscriber,
        @inject(ConfigInjectionToken) config: Pick<StrictStreamrClientConfig, 'encryption'>,
        @inject(AuthenticationInjectionToken) authentication: Authentication,
        loggerFactory: LoggerFactory
    ) {
        this.networkNodeFacade = networkNodeFacade
        this.streamRegistry = streamRegistry
        this.signatureValidator = signatureValidator
        this.messageSigner = messageSigner
        this.store = store
        this.subscriber = subscriber
        this.authentication = authentication
        this.logger = loggerFactory.createLogger(module)
        this.ensureStarted = pOnce(async () => {
            this.rsaKeyPair = await RSAKeyPair.create(config.encryption.rsaKeyLength)
            networkNodeFacade.addMessageListener((msg: StreamMessage) => this.onMessage(msg))
            this.logger.debug('Started')
        })
        this.requestGroupKey = withThrottling((groupKeyId: string, publisherId: UserID, streamPartId: StreamPartID) => {
            return this.doRequestGroupKey(groupKeyId, publisherId, streamPartId)
        }, config.encryption.maxKeyRequestsPerSecond)
    }

    private async doRequestGroupKey(
        groupKeyId: string,
        publisherId: UserID,
        streamPartId: StreamPartID
    ): Promise<void> {
        await this.ensureStarted()
        const requestId = uuidv4()
        const request = await this.createRequest(
            groupKeyId,
            streamPartId,
            publisherId,
            this.rsaKeyPair!.getPublicKey(),
            requestId
        )
        await this.networkNodeFacade.broadcast(request)
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
        publisherId: UserID,
        rsaPublicKey: string,
        requestId: string
    ): Promise<StreamMessage> {
        const requestContent = new OldGroupKeyRequest({
            recipient: publisherId,
            requestId,
            rsaPublicKey,
            groupKeyIds: [groupKeyId]
        })
        const erc1271contract = this.subscriber.getERC1271ContractAddress(streamPartId)
        return this.messageSigner.createSignedMessage(
            {
                messageId: new MessageID(
                    StreamPartIDUtils.getStreamID(streamPartId),
                    StreamPartIDUtils.getStreamPartition(streamPartId),
                    Date.now(),
                    0,
                    erc1271contract === undefined ? await this.authentication.getUserId() : toUserId(erc1271contract),
                    createRandomMsgChainId()
                ),
                content: convertGroupKeyRequestToBytes(requestContent),
                contentType: ContentType.BINARY,
                messageType: StreamMessageType.GROUP_KEY_REQUEST,
                encryptionType: EncryptionType.NONE
            },
            erc1271contract === undefined ? SignatureType.SECP256K1 : SignatureType.ERC_1271
        )
    }

    private async onMessage(msg: StreamMessage): Promise<void> {
        if (OldGroupKeyResponse.is(msg)) {
            try {
                const { requestId, recipient, encryptedGroupKeys } = convertBytesToGroupKeyResponse(msg.content)
                if (await this.isAssignedToMe(msg.getStreamPartID(), recipient, requestId)) {
                    this.logger.debug('Handle group key response', { requestId })
                    this.pendingRequests.delete(requestId)
                    await validateStreamMessage(msg, this.streamRegistry, this.signatureValidator)
                    await Promise.all(
                        encryptedGroupKeys.map(async (encryptedKey) => {
                            const key = GroupKey.decryptRSAEncrypted(encryptedKey, this.rsaKeyPair!.getPrivateKey())
                            await this.store.set(key.id, msg.getPublisherId(), key.data)
                        })
                    )
                }
            } catch (err: any) {
                this.logger.debug('Failed to handle group key response', { err })
            }
        }
    }

    private async isAssignedToMe(streamPartId: StreamPartID, recipientId: UserID, requestId: string): Promise<boolean> {
        if (this.pendingRequests.has(requestId)) {
            const authenticatedUser = await this.authentication.getUserId()
            const erc1271Contract = this.subscriber.getERC1271ContractAddress(streamPartId)
            return (
                recipientId === authenticatedUser ||
                (erc1271Contract !== undefined && recipientId === toUserId(erc1271Contract))
            )
        }
        return false
    }
}
