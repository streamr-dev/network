import 'reflect-metadata'
import { DependencyContainer } from 'tsyringe'
import { 
    GroupKeyErrorResponse,
    GroupKeyRequest,
    GroupKeyRequestSerialized,
    KeyExchangeStreamIDUtils,
    SigningUtil,
    StreamMessage,
    StreamPartIDUtils,
} from 'streamr-client-protocol'
import { StreamRegistry } from '../../src/StreamRegistry'
import { GroupKey } from '../../src/encryption/GroupKey'
import { createGroupKeyResponse } from '../../src/encryption/PublisherKeyExchange'
import { Wallet } from 'ethers'
import { Stream } from '../../src/Stream'
import { StreamPermission } from '../../src/permission'
import { SubscriberKeyExchange } from '../../src/encryption/SubscriberKeyExchange'
import { addFakeNode, createFakeContainer } from '../test-utils/fake/fakeEnvironment'
import { FakeBrubeckNode } from '../test-utils/fake/FakeBrubeckNode'
import { createTestMessage } from '../test-utils/utils'
import { first } from '../../src/utils/GeneratorUtils'

const AVAILABLE_GROUP_KEY = GroupKey.generate()
const UNAVAILABLE_GROUP_KEY = GroupKey.generate()

describe('SubscriberKeyExchange', () => {

    let publisherWallet: Wallet
    let publisherNode: FakeBrubeckNode
    let subscriberWallet: Wallet
    let mockStream: Stream
    let fakeContainer: DependencyContainer

    const createStream = async (): Promise<Stream> => {
        const streamRegistry = fakeContainer.resolve(StreamRegistry)
        const stream = await streamRegistry.createStream(StreamPartIDUtils.parse('stream#0'))
        streamRegistry.grantPermissions(stream.id, {
            permissions: [StreamPermission.PUBLISH],
            user: publisherWallet.address
        })
        return stream
    }

    const testSuccessRequest = (request: StreamMessage, requestedKeyIds: string[]): void => {
        const publisherKeyExchangeStreamPartId = KeyExchangeStreamIDUtils.formStreamPartID(publisherWallet.address)
        expect(request).toMatchObject({
            messageId: {
                streamId: StreamPartIDUtils.getStreamID(publisherKeyExchangeStreamPartId),
                streamPartition:  StreamPartIDUtils.getStreamPartition(publisherKeyExchangeStreamPartId),
                publisherId: subscriberWallet.address.toLowerCase()
            },
            messageType: StreamMessage.MESSAGE_TYPES.GROUP_KEY_REQUEST,
            contentType: StreamMessage.CONTENT_TYPES.JSON,
            encryptionType: StreamMessage.ENCRYPTION_TYPES.NONE,
            signatureType: StreamMessage.SIGNATURE_TYPES.ETH,
            signature: expect.any(String)
        })
        expect(request.getParsedContent()).toEqual([
            expect.any(String),
            mockStream.id,
            expect.any(String),
            requestedKeyIds
        ])
    }

    const createResponseMessage = async (request: StreamMessage<GroupKeyRequestSerialized>): Promise<StreamMessage> => {
        return createTestMessage({
            streamPartId: KeyExchangeStreamIDUtils.formStreamPartID(request.getPublisherId()),
            publisher: publisherWallet,
            content: (await createGroupKeyResponse(
                request,
                async (groupKeyId: string) => (groupKeyId === AVAILABLE_GROUP_KEY.id) ? AVAILABLE_GROUP_KEY : undefined,
                async () => true
            )).serialize(),
            messageType: StreamMessage.MESSAGE_TYPES.GROUP_KEY_RESPONSE,
            encryptionType: StreamMessage.ENCRYPTION_TYPES.RSA,
        })
    }

    beforeEach(async () => {
        publisherWallet = Wallet.createRandom()
        subscriberWallet = Wallet.createRandom()
        fakeContainer = createFakeContainer({
            auth: {
                privateKey: subscriberWallet.privateKey
            }
        })
        mockStream = await createStream()
        publisherNode = addFakeNode(publisherWallet.address, fakeContainer)
    })

    describe('requests a group key', () => {

        /*
         * A subscriber node requests a group key by calling subscriberKeyExchange.getGroupKey()
         * - tests that a correct kind of request message is sent to a publisher node
         * - tests that we can parse the group key from the response sent by the publisher
        */
        it('happy path', async() => {
            const receivedRequests = publisherNode.addSubscriber(KeyExchangeStreamIDUtils.formStreamPartID(publisherWallet.address))
        
            const subscriberKeyExchange = fakeContainer.resolve(SubscriberKeyExchange)
            const receivedKey = subscriberKeyExchange.getGroupKey({
                getStreamId: () => mockStream.id,
                getPublisherId: () => publisherWallet.address,
                groupKeyId: AVAILABLE_GROUP_KEY.id
            } as any)
            
            const groupKeyRequest = await first(receivedRequests)
            testSuccessRequest(groupKeyRequest, [ AVAILABLE_GROUP_KEY.id ])
            
            const response = await createResponseMessage(groupKeyRequest as any) 
            publisherNode.publishToNode(response)
            
            expect((await receivedKey)!).toEqual(AVAILABLE_GROUP_KEY)
        })

        it.skip('no group key available', async () => {
            const receivedRequests = publisherNode.addSubscriber(KeyExchangeStreamIDUtils.formStreamPartID(publisherWallet.address))
        
            const subscriberKeyExchange = fakeContainer.resolve(SubscriberKeyExchange)
            const receivedKey = subscriberKeyExchange.getGroupKey({
                getStreamId: () => mockStream.id,
                getPublisherId: () => publisherWallet.address,
                groupKeyId: UNAVAILABLE_GROUP_KEY.id
            } as any)
            
            const groupKeyRequest = await first(receivedRequests)
            testSuccessRequest(groupKeyRequest, [ UNAVAILABLE_GROUP_KEY.id ])
            
            const response = await createResponseMessage(groupKeyRequest as any) 
            publisherNode.publishToNode(response)
            
            expect((await receivedKey)!).toBeUndefined()
        })

        it.skip('response error', async () => {
            const receivedRequests = publisherNode.addSubscriber(KeyExchangeStreamIDUtils.formStreamPartID(publisherWallet.address))

            const subscriberKeyExchange = fakeContainer.resolve(SubscriberKeyExchange)
            const receivedKey = subscriberKeyExchange.getGroupKey({
                getStreamId: () => mockStream.id,
                getPublisherId: () => publisherWallet.address,
                groupKeyId: UNAVAILABLE_GROUP_KEY.id
            } as any)

            const groupKeyRequest = await first(receivedRequests)
            const requestId = GroupKeyRequest.fromArray((groupKeyRequest as any).getParsedContent()).requestId

            const response = createTestMessage({
                streamPartId: KeyExchangeStreamIDUtils.formStreamPartID(subscriberWallet.address),
                publisher: publisherWallet,
                messageType: StreamMessage.MESSAGE_TYPES.GROUP_KEY_ERROR_RESPONSE,
                contentType: StreamMessage.CONTENT_TYPES.JSON,
                encryptionType: StreamMessage.ENCRYPTION_TYPES.NONE,
                content: new GroupKeyErrorResponse({
                    requestId,
                    streamId: mockStream.id,
                    errorCode: 'UNEXPECTED_ERROR',
                    errorMessage: '',
                    groupKeyIds: [ UNAVAILABLE_GROUP_KEY.id ]
                }).serialize(),
            })
            publisherNode.publishToNode(response)
            
            expect(receivedKey).rejects.toThrow()
        })
    })
})