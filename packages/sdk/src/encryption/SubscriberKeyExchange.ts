import { Logger, StreamPartID, StreamPartIDUtils, UserID, toUserId, toUserIdRaw } from '@streamr/utils'
import { Lifecycle, delay, inject, scoped } from 'tsyringe'
import { v4 as uuidv4 } from 'uuid'
import { Identity, IdentityInjectionToken } from '../identity/Identity'
import { ConfigInjectionToken, type StrictStreamrClientConfig } from '../ConfigTypes'
import { NetworkNodeFacade } from '../NetworkNodeFacade'
import { StreamRegistry } from '../contracts/StreamRegistry'
import { MessageID } from '../protocol/MessageID'
import { StreamMessage, StreamMessageType } from '../protocol/StreamMessage'
import { createRandomMsgChainId } from '../publish/messageChain'
import { MessageSigner } from '../signature/MessageSigner'
import { SignatureValidator } from '../signature/SignatureValidator'
import { Subscriber } from '../subscribe/Subscriber'
import { LoggerFactory } from '../utils/LoggerFactory'
import { pOnce, withThrottling } from '../utils/promises'
import { MaxSizedSet } from '../utils/utils'
import { validateStreamMessage } from '../utils/validateStreamMessage'
import { LocalGroupKeyStore } from './LocalGroupKeyStore'
import { EncryptionUtil } from './EncryptionUtil'
import { AsymmetricEncryptionType, ContentType, EncryptionType, GroupKeyRequest, GroupKeyResponse, SignatureType } from '@streamr/trackerless-network'
import { KeyExchangeKeyPair } from './KeyExchangeKeyPair'
import { createCompliantExchangeKeys } from '../utils/encryptionCompliance'
import { StreamrClientError } from '../StreamrClientError'

const MAX_PENDING_REQUEST_COUNT = 50000 // just some limit, we can tweak the number if needed

/*
 * Sends group key requests and receives group key responses
 */

@scoped(Lifecycle.ContainerScoped)
export class SubscriberKeyExchange {

    private keyPair?: KeyExchangeKeyPair
    private readonly pendingRequests: MaxSizedSet<string> = new MaxSizedSet(MAX_PENDING_REQUEST_COUNT)
    private readonly networkNodeFacade: NetworkNodeFacade
    private readonly streamRegistry: StreamRegistry
    private readonly signatureValidator: SignatureValidator
    private readonly messageSigner: MessageSigner
    private readonly store: LocalGroupKeyStore
    private readonly subscriber: Subscriber
    private readonly identity: Identity
    private readonly logger: Logger
    private readonly ensureStarted: () => Promise<void>
    private readonly config: Pick<StrictStreamrClientConfig, 'encryption' | 'validation'>
    requestGroupKey: (groupKeyId: string, publisherId: UserID, streamPartId: StreamPartID) => Promise<void>

    constructor(
        networkNodeFacade: NetworkNodeFacade,
        @inject(delay(() => StreamRegistry)) streamRegistry: StreamRegistry,
        signatureValidator: SignatureValidator,
        messageSigner: MessageSigner,
        store: LocalGroupKeyStore,
        subscriber: Subscriber,
        @inject(ConfigInjectionToken) config: Pick<StrictStreamrClientConfig, 'encryption' | 'validation'>,
        @inject(IdentityInjectionToken) identity: Identity,
        loggerFactory: LoggerFactory
    ) {
        this.networkNodeFacade = networkNodeFacade
        this.streamRegistry = streamRegistry
        this.signatureValidator = signatureValidator
        this.messageSigner = messageSigner
        this.store = store
        this.subscriber = subscriber
        this.identity = identity
        this.logger = loggerFactory.createLogger('SubscriberKeyExchange')
        this.config = config
        // Setting explicit keys disables the key-exchange
        if (config.encryption.keys === undefined) {
            this.ensureStarted = pOnce(async () => {
                this.keyPair = await createCompliantExchangeKeys(identity, config)
                networkNodeFacade.addMessageListener((msg: StreamMessage) => this.onMessage(msg))
                this.logger.debug('Started')
            })
            this.requestGroupKey = withThrottling((groupKeyId: string, publisherId: UserID, streamPartId: StreamPartID) => {
                return this.doRequestGroupKey(groupKeyId, publisherId, streamPartId)
            }, config.encryption.maxKeyRequestsPerSecond)
        } else {
            this.ensureStarted = async () => {
                throw new StreamrClientError('Assertion failed', 'ASSERTION_FAILED')
            }
            this.requestGroupKey = async () => {
                throw new StreamrClientError('Assertion failed', 'ASSERTION_FAILED')
            }
        }
    }

