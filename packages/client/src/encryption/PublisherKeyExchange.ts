import {
    ContentType,
    EncryptedGroupKey,
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
import { EthereumAddress, Logger } from '@streamr/utils'
import without from 'lodash/without'
import { Lifecycle, inject, scoped } from 'tsyringe'
import { Authentication, AuthenticationInjectionToken } from '../Authentication'
import { NetworkNodeFacade } from '../NetworkNodeFacade'
import { StreamRegistry } from '../contracts/StreamRegistry'
import { StreamrClientEventEmitter } from '../events'
import { convertBytesToGroupKeyRequest, convertGroupKeyResponseToBytes } from '../protocol/oldStreamMessageBinaryUtils'
import { createRandomMsgChainId } from '../publish/messageChain'
import { MessageSigner } from '../signature/MessageSigner'
import { SignatureValidator } from '../signature/SignatureValidator'
import { LoggerFactory } from '../utils/LoggerFactory'
import { validateStreamMessage } from '../utils/validateStreamMessage'
import { EncryptionUtil } from './EncryptionUtil'
import { GroupKey } from './GroupKey'
import { LocalGroupKeyStore } from './LocalGroupKeyStore'

/*
 * Sends group key responses
 */

enum ResponseType {
    NONE,
    NORMAL,
    ERC_1271
}

const logger = new Logger(module)

@scoped(Lifecycle.ContainerScoped)
export class PublisherKeyExchange {

    private readonly networkNodeFacade: NetworkNodeFacade
    private readonly streamRegistry: StreamRegistry
    private readonly signatureValidator: SignatureValidator
    private readonly messageSigner: MessageSigner
    private readonly store: LocalGroupKeyStore
    private readonly authentication: Authentication
    private readonly logger: Logger
    private readonly erc1271ContractAddresses = new Set<EthereumAddress>()

    constructor(
        networkNodeFacade: NetworkNodeFacade,
        streamRegistry: StreamRegistry,
        signatureValidator: SignatureValidator,
        messageSigner: MessageSigner,
        store: LocalGroupKeyStore,
        @inject(AuthenticationInjectionToken) authentication: Authentication,
        eventEmitter: StreamrClientEventEmitter,
        loggerFactory: LoggerFactory
    ) {
        this.networkNodeFacade = networkNodeFacade
        this.streamRegistry = streamRegistry
        this.signatureValidator = signatureValidator
        this.messageSigner = messageSigner
        this.store = store
        this.authentication = authentication
        this.logger = loggerFactory.createLogger(module)
        networkNodeFacade.once('start', async () => {
            networkNodeFacade.addMessageListener((msg: StreamMessage) => this.onMessage(msg))
            this.logger.debug('Started')
        })
        eventEmitter.on('messagePublished', (msg) => {
            if (msg.signatureType === SignatureType.ERC_1271) {
                const address = msg.getPublisherId()
                if (!this.erc1271ContractAddresses.has(address)) {
                    logger.debug('Add ERC-1271 publisher', { address })
                    this.erc1271ContractAddresses.add(address)
                }
            }
        })
    }

    private async onMessage(request: StreamMessage): Promise<void> {
        if (OldGroupKeyRequest.is(request)) {
            try {
                const { recipient, requestId, rsaPublicKey, groupKeyIds } = convertBytesToGroupKeyRequest(request.content)
                const responseType = await this.getResponseType(recipient)
                if (responseType !== ResponseType.NONE) {
                    this.logger.debug('Handling group key request', { requestId, responseType })
                    await validateStreamMessage(request, this.streamRegistry, this.signatureValidator)
                    const authenticatedUser = await this.authentication.getAddress()
                    const keys = without(
                        await Promise.all(groupKeyIds.map((id: string) => this.store.get(id, authenticatedUser))),
                        undefined) as GroupKey[]
                    if (keys.length > 0) {
                        const response = await this.createResponse(
                            keys,
                            responseType,
                            recipient,
                            request.getStreamPartID(),
                            rsaPublicKey,
                            request.getPublisherId(),
                            requestId
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

    private async getResponseType(publisher: EthereumAddress): Promise<ResponseType> {
        const authenticatedUser = await this.authentication.getAddress()
        if (publisher === authenticatedUser) {
            return ResponseType.NORMAL
        } else if (this.erc1271ContractAddresses.has(publisher)) {
            return ResponseType.ERC_1271
        } else {
            return ResponseType.NONE
        }
    }

    private async createResponse(
        keys: GroupKey[],
        responseType: ResponseType,
        publisher: EthereumAddress,
        streamPartId: StreamPartID,
        rsaPublicKey: string,
        recipient: EthereumAddress,
        requestId: string
    ): Promise<StreamMessage> {
        const encryptedGroupKeys = await Promise.all(keys.map((key) => {
            const encryptedGroupKey = EncryptionUtil.encryptWithRSAPublicKey(key.data, rsaPublicKey)
            return new EncryptedGroupKey(key.id, encryptedGroupKey)
        }))
        const responseContent = new OldGroupKeyResponse({
            recipient,
            requestId,
            encryptedGroupKeys
        })
        const response = this.messageSigner.createSignedMessage({
            messageId: new MessageID(
                StreamPartIDUtils.getStreamID(streamPartId),
                StreamPartIDUtils.getStreamPartition(streamPartId),
                Date.now(),
                0,
                publisher,
                createRandomMsgChainId()
            ),
            content: convertGroupKeyResponseToBytes(responseContent),
            contentType: ContentType.BINARY,
            messageType: StreamMessageType.GROUP_KEY_RESPONSE,
            encryptionType: EncryptionType.NONE,
        }, responseType === ResponseType.NORMAL ? SignatureType.SECP256K1 : SignatureType.ERC_1271)
        return response
    }
}
