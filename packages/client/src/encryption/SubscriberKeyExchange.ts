import {
    EncryptionType,
    GroupKeyRequest,
    GroupKeyRequestSerialized,
    GroupKeyResponse,
    MessageID,
    StreamMessage,
    StreamMessageType,
    StreamPartID,
    StreamPartIDUtils
} from '@streamr/protocol'
import { inject, Lifecycle, scoped } from 'tsyringe'
import { v4 as uuidv4 } from 'uuid'
import { Authentication, AuthenticationInjectionToken } from '../Authentication'
import { ConfigInjectionToken, StrictStreamrClientConfig } from '../Config'
import { NetworkNodeFacade } from '../NetworkNodeFacade'
import { createRandomMsgChainId } from '../publish/messageChain'
import { createSignedMessage } from '../publish/MessageFactory'
import { withThrottling, pOnce } from '../utils/promises'
import { MaxSizedSet } from '../utils/utils'
import { Validator } from '../Validator'
import { GroupKey } from './GroupKey'
import { LocalGroupKeyStore } from './LocalGroupKeyStore'
import { RSAKeyPair } from './RSAKeyPair'
import { EthereumAddress, Logger } from '@streamr/utils'
import { LoggerFactory } from '../utils/LoggerFactory'

const MAX_PENDING_REQUEST_COUNT = 50000 // just some limit, we can tweak the number if needed

/*
 * Sends group key requests and receives group key responses
 */

@scoped(Lifecycle.ContainerScoped)
export class SubscriberKeyExchange {
    private readonly logger: Logger
    private rsaKeyPair: RSAKeyPair | undefined
    private readonly networkNodeFacade: NetworkNodeFacade
    private readonly store: LocalGroupKeyStore
    private readonly authentication: Authentication
    private readonly validator: Validator
    private readonly pendingRequests: MaxSizedSet<string> = new MaxSizedSet(MAX_PENDING_REQUEST_COUNT)
    private readonly ensureStarted: () => Promise<void>
    requestGroupKey: (groupKeyId: string, publisherId: EthereumAddress, streamPartId: StreamPartID) => Promise<void>

    constructor(
        networkNodeFacade: NetworkNodeFacade,
        store: LocalGroupKeyStore,
        @inject(AuthenticationInjectionToken) authentication: Authentication,
        validator: Validator,
        @inject(LoggerFactory) loggerFactory: LoggerFactory,
        @inject(ConfigInjectionToken) config: Pick<StrictStreamrClientConfig, 'encryption'>
    ) {
        this.logger = loggerFactory.createLogger(module)
        this.networkNodeFacade = networkNodeFacade
        this.store = store
        this.authentication = authentication
        this.validator = validator
        this.ensureStarted = pOnce(async () => {
            this.rsaKeyPair = await RSAKeyPair.create()
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
        node.publish(request)
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
    ): Promise<StreamMessage<GroupKeyRequestSerialized>> {
        const requestContent = new GroupKeyRequest({
            recipient: publisherId,
            requestId,
            rsaPublicKey,
            groupKeyIds: [groupKeyId],
        }).toArray()
        return createSignedMessage<GroupKeyRequestSerialized>({
            messageId: new MessageID(
                StreamPartIDUtils.getStreamID(streamPartId),
                StreamPartIDUtils.getStreamPartition(streamPartId),
                Date.now(),
                0,
                await this.authentication.getAddress(),
                createRandomMsgChainId()
            ),
            serializedContent: JSON.stringify(requestContent),
            messageType: StreamMessageType.GROUP_KEY_REQUEST,
            encryptionType: EncryptionType.NONE,
            authentication: this.authentication
        })
    }

    private async onMessage(msg: StreamMessage): Promise<void> {
        if (GroupKeyResponse.is(msg)) {
            try {
                const authenticatedUser = await this.authentication.getAddress()
                const { requestId, recipient, encryptedGroupKeys } = GroupKeyResponse.fromStreamMessage(msg) as GroupKeyResponse
                if ((recipient === authenticatedUser) && (this.pendingRequests.has(requestId))) {
                    this.logger.debug('Handle group key response', { requestId })
                    this.pendingRequests.delete(requestId)
                    await this.validator.validate(msg)
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
}