    private async doRequestGroupKey(groupKeyId: string, publisherId: UserID, streamPartId: StreamPartID): Promise<void> {
        await this.ensureStarted()
        const requestId = uuidv4()
        const { message, request } = await this.createRequest(
            groupKeyId,
            streamPartId,
            publisherId,
            requestId)
        await this.networkNodeFacade.broadcast(message)
        this.pendingRequests.add(requestId)
        this.logger.debug('Sent group key request (waiting for response)', {
            groupKeyId,
            requestId,
            publisherId,
            keyEncryptionType: AsymmetricEncryptionType[request.encryptionType]
        })
    }

    private async createRequest(
        groupKeyId: string,
        streamPartId: StreamPartID,
        publisherId: UserID,
        requestId: string,
    ): Promise<{ message: StreamMessage, request: GroupKeyRequest }> {
        const request: GroupKeyRequest = {
            recipientId: toUserIdRaw(publisherId),
            requestId,
            publicKey: this.keyPair!.getPublicKey(),
            groupKeyIds: [groupKeyId],
            encryptionType: this.keyPair!.getEncryptionType(),
        }
        const erc1271contract = this.subscriber.getERC1271ContractAddress(streamPartId)
        const message = await this.messageSigner.createSignedMessage({
            messageId: new MessageID(
                StreamPartIDUtils.getStreamID(streamPartId),
                StreamPartIDUtils.getStreamPartition(streamPartId),
                Date.now(),
                0,
                erc1271contract === undefined ? await this.identity.getUserId() : toUserId(erc1271contract),
                createRandomMsgChainId()
            ),
            content: GroupKeyRequest.toBinary(request),
            contentType: ContentType.BINARY,
            messageType: StreamMessageType.GROUP_KEY_REQUEST,
            encryptionType: EncryptionType.NONE,
        }, erc1271contract === undefined ? this.identity.getSignatureType() : SignatureType.ERC_1271)

        return { message, request }
    }

    private async onMessage(msg: StreamMessage): Promise<void> {
        if (msg.messageType === StreamMessageType.GROUP_KEY_RESPONSE) {
            try {
                const { requestId, recipientId, groupKeys: encryptedGroupKeys, encryptionType } = GroupKeyResponse.fromBinary(msg.content)
                const recipientUserId = toUserId(recipientId)

                if (await this.isAssignedToMe(msg.getStreamPartID(), recipientUserId, requestId)) {
                    this.logger.debug('Handle group key response', { requestId })
                    this.pendingRequests.delete(requestId)
                    await validateStreamMessage(msg, this.streamRegistry, this.signatureValidator, this.config)
                    await Promise.all(encryptedGroupKeys.map(async (encryptedKey) => {
                        const key = await EncryptionUtil.decryptWithPrivateKey(encryptedKey.data, this.keyPair!.getPrivateKey(), encryptionType)
                        await this.store.set(encryptedKey.id, msg.getPublisherId(), key)
                    }))
                }
            } catch (err: any) {
                this.logger.debug('Failed to handle group key response', { err })
            }
        }
    }

    private async isAssignedToMe(streamPartId: StreamPartID, recipientId: UserID, requestId: string): Promise<boolean> {
        if (this.pendingRequests.has(requestId)) {
            const myId = await this.identity.getUserId()
            const erc1271Contract = this.subscriber.getERC1271ContractAddress(streamPartId)
            return (recipientId === myId) || ((erc1271Contract !== undefined) && (recipientId === toUserId(erc1271Contract)))
        }
        return false
    }
}
