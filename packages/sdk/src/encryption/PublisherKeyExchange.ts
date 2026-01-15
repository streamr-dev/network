import {
    Logger,
    StreamPartID,
    StreamPartIDUtils,
    toUserId,
    toUserIdRaw,
    UserID
} from '@streamr/utils'
import { AsymmetricEncryptionType, GroupKeyResponse, EncryptedGroupKey, 
    GroupKeyRequest, SignatureType, ContentType, EncryptionType } from '@streamr/trackerless-network'
import without from 'lodash/without'
import { Lifecycle, inject, scoped } from 'tsyringe'
import { Identity, IdentityInjectionToken } from '../identity/Identity'
import { NetworkNodeFacade } from '../NetworkNodeFacade'
import { StreamRegistry } from '../contracts/StreamRegistry'
import { StreamrClientEventEmitter } from '../events'
import { MessageID } from '../protocol/MessageID'
import { StreamMessage, StreamMessageType } from '../protocol/StreamMessage'
import { createRandomMsgChainId } from '../publish/messageChain'
import { MessageSigner } from '../signature/MessageSigner'
import { SignatureValidator } from '../signature/SignatureValidator'
import { LoggerFactory } from '../utils/LoggerFactory'
import { validateStreamMessage } from '../utils/validateStreamMessage'
import { EncryptionUtil } from './EncryptionUtil'
import { GroupKey } from './GroupKey'
import { LocalGroupKeyStore } from './LocalGroupKeyStore'
import { ConfigInjectionToken, StrictStreamrClientConfig } from '../ConfigTypes'
import { isCompliantAsymmetricEncryptionType } from '../utils/encryptionCompliance'
import { StreamrClientError } from '../StreamrClientError'

/*
 * Sends group key responses
 */

enum ResponseType {
    NONE,
    NORMAL,
    ERC_1271
}

@scoped(Lifecycle.ContainerScoped)
export class PublisherKeyExchange {

    private readonly networkNodeFacade: NetworkNodeFacade
    private readonly streamRegistry: StreamRegistry
    private readonly signatureValidator: SignatureValidator
    private readonly messageSigner: MessageSigner
    private readonly store: LocalGroupKeyStore
    private readonly identity: Identity
    private readonly logger: Logger
    private readonly erc1271Publishers = new Set<UserID>()
    private readonly config: Pick<StrictStreamrClientConfig, 'encryption' | 'validation'>

    constructor(
        networkNodeFacade: NetworkNodeFacade,
        streamRegistry: StreamRegistry,
        signatureValidator: SignatureValidator,
        messageSigner: MessageSigner,
        store: LocalGroupKeyStore,
        @inject(IdentityInjectionToken) identity: Identity,
        @inject(ConfigInjectionToken) config: Pick<StrictStreamrClientConfig, 'encryption' | 'validation'>,
        eventEmitter: StreamrClientEventEmitter,
        loggerFactory: LoggerFactory
    ) {
        this.networkNodeFacade = networkNodeFacade
        this.streamRegistry = streamRegistry
        this.signatureValidator = signatureValidator
        this.messageSigner = messageSigner
        this.store = store
        this.identity = identity
        this.logger = loggerFactory.createLogger('PublisherKeyExchange')
        this.config = config
        // Setting explicit keys disables the key-exchange
        if (config.encryption.keys === undefined) {
            networkNodeFacade.once('start', async () => {
                networkNodeFacade.addMessageListener((msg: StreamMessage) => this.onMessage(msg))
                this.logger.debug('Started')
            })
            eventEmitter.on('messagePublished', (msg) => {
                if (msg.signatureType === SignatureType.ERC_1271) {
                    const publisherId = msg.getPublisherId()
                    if (!this.erc1271Publishers.has(publisherId)) {
                        this.logger.debug('Add ERC-1271 publisher', { publisherId })
                        this.erc1271Publishers.add(publisherId)
                    }
                }
            })
        }
    }

