import {
    EthereumAddress,
    GroupKeyRequest,
    GroupKeyRequestSerialized,
    GroupKeyResponse,
    MessageID,
    StreamMessage,
    StreamMessageType,
    StreamPartID,
    StreamPartIDUtils
} from 'streamr-client-protocol'
import { inject, Lifecycle, scoped } from 'tsyringe'
import { v4 as uuidv4 } from 'uuid'
import { Authentication, AuthenticationInjectionToken } from '../Authentication'
import { NetworkNodeFacade } from '../NetworkNodeFacade'
import { createRandomMsgChainId } from '../publish/MessageChain'
import { Context } from '../utils/Context'
import { Debugger } from '../utils/log'
import { pOnce } from '../utils/promises'
import { instanceId, MaxSizedSet } from '../utils/utils'
import { Validator } from '../Validator'
import { GroupKey, GroupKeyId } from './GroupKey'
import { GroupKeyStoreFactory } from './GroupKeyStoreFactory'
import { RSAKeyPair } from './RSAKeyPair'

const MAX_PENDING_REQUEST_COUNT = 50000 // just some limit, we can tweak the number if needed 

/*
 * Sends group key requests and receives group key responses
 */

@scoped(Lifecycle.ContainerScoped)
export class SubscriberKeyExchange {

    private rsaKeyPair: RSAKeyPair | undefined
    private readonly networkNodeFacade: NetworkNodeFacade
    private readonly groupKeyStoreFactory: GroupKeyStoreFactory
    private readonly authentication: Authentication
    private readonly validator: Validator
    private readonly pendingRequests: MaxSizedSet<string> = new MaxSizedSet(MAX_PENDING_REQUEST_COUNT)
    private readonly debug: Debugger
    private readonly ensureStarted: () => Promise<void>
    
    constructor(
        context: Context,
        networkNodeFacade: NetworkNodeFacade,
        groupKeyStoreFactory: GroupKeyStoreFactory,
        @inject(AuthenticationInjectionToken) authentication: Authentication,
        validator: Validator
    ) {
        this.debug = context.debug.extend(instanceId(this))
        this.networkNodeFacade = networkNodeFacade
        this.groupKeyStoreFactory = groupKeyStoreFactory
        this.authentication = authentication
        this.validator = validator
        this.ensureStarted = pOnce(async () => {
            this.rsaKeyPair = await RSAKeyPair.create()
            const node = await networkNodeFacade.getNode()
            node.addMessageListener((msg: StreamMessage) => this.onMessage(msg))
            this.debug('Started')
        })
    }

    async requestGroupKey(groupKeyId: GroupKeyId, publisherId: EthereumAddress, streamPartId: StreamPartID): Promise<void> {
        await this.ensureStarted()
        const requestId = uuidv4()
        this.debug('Request group key %s, requestId=%s', groupKeyId, requestId)
        const request = await this.createRequest(
            groupKeyId,
            streamPartId,
            publisherId,
            this.rsaKeyPair!.getPublicKey(),
            requestId)
        const node = await this.networkNodeFacade.getNode()
        node.publish(request)
        this.pendingRequests.add(requestId)
    }

    private async createRequest(
        groupKeyId: GroupKeyId,
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
        const request = new StreamMessage({
            messageId: new MessageID(
                StreamPartIDUtils.getStreamID(streamPartId),
                StreamPartIDUtils.getStreamPartition(streamPartId),
                Date.now(),
                0,
                await this.authentication.getAddress(),
                createRandomMsgChainId()
            ),
            messageType: StreamMessageType.GROUP_KEY_REQUEST,
            encryptionType: StreamMessage.ENCRYPTION_TYPES.NONE,
            content: requestContent,
            signatureType: StreamMessage.SIGNATURE_TYPES.ETH,
        })
        request.signature = await this.authentication.createMessagePayloadSignature(request.getPayloadToSign())
        return request
    }

    private async onMessage(msg: StreamMessage<any>): Promise<void> {
        if (GroupKeyResponse.is(msg)) {
            try {
                const authenticatedUser = await this.authentication.getAddress()
                const { requestId, recipient, encryptedGroupKeys } = GroupKeyResponse.fromStreamMessage(msg) as GroupKeyResponse
                if ((recipient.toLowerCase() === authenticatedUser) && (this.pendingRequests.has(requestId))) {
                    this.debug('Handling group key response %s', requestId)
                    this.pendingRequests.delete(requestId)
                    await this.validator.validate(msg)
                    const store = await this.groupKeyStoreFactory.getStore(msg.getStreamId())
                    await Promise.all(encryptedGroupKeys.map(async (encryptedKey) => {
                        const key = GroupKey.decryptRSAEncrypted(encryptedKey, this.rsaKeyPair!.getPrivateKey())
                        await store.add(key)
                    }))
                }
            } catch (e: any) {
                this.debug('Error in SubscriberKeyExchange: %s', e.message)
            }    
        }
    }
}
