import 'reflect-metadata'
import { DependencyContainer } from 'tsyringe'
import {
    KeyExchangeStreamIDUtils,
    StreamMessage,
    StreamPartIDUtils,
} from 'streamr-client-protocol'
import { StreamRegistry } from '../../src/registry/StreamRegistry'
import { GroupKey } from '../../src/encryption/GroupKey'
import { Wallet } from 'ethers'
import { Stream } from '../../src/Stream'
import { StreamPermission } from '../../src/permission'
import { SubscriberKeyExchange } from '../../src/encryption/SubscriberKeyExchange'
import { createFakeContainer } from '../test-utils/fake/fakeEnvironment'
import { addFakePublisherNode } from '../test-utils/fake/fakePublisherNode'
import { nextValue } from '../../src/utils/iterators'
import { fastWallet } from 'streamr-test-utils'

const AVAILABLE_GROUP_KEY = GroupKey.generate()

describe('SubscriberKeyExchange', () => {

    let publisherWallet: Wallet
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

    const testSuccessRequest = async (requestedKeyId: string): Promise<GroupKey | undefined> => {
        const publisherNode = await addFakePublisherNode(publisherWallet, [AVAILABLE_GROUP_KEY], fakeContainer)
        const receivedRequests = publisherNode.addSubscriber(KeyExchangeStreamIDUtils.formStreamPartID(publisherWallet.address))

        const subscriberKeyExchange = fakeContainer.resolve(SubscriberKeyExchange)
        const receivedKey = subscriberKeyExchange.getGroupKey({
            getStreamId: () => mockStream.id,
            getPublisherId: () => publisherWallet.address,
            groupKeyId: requestedKeyId
        } as any)

        const request = await nextValue(receivedRequests)
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
        expect(request!.getParsedContent()).toEqual([
            expect.any(String),
            mockStream.id,
            expect.any(String),
            [requestedKeyId]
        ])
        return await receivedKey
    }

    beforeEach(async () => {
        publisherWallet = fastWallet()
        subscriberWallet = fastWallet()
        fakeContainer = createFakeContainer({
            auth: {
                privateKey: subscriberWallet.privateKey
            }
        })
        mockStream = await createStream()
    })

    describe('requests a group key', () => {

        /*
         * A subscriber node requests a group key by calling subscriberKeyExchange.getGroupKey()
         * - tests that a correct kind of request message is sent to a publisher node
         * - tests that we can parse the group key from the response sent by the publisher
        */
        it('happy path', async() => {
            const receivedKey = await testSuccessRequest(AVAILABLE_GROUP_KEY.id)
            expect(receivedKey).toEqual(AVAILABLE_GROUP_KEY)
        })

        it('no group key available', async () => {
            const receivedKey = await testSuccessRequest('unavailable-group-id')
            expect(receivedKey).toBeUndefined()
        })

        it('response error', async () => {
            await addFakePublisherNode(
                publisherWallet,
                [],
                fakeContainer,
                () => 'mock-error-code'
            )

            const subscriberKeyExchange = fakeContainer.resolve(SubscriberKeyExchange)
            const receivedKey = subscriberKeyExchange.getGroupKey({
                getStreamId: () => mockStream.id,
                getPublisherId: () => publisherWallet.address,
                groupKeyId: 'error-group-key-id'
            } as any)

            await expect(receivedKey).rejects.toThrow()
        })
    })
})