    private async onMessage(request: StreamMessage): Promise<void> {
        if (request.messageType === StreamMessageType.GROUP_KEY_REQUEST) {
            try {
                const { recipientId, requestId, publicKey, 
                    groupKeyIds, encryptionType: keyEncryptionType } = GroupKeyRequest.fromBinary(request.content)
                const recipientUserId = toUserId(recipientId)

                if (!isCompliantAsymmetricEncryptionType(keyEncryptionType, this.config)) {
                    throw new StreamrClientError(
                        `EncryptionType in key request (${keyEncryptionType}) is not compliant with encryption settings!`,
                        'ENCRYPTION_POLICY_VIOLATION',
                        request
                    )
                }

                const responseType = await this.getResponseType(recipientUserId)

                if (responseType !== ResponseType.NONE) {
                    this.logger.debug('Handling group key request', 
                        { requestId, responseType, keyEncryptionType: AsymmetricEncryptionType[keyEncryptionType] })
                    await validateStreamMessage(request, this.streamRegistry, this.signatureValidator, this.config)
                    const authenticatedUser = await this.identity.getUserId()
                    const keys = without(
                        await Promise.all(groupKeyIds.map((id: string) => this.store.get(id, authenticatedUser))),
                        undefined) as GroupKey[]

                    if (keys.length > 0) {
                        const response = await this.createResponse(
                            keys,
                            responseType,
                            recipientUserId,
                            request.getStreamPartID(),
                            publicKey,
                            request.getPublisherId(),
                            requestId,
                            keyEncryptionType,
                        )
                        await this.networkNodeFacade.broadcast(response)
                        this.logger.debug('Handled group key request (found keys)', {
                            groupKeyIds: keys.map((k) => k.id).join(),
                            recipient: request.getPublisherId()
                        })
                    } else {
                        this.logger.debug('Handled group key request (no keys found)', {
                            requestId,
                            recipient: request.getPublisherId()
                        })
                    }
                }
            } catch (err: any) {
                this.logger.debug('Failed to handle group key request', err)
            }
        }
    }

    private async getResponseType(publisherId: UserID): Promise<ResponseType> {
        const myId = await this.identity.getUserId()
        if (publisherId === myId) {
            return ResponseType.NORMAL
        } else if (this.erc1271Publishers.has(publisherId)) {
            return ResponseType.ERC_1271
        } else {
            return ResponseType.NONE
        }
    }

    private async createResponse(
        keys: GroupKey[],
        responseType: ResponseType,
        publisherId: UserID,
        streamPartId: StreamPartID,
        publicKey: Uint8Array,
        recipientId: UserID,
        requestId: string,
        keyEncryptionType: AsymmetricEncryptionType,
    ): Promise<StreamMessage> {
        const encryptedGroupKeys: EncryptedGroupKey[] = await Promise.all(keys.map(async (key) => ({
            id: key.id,
            data: await EncryptionUtil.encryptForPublicKey(key.data, publicKey, keyEncryptionType)
        })))
        const responseContent: GroupKeyResponse = {
            recipientId: toUserIdRaw(recipientId),
            requestId,
            groupKeys: encryptedGroupKeys,
            encryptionType: keyEncryptionType,
        }
        const response = this.messageSigner.createSignedMessage({
            messageId: new MessageID(
                StreamPartIDUtils.getStreamID(streamPartId),
                StreamPartIDUtils.getStreamPartition(streamPartId),
                Date.now(),
                0,
                publisherId,
                createRandomMsgChainId()
            ),
            content: GroupKeyResponse.toBinary(responseContent),
            contentType: ContentType.BINARY,
            messageType: StreamMessageType.GROUP_KEY_RESPONSE,
            encryptionType: EncryptionType.NONE,
        }, responseType === ResponseType.NORMAL ? this.identity.getSignatureType() : SignatureType.ERC_1271)
        return response
    }
}
