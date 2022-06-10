import 'reflect-metadata'
import { DependencyContainer } from 'tsyringe'
import { 
    EthereumAddress,
    GroupKeyRequestSerialized,
    KeyExchangeStreamIDUtils,
    MessageID,
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

const MOCK_GROUP_KEY = new GroupKey('mock-group-key-id', Buffer.from('mock-group-key-256-bits---------'))

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

    const testSuccessRequest = (request: StreamMessage): void => {
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
            [ MOCK_GROUP_KEY.id ]
        ])
    }

    const createResponseMessage = async (request: StreamMessage<GroupKeyRequestSerialized>): Promise<StreamMessage> => {
        const subscriberAddress = request.getPublisherId()
        const subscriberKeyExchangeStreamPartId = KeyExchangeStreamIDUtils.formStreamPartID(subscriberAddress)
        const msg = new StreamMessage({
            messageId: new MessageID(
                StreamPartIDUtils.getStreamID(subscriberKeyExchangeStreamPartId),
                StreamPartIDUtils.getStreamPartition(subscriberKeyExchangeStreamPartId),
                0,
                0,
                publisherWallet.address,
                'msgChainId'
            ),
            content: (await createGroupKeyResponse(
                request,
                async (groupKeyId: string) => (groupKeyId === MOCK_GROUP_KEY.id) ? MOCK_GROUP_KEY : undefined,
                async () => true
            )).serialize(),
            messageType: StreamMessage.MESSAGE_TYPES.GROUP_KEY_RESPONSE,
            encryptionType: StreamMessage.ENCRYPTION_TYPES.RSA
        })
        msg.signature = SigningUtil.sign(msg.getPayloadToSign(StreamMessage.SIGNATURE_TYPES.ETH), publisherWallet.privateKey)
        return msg
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
                groupKeyId: MOCK_GROUP_KEY.id
            } as any)
            
            const groupKeyRequest = await receivedRequests.pop()
            testSuccessRequest(groupKeyRequest)
            
            const response = await createResponseMessage(groupKeyRequest as any) 
            publisherNode.publishToNode(response)
            
            expect((await receivedKey)!).toEqual(MOCK_GROUP_KEY)
        })
    })
})