import without from 'lodash/without'
import {
    EncryptedGroupKey,
    EncryptionType,
    GroupKeyRequest,
    GroupKeyResponse,
    GroupKeyResponseSerialized,
    MessageID,
    StreamMessage,
    StreamMessageType,
    StreamPartID,
    StreamPartIDUtils
} from '@streamr/protocol'
import { inject, Lifecycle, scoped } from 'tsyringe'
import { Authentication, AuthenticationInjectionToken } from '../Authentication'
import { NetworkNodeFacade } from '../NetworkNodeFacade'
import { createRandomMsgChainId } from '../publish/messageChain'
import { createSignedMessage } from '../publish/MessageFactory'
import { Validator } from '../Validator'
import { EncryptionUtil } from './EncryptionUtil'
import { GroupKey } from './GroupKey'
import { LocalGroupKeyStore } from './LocalGroupKeyStore'
import { EthereumAddress, Logger } from '@streamr/utils'
import { LoggerFactory } from '../utils/LoggerFactory'

/*
 * Sends group key responses
 */

@scoped(Lifecycle.ContainerScoped)
export class PublisherKeyExchange {
    private readonly logger: Logger
    private readonly store: LocalGroupKeyStore
    private readonly networkNodeFacade: NetworkNodeFacade
    private readonly authentication: Authentication
    private readonly validator: Validator

    constructor(
        store: LocalGroupKeyStore,
        networkNodeFacade: NetworkNodeFacade,
        @inject(LoggerFactory) loggerFactory: LoggerFactory,
        @inject(AuthenticationInjectionToken) authentication: Authentication,
        validator: Validator
    ) {
        this.logger = loggerFactory.createLogger(module)
        this.store = store
        this.networkNodeFacade = networkNodeFacade
        this.authentication = authentication
        this.validator = validator
        networkNodeFacade.once('start', async () => {
            const node = await networkNodeFacade.getNode()
            node.addMessageListener((msg: StreamMessage) => this.onMessage(msg))
            this.logger.debug('Started')
        })
    }

    private async onMessage(request: StreamMessage): Promise<void> {
        if (GroupKeyRequest.is(request)) {
            try {
                const authenticatedUser = await this.authentication.getAddress()
                const { recipient, requestId, rsaPublicKey, groupKeyIds } = GroupKeyRequest.fromStreamMessage(request) as GroupKeyRequest
                if (recipient === authenticatedUser) {
                    this.logger.debug('Handling group key request', { requestId })
                    await this.validator.validate(request)
                    const keys = without(
                        await Promise.all(groupKeyIds.map((id: string) => this.store.get(id, authenticatedUser))),
                        undefined) as GroupKey[]
                    if (keys.length > 0) {
                        const response = await this.createResponse(
                            keys,
                            request.getStreamPartID(),
                            rsaPublicKey,
                            request.getPublisherId(),
                            requestId)
                        const node = await this.networkNodeFacade.getNode()
                        node.publish(response)
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

    private async createResponse(
        keys: GroupKey[],
        streamPartId: StreamPartID,
        rsaPublicKey: string,
        recipient: EthereumAddress,
        requestId: string
    ): Promise<StreamMessage<GroupKeyResponseSerialized>> {
        const encryptedGroupKeys = await Promise.all(keys.map((key) => {
            const encryptedGroupKeyHex = EncryptionUtil.encryptWithRSAPublicKey(key.data, rsaPublicKey, true)
            return new EncryptedGroupKey(key.id, encryptedGroupKeyHex)
        })) as EncryptedGroupKey[]
        const responseContent = new GroupKeyResponse({
            recipient,
            requestId,
            encryptedGroupKeys
        })
        const response = createSignedMessage<GroupKeyResponseSerialized>({
            messageId: new MessageID(
                StreamPartIDUtils.getStreamID(streamPartId),
                StreamPartIDUtils.getStreamPartition(streamPartId),
                Date.now(),
                0,
                await this.authentication.getAddress(),
                createRandomMsgChainId()
            ),
            serializedContent: JSON.stringify(responseContent.toArray()),
            messageType: StreamMessageType.GROUP_KEY_RESPONSE,
            encryptionType: EncryptionType.RSA,
            authentication: this.authentication
        })
        return response
    }
}
