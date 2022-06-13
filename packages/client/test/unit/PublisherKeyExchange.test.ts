import 'reflect-metadata'
import { DependencyContainer } from 'tsyringe'
import { v4 as uuid } from 'uuid'
import { 
    GroupKeyErrorResponse,
    KeyExchangeStreamIDUtils,
    SigningUtil,
    StreamMessage,
    StreamPartIDUtils,
} from 'streamr-client-protocol'
import { StreamRegistry } from '../../src/StreamRegistry'
import { GroupKeyStoreFactory } from '../../src/encryption/GroupKeyStoreFactory'
import { GroupKey } from '../../src/encryption/GroupKey'
import { PublisherKeyExchange } from '../../src/encryption/PublisherKeyExchange'
import { Wallet } from 'ethers'
import { RsaKeyPair } from '../../src/encryption/RsaKeyPair'
import { Stream } from '../../src/Stream'
import { StreamPermission } from '../../src/permission'
import { getGroupKeysFromStreamMessage } from '../../src/encryption/SubscriberKeyExchange'
import { addFakeNode, createFakeContainer } from '../test-utils/fake/fakeEnvironment'
import { FakeBrubeckNode } from '../test-utils/fake/FakeBrubeckNode'
import { createTestMessage } from '../test-utils/utils'
import { first } from '../../src/utils/GeneratorUtils'

describe('PublisherKeyExchange', () => {

    let publisherWallet: Wallet
    let subscriberWallet: Wallet
    let subscriberRsaKeyPair: RsaKeyPair
    let subscriberNode: FakeBrubeckNode
    let mockStream: Stream
    let fakeContainer: DependencyContainer

    const startPublisherKeyExchangeSubscription = async (): Promise<void> => {
        const publisherKeyExchange = fakeContainer.resolve(PublisherKeyExchange)
        await publisherKeyExchange.useGroupKey(mockStream.id)
    }

    const createStream = async () => {
        const streamRegistry = fakeContainer.resolve(StreamRegistry)
        const stream = await streamRegistry.createStream(StreamPartIDUtils.parse('stream#0'))
        streamRegistry.grantPermissions(stream.id, {
            permissions: [StreamPermission.SUBSCRIBE],
            user: subscriberWallet.address
        })
        return stream
    }
    
    const createGroupKeyRequest = (groupKeyId: string): StreamMessage => {
        return createTestMessage({
            streamPartId: KeyExchangeStreamIDUtils.formStreamPartID(publisherWallet.address),
            publisher: subscriberWallet,
            content: JSON.stringify([
                uuid(), 
                mockStream.id,
                subscriberRsaKeyPair.getPublicKey(),
                [groupKeyId]
            ]),
            messageType: StreamMessage.MESSAGE_TYPES.GROUP_KEY_REQUEST,
            encryptionType: StreamMessage.ENCRYPTION_TYPES.NONE,
            contentType: StreamMessage.CONTENT_TYPES.JSON,
        })
    }

    const testSuccessResponse = async (actualResponse: StreamMessage, expectedGroupKeys: GroupKey[]): Promise<void> => {
        const subscriberKeyExchangeStreamPartId = KeyExchangeStreamIDUtils.formStreamPartID(subscriberWallet.address)
        expect(actualResponse).toMatchObject({
            messageId: {
                streamId: StreamPartIDUtils.getStreamID(subscriberKeyExchangeStreamPartId),
                streamPartition: StreamPartIDUtils.getStreamPartition(subscriberKeyExchangeStreamPartId),
                publisherId: publisherWallet.address.toLowerCase(),
            },
            messageType: StreamMessage.MESSAGE_TYPES.GROUP_KEY_RESPONSE,
            contentType: StreamMessage.CONTENT_TYPES.JSON,
            encryptionType: StreamMessage.ENCRYPTION_TYPES.RSA,
            signatureType: StreamMessage.SIGNATURE_TYPES.ETH,
            signature: expect.any(String)
        })
        const actualKeys = await getGroupKeysFromStreamMessage(actualResponse, subscriberRsaKeyPair.getPrivateKey())
        expect(actualKeys).toEqual(expectedGroupKeys)
    }

    beforeEach(async () => {
        publisherWallet = Wallet.createRandom()
        subscriberWallet = Wallet.createRandom()
        subscriberRsaKeyPair = await RsaKeyPair.create()
        fakeContainer = createFakeContainer({
            auth: {
                privateKey: publisherWallet.privateKey
            }
        })
        mockStream = await createStream()
        subscriberNode = addFakeNode(subscriberWallet.address, fakeContainer)
        await startPublisherKeyExchangeSubscription()
    })

    describe('responds to a group key request', () => {

        /*
         * A publisher node starts a subscription to receive group key requests
         * - tests that a correct kind of response message is sent to a subscriber node
         */
        it('happy path', async () => {
            const key = GroupKey.generate()
            const store = await (await fakeContainer.resolve(GroupKeyStoreFactory)).getStore(mockStream.id)
            await store.add(key)

            const receivedResponses = subscriberNode.addSubscriber(KeyExchangeStreamIDUtils.formStreamPartID(subscriberWallet.address))
    
            const request = createGroupKeyRequest(key.id)
            subscriberNode.publishToNode(request)
    
            const response = await first(receivedResponses)
            await testSuccessResponse(response, [key])
        })

        it('no group key in store', async () => {
            const receivedResponses = subscriberNode.addSubscriber(KeyExchangeStreamIDUtils.formStreamPartID(subscriberWallet.address))
        
            const request = createGroupKeyRequest(GroupKey.generate().id)
            subscriberNode.publishToNode(request)
    
            const response = await first(receivedResponses)
            await testSuccessResponse(response, [])
        })
    
        it('invalid request', async () => {
            const groupKey = GroupKey.generate()
            const receivedResponses = subscriberNode.addSubscriber(KeyExchangeStreamIDUtils.formStreamPartID(subscriberWallet.address))
        
            const request: any = createGroupKeyRequest(groupKey.id)
            delete request.signature
            subscriberNode.publishToNode(request)
    
            const response = await first(receivedResponses)
            const subscriberKeyExchangeStreamPartId = KeyExchangeStreamIDUtils.formStreamPartID(subscriberWallet.address)
            expect(response).toMatchObject({
                messageId: {
                    streamId: StreamPartIDUtils.getStreamID(subscriberKeyExchangeStreamPartId),
                    streamPartition: StreamPartIDUtils.getStreamPartition(subscriberKeyExchangeStreamPartId),
                    publisherId: publisherWallet.address.toLowerCase(),
                },
                messageType: StreamMessage.MESSAGE_TYPES.GROUP_KEY_ERROR_RESPONSE,
                contentType: StreamMessage.CONTENT_TYPES.JSON,
                encryptionType: StreamMessage.ENCRYPTION_TYPES.NONE,
                signatureType: StreamMessage.SIGNATURE_TYPES.ETH,
                signature: expect.any(String)
            })
            expect(GroupKeyErrorResponse.fromArray(response.getParsedContent() as any)).toMatchObject({
                requestId: expect.any(String),
                errorCode: expect.any(String),
                errorMessage: expect.any(String),
                groupKeyIds: [ groupKey.id ]
            })
        })
    })
})
