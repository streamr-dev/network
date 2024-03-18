import {
    ContentType,
    EncryptedGroupKey,
    EncryptionType,
    GroupKeyRequest as OldGroupKeyRequest,
    GroupKeyResponse as OldGroupKeyResponse,
    MessageID,
    SignatureType,
    StreamMessage,
    StreamMessageType,
    StreamPartID,
    StreamPartIDUtils
} from '@streamr/protocol'
import { convertBytesToGroupKeyRequest, convertGroupKeyResponseToBytes } from '@streamr/trackerless-network'
import { EthereumAddress, Logger } from '@streamr/utils'
import without from 'lodash/without'
import { inject, Lifecycle, scoped } from 'tsyringe'
import { Authentication, AuthenticationInjectionToken } from '../Authentication'
import { NetworkNodeFacade } from '../NetworkNodeFacade'
import { createSignedMessage } from '../publish/MessageFactory'
import { createRandomMsgChainId } from '../publish/messageChain'
import { StreamRegistry } from '../contracts/StreamRegistry'
import { LoggerFactory } from '../utils/LoggerFactory'
import { validateStreamMessage } from '../utils/validateStreamMessage'
import { EncryptionUtil } from './EncryptionUtil'
import { GroupKey } from './GroupKey'
import { LocalGroupKeyStore } from './LocalGroupKeyStore'
import { ERC1271ContractFacade } from '../contracts/ERC1271ContractFacade'

/*
 * Sends group key responses
 */

enum PublisherMatchType {
    NONE,
    NORMAL,
    ERC1271
}

@scoped(Lifecycle.ContainerScoped)
export class PublisherKeyExchange {

    private readonly networkNodeFacade: NetworkNodeFacade
    private readonly streamRegistry: StreamRegistry
    private readonly erc1271ContractFacade: ERC1271ContractFacade
    private readonly store: LocalGroupKeyStore
    private readonly authentication: Authentication
    private readonly logger: Logger
    private readonly erc1271ContractAddresses = new Set<EthereumAddress>()

    constructor(
        networkNodeFacade: NetworkNodeFacade,
        streamRegistry: StreamRegistry,
        @inject(ERC1271ContractFacade) erc1271ContractFacade: ERC1271ContractFacade,
        store: LocalGroupKeyStore,
        @inject(AuthenticationInjectionToken) authentication: Authentication,
        loggerFactory: LoggerFactory
    ) {
        this.networkNodeFacade = networkNodeFacade
        this.streamRegistry = streamRegistry
        this.erc1271ContractFacade = erc1271ContractFacade
        this.store = store
        this.authentication = authentication
        this.logger = loggerFactory.createLogger(module)
        networkNodeFacade.once('start', async () => {
            const node = await networkNodeFacade.getNode()
            node.addMessageListener((msg: StreamMessage) => this.onMessage(msg))
            this.logger.debug('Started')
        })
    }

    addErc1271ContractAddress(address: EthereumAddress): void {
        this.erc1271ContractAddresses.add(address)
    }

    private async matchPublisherType(publisher: EthereumAddress): Promise<PublisherMatchType> {
        const authenticatedUser = await this.authentication.getAddress()
        if (publisher === authenticatedUser) {
            return PublisherMatchType.NORMAL
        } else if (this.erc1271ContractAddresses.has(publisher)) {
            return PublisherMatchType.ERC1271
        } else {
            return PublisherMatchType.NONE
        }
    }

    private async onMessage(request: StreamMessage): Promise<void> {
        if (OldGroupKeyRequest.is(request)) {
            try {
                const { recipient, requestId, rsaPublicKey, groupKeyIds } = convertBytesToGroupKeyRequest(request.content)
                const matchType = await this.matchPublisherType(recipient)
                if (matchType !== PublisherMatchType.NONE) {
                    this.logger.debug('Handling group key request', { requestId })
                    await validateStreamMessage(request, this.streamRegistry, this.erc1271ContractFacade)
                    const authenticatedUser = await this.authentication.getAddress()
                    const keys = without(
                        await Promise.all(groupKeyIds.map((id: string) => this.store.get(id, authenticatedUser))),
                        undefined) as GroupKey[]
                    if (keys.length > 0) {
                        const response = await this.createResponse(
                            keys,
                            matchType,
                            recipient,
                            request.getStreamPartID(),
                            rsaPublicKey,
                            request.getPublisherId(),
                            requestId
                        )
                        const node = await this.networkNodeFacade.getNode()
                        await node.broadcast(response)
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
        matchType: PublisherMatchType,
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
        const response = createSignedMessage({
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
            authentication: this.authentication,
            signatureType: matchType === PublisherMatchType.NORMAL ? SignatureType.SECP256K1 : SignatureType.ERC_1271,
        })
        return response
    }
}
