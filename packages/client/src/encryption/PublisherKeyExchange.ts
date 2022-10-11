import { without } from 'lodash'
import {
    EncryptedGroupKey,
    GroupKeyRequest,
    GroupKeyResponse,
    GroupKeyResponseSerialized,
    MessageID,
    StreamMessage,
    StreamMessageType,
    StreamPartID,
    StreamPartIDUtils
} from 'streamr-client-protocol'
import { inject, Lifecycle, scoped } from 'tsyringe'
import { Authentication, AuthenticationInjectionToken } from '../Authentication'
import { NetworkNodeFacade } from '../NetworkNodeFacade'
import { createRandomMsgChainId } from '../publish/MessageChain'
import { createSignedMessage } from '../publish/MessageFactory'
import { Context } from '../utils/Context'
import { Debugger } from '../utils/log'
import { instanceId } from '../utils/utils'
import { Validator } from '../Validator'
import { EncryptionUtil } from './EncryptionUtil'
import { GroupKey, GroupKeyId } from './GroupKey'
import { GroupKeyStore } from './GroupKeyStore'
import { EthereumAddress } from '@streamr/utils'

/*
 * Sends group key responses
 */

@scoped(Lifecycle.ContainerScoped)
export class PublisherKeyExchange {

    private readonly store: GroupKeyStore
    private readonly networkNodeFacade: NetworkNodeFacade
    private readonly authentication: Authentication
    private readonly validator: Validator
    private readonly debug: Debugger

    constructor(
        context: Context,
        store: GroupKeyStore,
        networkNodeFacade: NetworkNodeFacade,
        @inject(AuthenticationInjectionToken) authentication: Authentication,
        validator: Validator
    ) {
        this.debug = context.debug.extend(instanceId(this))
        this.store = store
        this.networkNodeFacade = networkNodeFacade
        this.authentication = authentication
        this.validator = validator
        networkNodeFacade.once('start', async () => {
            const node = await networkNodeFacade.getNode()
            this.debug('Started')
            node.addMessageListener((msg: StreamMessage) => this.onMessage(msg))
        })
    }

    private async onMessage(request: StreamMessage<any>): Promise<void> {
        if (GroupKeyRequest.is(request)) {
            try {
                const authenticatedUser = await this.authentication.getAddress()
                const { recipient, requestId, rsaPublicKey, groupKeyIds } = GroupKeyRequest.fromStreamMessage(request) as GroupKeyRequest
                if (recipient.toLowerCase() === authenticatedUser) {
                    this.debug('Handling group key request %s', requestId)
                    await this.validator.validate(request)
                    const keys = without(
                        await Promise.all(groupKeyIds.map((id: GroupKeyId) => this.store.get(id, request.getStreamId()))),
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
                        this.debug('Sent group keys %s to %s', keys.map((k) => k.id).join(), request.getPublisherId())
                    } else {
                        this.debug('No group keys')
                    }
                }
            } catch (e: any) {
                this.debug('Error in PublisherKeyExchange: %s', e.message)
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
            encryptionType: StreamMessage.ENCRYPTION_TYPES.RSA,
            authentication: this.authentication
        })
        return response
    }
}
