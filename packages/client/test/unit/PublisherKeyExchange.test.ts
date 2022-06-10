import 'reflect-metadata'
import { DependencyContainer } from 'tsyringe'
import { v4 as uuid } from 'uuid'
import { 
    EthereumAddress,
    KeyExchangeStreamIDUtils,
    MessageID,
    SigningUtil,
    StreamID,
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
        const publisherKeyExchangeStreamPartId = KeyExchangeStreamIDUtils.formStreamPartID(publisherWallet.address)
        const msg = new StreamMessage({
            messageId: new MessageID(
                StreamPartIDUtils.getStreamID(publisherKeyExchangeStreamPartId),
                StreamPartIDUtils.getStreamPartition(publisherKeyExchangeStreamPartId),
                0,
                0,
                subscriberWallet.address,
                'msgChainId'
            ),
            content: JSON.stringify([
                uuid(), 
                mockStream.id,
                subscriberRsaKeyPair.getPublicKey(),
                [groupKeyId]
            ]),
            messageType: StreamMessage.MESSAGE_TYPES.GROUP_KEY_REQUEST,
            encryptionType: StreamMessage.ENCRYPTION_TYPES.NONE,
            contentType: StreamMessage.CONTENT_TYPES.JSON
        })
        msg.signature = SigningUtil.sign(msg.getPayloadToSign(StreamMessage.SIGNATURE_TYPES.ETH), subscriberWallet.privateKey)
        return msg
    }

    const createExpectedResponse = (): object => {
        const subscriberKeyExchangeStreamPartId = KeyExchangeStreamIDUtils.formStreamPartID(subscriberWallet.address)
        return {
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
        }
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
    
            const response = await receivedResponses.pop()
            expect(response).toMatchObject(createExpectedResponse())
            const actualKeys = await getGroupKeysFromStreamMessage(response, subscriberRsaKeyPair.getPrivateKey())
            expect(actualKeys).toEqual([key])
        })
    })
})
