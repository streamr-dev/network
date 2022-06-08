import 'reflect-metadata'
import { DependencyContainer } from 'tsyringe'
import { v4 as uuid } from 'uuid'
import { 
    EthereumAddress,
    MessageID,
    SigningUtil,
    StreamID,
    StreamIDUtils,
    StreamMessage,
    StreamPartIDUtils,
    toStreamPartID
} from 'streamr-client-protocol'
import { StreamRegistry } from '../../src/StreamRegistry'
import { DEFAULT_PARTITION } from '../../src/StreamIDBuilder'
import { GroupKeyStoreFactory } from '../../src/encryption/GroupKeyStoreFactory'
import { GroupKey } from '../../src/encryption/GroupKey'
import { PublisherKeyExchange } from '../../src/encryption/PublisherKeyExchange'
import { waitForCondition } from 'streamr-test-utils'
import { Wallet } from 'ethers'
import { RsaKeyPair } from '../../src/encryption/RsaKeyPair'
import { Stream } from '../../src/Stream'
import { StreamPermission } from '../../src/permission'
import { getGroupKeysFromStreamMessage } from '../../src/encryption/SubscriberKeyExchange'
import { addFakeNode, createFakeContainer } from '../test-utils/fake/fakeEnvironment'

const MOCK_GROUP_KEY = new GroupKey('mock-group-key-id', Buffer.from('mock-group-key-256-bits---------'))

const createMockStream = async (
    subscriberAddress: EthereumAddress,
    fakeContainer: DependencyContainer
) => {
    const streamRegistry = fakeContainer.resolve(StreamRegistry)
    const stream = await streamRegistry.createStream(StreamPartIDUtils.parse('stream#0'))
    streamRegistry.grantPermissions(stream.id, {
        permissions: [StreamPermission.SUBSCRIBE],
        user: subscriberAddress
    })
    return stream
}

const createMockGroupKeyRequest = (
    streamId: StreamID,
    rsaPublicKey: string,
    subscriberWallet: Wallet,
    publisherAddress: EthereumAddress
) => {
    const publisherKeyExchangeStreamId = StreamIDUtils.formKeyExchangeStreamID(publisherAddress)
    const msg = new StreamMessage({
        messageId: new MessageID(publisherKeyExchangeStreamId, DEFAULT_PARTITION, 0, 0, subscriberWallet.address, 'msgChainId'),
        content: JSON.stringify([
            uuid(), 
            streamId,
            rsaPublicKey,
            [MOCK_GROUP_KEY.id]
        ]),
        messageType: StreamMessage.MESSAGE_TYPES.GROUP_KEY_REQUEST,
        encryptionType: StreamMessage.ENCRYPTION_TYPES.NONE,
        contentType: StreamMessage.CONTENT_TYPES.JSON
    })
    msg.signature = SigningUtil.sign(msg.getPayloadToSign(StreamMessage.SIGNATURE_TYPES.ETH), subscriberWallet.privateKey)
    return msg
}

describe('PublisherKeyExchange', () => {

    let publisherWallet: Wallet
    let subscriberWallet: Wallet
    let mockStream: Stream
    let publisherRsaKeyPair: RsaKeyPair
    let fakeContainer: DependencyContainer

    beforeAll(async () => {
        publisherWallet = Wallet.createRandom()
        subscriberWallet = Wallet.createRandom()
        fakeContainer = createFakeContainer({
            auth: {
                privateKey: publisherWallet.privateKey
            }
        })
        mockStream = await createMockStream(subscriberWallet.address, fakeContainer)
        const groupKeyStoreFactory = fakeContainer.resolve(GroupKeyStoreFactory)
        const groupKeyStore = await groupKeyStoreFactory.getStore(mockStream.id)
        groupKeyStore.add(MOCK_GROUP_KEY)
        publisherRsaKeyPair = await RsaKeyPair.create()
    })

    it('responses to a group key request', async () => {
        const publisherKeyExchange = fakeContainer.resolve(PublisherKeyExchange)
        await publisherKeyExchange.useGroupKey(mockStream.id) // subscribes to the key exchange stream

        const groupKeyRequest = createMockGroupKeyRequest(
            mockStream.id,
            publisherRsaKeyPair.getPublicKey(),
            subscriberWallet,
            publisherWallet.address
        )
        const groupKeyResponses: StreamMessage[] = []
        const subscriberNode = addFakeNode(subscriberWallet.address, fakeContainer)
        const subscriberKeyExchangeStreamId = StreamIDUtils.formKeyExchangeStreamID(subscriberWallet.address)
        subscriberNode.addSubscriber(toStreamPartID(subscriberKeyExchangeStreamId, DEFAULT_PARTITION), (msg: StreamMessage) => {
            groupKeyResponses.push(msg)
        })
        subscriberNode.publishToNode(groupKeyRequest)

        await waitForCondition(() => groupKeyResponses.length > 0)
        const groupKeyResponse = groupKeyResponses[0]
        expect(groupKeyResponse).toMatchObject({
            messageId: {
                streamId: subscriberKeyExchangeStreamId,
                streamPartition: DEFAULT_PARTITION,
                publisherId: publisherWallet.address.toLowerCase(),
            },
            messageType: StreamMessage.MESSAGE_TYPES.GROUP_KEY_RESPONSE,
            contentType: StreamMessage.CONTENT_TYPES.JSON,
            encryptionType: StreamMessage.ENCRYPTION_TYPES.RSA,
            signatureType: StreamMessage.SIGNATURE_TYPES.ETH,
            signature: expect.any(String)
        })
        const groupKeys = await getGroupKeysFromStreamMessage(groupKeyResponse, publisherRsaKeyPair.getPrivateKey())
        expect(groupKeys).toHaveLength(1)
        expect(groupKeys[0].hex).toBe(MOCK_GROUP_KEY.hex)
    })
})
