import { 
    EncryptedGroupKey,
    EthereumAddress,
    GroupKeyRequest,
    GroupKeyRequestSerialized,
    GroupKeyResponse,
    MessageID,
    StreamID,
    StreamMessage,
    StreamMessageType
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
import { GroupKey } from './GroupKey'
import { GroupKeyStoreFactory } from './GroupKeyStoreFactory'

/*
 * Sends group key responses
 */

const createGroupKeyResponse = async (
    streamMessage: StreamMessage<GroupKeyRequestSerialized>,
    getGroupKey: (groupKeyId: string, streamId: StreamID) => Promise<GroupKey | undefined>,
    isStreamSubscriber: (streamId: StreamID, ethAddress: EthereumAddress) => Promise<boolean>,
): Promise<GroupKeyResponse> => {
    const request = GroupKeyRequest.fromArray(streamMessage.getParsedContent())
    const streamId = streamMessage.getStreamId()
    const subscriberId = streamMessage.getPublisherId()
    // No need to check if parsedContent contains the necessary fields because it was already checked during deserialization
    const { requestId, rsaPublicKey, groupKeyIds } = request

    // TODO remove this check?, seems that is already checked in StreamMessageValidator:186
    const isSubscriber = await isStreamSubscriber(streamId, subscriberId)

    const encryptedGroupKeys = (!isSubscriber ? [] : await Promise.all(groupKeyIds.map(async (id) => {
        const groupKey = await getGroupKey(id, streamId)
        if (!groupKey) {
            return null // will be filtered out
        }
        const key = EncryptionUtil.encryptWithRSAPublicKey(groupKey.data, rsaPublicKey, true)
        return new EncryptedGroupKey(id, key)
    }))).filter((item) => item !== null) as EncryptedGroupKey[]

    return new GroupKeyResponse({
        recipient: subscriberId,
        requestId,
        encryptedGroupKeys,
    })
}

@scoped(Lifecycle.ContainerScoped)
export class PublisherKeyExchange {

    private readonly groupKeyStoreFactory: GroupKeyStoreFactory
    private readonly networkNodeFacade: NetworkNodeFacade
    private readonly streamRegistryCached: StreamRegistryCached
    private readonly authentication: Authentication
    private readonly validator: Validator
    private readonly debug: Debugger

    constructor(
        context: Context,
        groupKeyStoreFactory: GroupKeyStoreFactory,
        networkNodeFacade: NetworkNodeFacade,
        streamRegistryCached: StreamRegistryCached,
        @inject(AuthenticationInjectionToken) authentication: Authentication,
        validator: Validator
    ) {
        this.debug = context.debug.extend(instanceId(this))
        this.groupKeyStoreFactory = groupKeyStoreFactory
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
                const { recipient, requestId } = GroupKeyRequest.fromStreamMessage(request) as GroupKeyRequest
                if (recipient.toLowerCase() === authenticatedUser) {
                    this.debug('Handling group key request %s', requestId)
                    await this.validator.validate(request)
                    const responseContent = await createGroupKeyResponse(
                        request,
                        async (groupKeyId: string, streamId: StreamID) => {
                            const store = await this.groupKeyStoreFactory.getStore(streamId)
                            return store.get(groupKeyId)
                        },
                        (streamId: StreamID, address: EthereumAddress) => this.streamRegistryCached.isStreamSubscriber(streamId, address)
                    )
                    if (responseContent.encryptedGroupKeys.length > 0) {
                        const response = new StreamMessage({
                            messageId: new MessageID(
                                request.getMessageID().streamId,
                                request.getMessageID().streamPartition,
                                Date.now(),
                                0,
                                authenticatedUser,
                                createRandomMsgChainId()
                            ),
                            messageType: StreamMessageType.GROUP_KEY_RESPONSE,
                            encryptionType: StreamMessage.ENCRYPTION_TYPES.RSA,
                            content: responseContent.toArray(),
                            signatureType: StreamMessage.SIGNATURE_TYPES.ETH,
                        })
                        response.signature = await this.authentication.createMessagePayloadSignature(response.getPayloadToSign())
                        const node = await this.networkNodeFacade.getNode()
                        node.publish(response)
                        this.debug('Sent group keys %s to %s',
                            responseContent.encryptedGroupKeys.map((k) => k.groupKeyId).join(),
                            request.getPublisherId())
                    } else {
                        this.debug('No group keys')
                    }
                }
            } catch (e: any) {
                this.debug('Error in PublisherKeyExchange: %s', e.message)
            }
        }
    }
}
