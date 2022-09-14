import { without } from 'lodash'
import {
    EncryptedGroupKey,
    EthereumAddress,
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
import { StreamRegistryCached } from '../registry/StreamRegistryCached'
import { Context } from '../utils/Context'
import { Debugger } from '../utils/log'
import { instanceId } from '../utils/utils'
import { Validator } from '../Validator'
import { EncryptionUtil } from './EncryptionUtil'
import { GroupKey, GroupKeyId } from './GroupKey'
import { GroupKeyStoreFactory } from './GroupKeyStoreFactory'

/*
 * Sends group key responses
 */

@scoped(Lifecycle.ContainerScoped)
export class PublisherKeyExchange {

    private readonly storeFactory: GroupKeyStoreFactory
    private readonly networkNodeFacade: NetworkNodeFacade
    private readonly streamRegistryCached: StreamRegistryCached
    private readonly authentication: Authentication
    private readonly validator: Validator
    private readonly debug: Debugger

    constructor(
        context: Context,
        storeFactory: GroupKeyStoreFactory,
        networkNodeFacade: NetworkNodeFacade,
        streamRegistryCached: StreamRegistryCached,
        @inject(AuthenticationInjectionToken) authentication: Authentication,
        validator: Validator
    ) {
        this.debug = context.debug.extend(instanceId(this))
        this.storeFactory = storeFactory
        this.networkNodeFacade = networkNodeFacade
        this.streamRegistryCached = streamRegistryCached
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
                    // TODO remove this check?, seems that is already checked in StreamMessageValidator:186
                    const isSubscriber = await this.streamRegistryCached.isStreamSubscriber(request.getStreamId(), request.getPublisherId())
                    if (!isSubscriber) {
                        return
                    }
                    const store = await this.storeFactory.getStore(request.getStreamId())
                    const keys = without(
                        await Promise.all(groupKeyIds.map((id: GroupKeyId) => store.get(id))),
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
        const response = new StreamMessage({
            messageId: new MessageID(
                StreamPartIDUtils.getStreamID(streamPartId),
                StreamPartIDUtils.getStreamPartition(streamPartId),
                Date.now(),
                0,
                await this.authentication.getAddress(),
                createRandomMsgChainId()
            ),
            messageType: StreamMessageType.GROUP_KEY_RESPONSE,
            encryptionType: StreamMessage.ENCRYPTION_TYPES.RSA,
            content: responseContent.toArray(),
            signatureType: StreamMessage.SIGNATURE_TYPES.ETH,
        })
        response.signature = await this.authentication.createMessagePayloadSignature(response.getPayloadToSign())
        return response
    }
}
