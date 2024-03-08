import {
    ContentType,
    EncryptionType,
    MessageID,
    GroupKeyRequest as OldGroupKeyRequest,
    GroupKeyResponse as OldGroupKeyResponse,
    SignatureType,
    StreamMessage,
    StreamMessageType,
    StreamPartID,
    StreamPartIDUtils
} from '@streamr/protocol'
import {
    convertBytesToGroupKeyResponse,
    convertGroupKeyRequestToBytes
} from '@streamr/trackerless-network'
import { EthereumAddress, Logger } from '@streamr/utils'
import { Lifecycle, inject, scoped } from 'tsyringe'
import { v4 as uuidv4 } from 'uuid'
import { Authentication, AuthenticationInjectionToken } from '../Authentication'
import { ConfigInjectionToken, StrictStreamrClientConfig } from '../Config'
import { NetworkNodeFacade } from '../NetworkNodeFacade'
import { createSignedMessage } from '../publish/MessageFactory'
import { createRandomMsgChainId } from '../publish/messageChain'
import { StreamRegistry } from '../contracts/StreamRegistry'
import { LoggerFactory } from '../utils/LoggerFactory'
import { pOnce, withThrottling } from '../utils/promises'
import { MaxSizedSet } from '../utils/utils'
import { validateStreamMessage } from '../utils/validateStreamMessage'
import { GroupKey } from './GroupKey'
import { LocalGroupKeyStore } from './LocalGroupKeyStore'
import { RSAKeyPair } from './RSAKeyPair'
import { EIP1271ContractFacade } from '../contracts/EIP1271ContractFacade'

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
    private readonly eip1271ContractFacade: EIP1271ContractFacade
    private readonly store: LocalGroupKeyStore
    private readonly authentication: Authentication
    private readonly logger: Logger
    private readonly ensureStarted: () => Promise<void>
    requestGroupKey: (groupKeyId: string, publisherId: EthereumAddress, streamPartId: StreamPartID) => Promise<void>

    constructor(
        networkNodeFacade: NetworkNodeFacade,
        streamRegistry: StreamRegistry,
        eip1271ContractFacade: EIP1271ContractFacade,
        store: LocalGroupKeyStore,
        @inject(ConfigInjectionToken) config: Pick<StrictStreamrClientConfig, 'encryption'>,
        @inject(AuthenticationInjectionToken) authentication: Authentication,
        loggerFactory: LoggerFactory
    ) {
        this.networkNodeFacade = networkNodeFacade
        this.streamRegistry = streamRegistry
        this.eip1271ContractFacade = eip1271ContractFacade
        this.store = store
        this.authentication = authentication
        this.logger = loggerFactory.createLogger(module)
        this.ensureStarted = pOnce(async () => {
            // eslint-disable-next-line no-underscore-dangle
            this.rsaKeyPair = await RSAKeyPair.create(config.encryption.rsaKeyLength)
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
        await node.broadcast(request)
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
    ): Promise<StreamMessage> {
        const requestContent = new OldGroupKeyRequest({
            recipient: publisherId,
            requestId,
            rsaPublicKey,
            groupKeyIds: [groupKeyId],
        })
        return createSignedMessage({
            messageId: new MessageID(
                StreamPartIDUtils.getStreamID(streamPartId),
                StreamPartIDUtils.getStreamPartition(streamPartId),
                Date.now(),
                0,
                await this.authentication.getAddress(),
                createRandomMsgChainId()
            ),
            content: convertGroupKeyRequestToBytes(requestContent),
            contentType: ContentType.BINARY,
            messageType: StreamMessageType.GROUP_KEY_REQUEST,
            encryptionType: EncryptionType.NONE,
            authentication: this.authentication,
            signatureType: SignatureType.SECP256K1
        })
    }

    private async onMessage(msg: StreamMessage): Promise<void> {
        if (OldGroupKeyResponse.is(msg)) {
            try {
                const authenticatedUser = await this.authentication.getAddress()
                const { requestId, recipient, encryptedGroupKeys } = convertBytesToGroupKeyResponse(msg.content)
                if ((recipient === authenticatedUser) && (this.pendingRequests.has(requestId))) {
                    this.logger.debug('Handle group key response', { requestId })
                    this.pendingRequests.delete(requestId)
                    await validateStreamMessage(msg, this.streamRegistry, this.eip1271ContractFacade)
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
