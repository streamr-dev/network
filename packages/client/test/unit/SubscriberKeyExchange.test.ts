import 'reflect-metadata'
import {
    KeyExchangeStreamIDUtils,
    StreamMessage,
    StreamPartIDUtils,
} from 'streamr-client-protocol'
import { GroupKey } from '../../src/encryption/GroupKey'
import { Wallet } from 'ethers'
import { Stream } from '../../src/Stream'
import { StreamPermission } from '../../src/permission'
import { SubscriberKeyExchange } from '../../src/encryption/SubscriberKeyExchange'
import { FakeEnvironment } from '../test-utils/fake/FakeEnvironment'
import { startFakePublisherNode } from '../test-utils/fake/fakePublisherNode'
import { nextValue } from '../../src/utils/iterators'
import { fastWallet } from 'streamr-test-utils'
import { addSubscriber, createRelativeTestStreamId } from '../test-utils/utils'
import { StreamrClient } from '../../src/StreamrClient'

const AVAILABLE_GROUP_KEY = GroupKey.generate()

describe('SubscriberKeyExchange', () => {

    let publisherWallet: Wallet
    let subscriberWallet: Wallet
    let subscriber: StreamrClient
    let stream: Stream
    let environment: FakeEnvironment

    const createStream = async (): Promise<Stream> => {
        const stream = await subscriber.createStream(createRelativeTestStreamId(module))
        await stream.grantPermissions({
            permissions: [StreamPermission.PUBLISH],
            user: publisherWallet.address
        })
        return stream
    }

    const testSuccessRequest = async (requestedKeyId: string): Promise<GroupKey | undefined> => {
        const publisherNode = await startFakePublisherNode(publisherWallet, [AVAILABLE_GROUP_KEY], environment)
        const receivedRequests = addSubscriber(publisherNode, KeyExchangeStreamIDUtils.formStreamPartID(publisherWallet.address))

        // @ts-expect-error private
        const subscriberKeyExchange = subscriber.container.resolve(SubscriberKeyExchange)
        const receivedKey = subscriberKeyExchange.getGroupKey({
            getStreamId: () => stream.id,
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
            stream.id,
            expect.any(String),
            [requestedKeyId]
        ])
        return await receivedKey
    }

    beforeEach(async () => {
        publisherWallet = fastWallet()
        subscriberWallet = fastWallet()
        environment = new FakeEnvironment()
        subscriber = environment.createClient({
            auth: {
                privateKey: subscriberWallet.privateKey
            }
        })
        stream = await createStream()
    })

    describe('requests a group key', () => {

        /*
         * A subscriber node requests a group key by calling subscriberKeyExchange.getGroupKey()
         * - tests that a correct kind of request message is sent to a publisher node
         * - tests that we can parse the group key from the response sent by the publisher
        */
        it('happy path', async () => {
            const receivedKey = await testSuccessRequest(AVAILABLE_GROUP_KEY.id)
            expect(receivedKey).toEqual(AVAILABLE_GROUP_KEY)
        })

        it('no group key available', async () => {
            const receivedKey = await testSuccessRequest('unavailable-group-id')
            expect(receivedKey).toBeUndefined()
        })

        it('response error', async () => {
            await startFakePublisherNode(
                publisherWallet,
                [],
                environment,
                async () => 'mock-error-code'
            )

            // @ts-expect-error private
            const subscriberKeyExchange = subscriber.container.resolve(SubscriberKeyExchange)
            const receivedKey = subscriberKeyExchange.getGroupKey({
                getStreamId: () => stream.id,
                getPublisherId: () => publisherWallet.address,
                groupKeyId: 'error-group-key-id'
            } as any)

            await expect(receivedKey).rejects.toThrow()
        })
    })
})
