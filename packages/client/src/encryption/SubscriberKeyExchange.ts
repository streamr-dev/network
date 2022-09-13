import { 
    EncryptedGroupKey,
    EthereumAddress,
    GroupKeyRequest,
    GroupKeyResponse,
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
import { pOnce } from '../utils/promises'
import { Validator } from '../Validator'
import { EncryptionUtil } from './EncryptionUtil'
import { GroupKey, GroupKeyId } from './GroupKey'
import { GroupKeyStoreFactory } from './GroupKeyStoreFactory'
import { RSAKeyPair } from './RSAKeyPair'
import { v4 as uuidv4 } from 'uuid'
import { Debugger } from '../utils/log'
import { Context } from '../utils/Context'
import { instanceId } from '../utils/utils'

/*
 * Sends group key requests and receives group key responses
 */

export async function getGroupKeysFromStreamMessage(streamMessage: StreamMessage, rsaPrivateKey: string): Promise<GroupKey[]> {
    let encryptedGroupKeys: EncryptedGroupKey[] = []
    if (GroupKeyResponse.is(streamMessage)) {
        encryptedGroupKeys = GroupKeyResponse.fromArray(streamMessage.getParsedContent() || []).encryptedGroupKeys || []
    }

    const tasks = encryptedGroupKeys.map(async (encryptedGroupKey) => (
        new GroupKey(
            encryptedGroupKey.groupKeyId,
            EncryptionUtil.decryptWithRSAPrivateKey(encryptedGroupKey.encryptedGroupKeyHex, rsaPrivateKey, true)
        )
    ))
    await Promise.allSettled(tasks)
    return Promise.all(tasks)
}

@scoped(Lifecycle.ContainerScoped)
export class SubscriberKeyExchange {

    private rsaKeyPair: RSAKeyPair | undefined
    private readonly networkNodeFacade: NetworkNodeFacade
    private readonly groupKeyStoreFactory: GroupKeyStoreFactory
    private readonly authentication: Authentication
    private readonly validator: Validator
    private readonly pendingRequests: Set<string> = new Set() // TODO limit the size of the set
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
        const requestId = uuidv4()
        this.debug('Request group key %s, requestId=%s', groupKeyId, requestId)
        await this.ensureStarted()
        const rsaPublicKey = this.rsaKeyPair!.getPublicKey()
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
        const node = await this.networkNodeFacade.getNode()
        node.publish(request)
        this.pendingRequests.add(requestId)
    }

    private async onMessage(msg: StreamMessage<any>): Promise<void> {
        if (GroupKeyResponse.is(msg)) {
            try {
                const authenticatedUser = await this.authentication.getAddress()
                const { requestId, recipient } = GroupKeyResponse.fromStreamMessage(msg) as GroupKeyResponse
                if ((recipient.toLowerCase() === authenticatedUser) && (this.pendingRequests.has(requestId))) {
                    this.debug('Handling group key response %s', requestId)
                    this.pendingRequests.delete(requestId)
                    await this.validator.validate(msg)
                    const keys = await getGroupKeysFromStreamMessage(msg, this.rsaKeyPair!.getPrivateKey())
                    const store = await this.groupKeyStoreFactory.getStore(msg.getStreamId())
                    await Promise.all(keys.map((key) => store.add(key)))
                }
            } catch (e: any) {
                this.debug('Error in SubscriberKeyExchange: %s', e.message)
            }    
        }
    }
}
