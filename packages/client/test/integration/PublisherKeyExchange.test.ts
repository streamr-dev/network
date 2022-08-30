import 'reflect-metadata'
import { v4 as uuid } from 'uuid'
import {
    GroupKeyErrorResponse,
    KeyExchangeStreamIDUtils,
    StreamMessage,
    StreamPartIDUtils,
} from 'streamr-client-protocol'
import { GroupKey } from '../../src/encryption/GroupKey'
import { Wallet } from 'ethers'
import { RSAKeyPair } from '../../src/encryption/RSAKeyPair'
import { Stream } from '../../src/Stream'
import { StreamPermission } from '../../src/permission'
import { 
    addSubscriber,
    createMockMessage,
    createRelativeTestStreamId,
    getGroupKeyStore,
    startPublisherKeyExchangeSubscription
} from '../test-utils/utils'
import { getGroupKeysFromStreamMessage } from '../../src/encryption/SubscriberKeyExchange'
import { FakeEnvironment } from '../test-utils/fake/FakeEnvironment'
import { FakeNetworkNode } from '../test-utils/fake/FakeNetworkNode'
import { nextValue } from '../../src/utils/iterators'
import { fastWallet } from 'streamr-test-utils'
import { StreamrClient } from '../../src/StreamrClient'

describe('PublisherKeyExchange', () => {

    let publisherWallet: Wallet
    let publisherClient: StreamrClient
    let subscriberWallet: Wallet
    let subscriberRSAKeyPair: RSAKeyPair
    let subscriberNode: FakeNetworkNode
    let mockStream: Stream
    let environment: FakeEnvironment

    const createStream = async () => {
        const stream = await publisherClient.createStream(createRelativeTestStreamId(module))
        await publisherClient.grantPermissions(stream.id, {
            permissions: [StreamPermission.SUBSCRIBE],
            user: subscriberWallet.address
        })
        return stream
    }

    const createGroupKeyRequest = (
        groupKeyId: string,
        publisher = subscriberWallet,
        rsaPublicKey = subscriberRSAKeyPair.getPublicKey()
    ): StreamMessage => {
        return createMockMessage({
            streamPartId: KeyExchangeStreamIDUtils.formStreamPartID(publisherWallet.address),
            publisher,
            content: JSON.stringify([
                uuid(),
                mockStream.id,
                rsaPublicKey,
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
        const actualKeys = await getGroupKeysFromStreamMessage(actualResponse, subscriberRSAKeyPair.getPrivateKey())
        expect(actualKeys).toEqual(expectedGroupKeys)
    }

    const testErrorResponse = async (
        actualResponse: StreamMessage,
        expectedGroupKeyIds: string[],
        expectedRecipientAddress = subscriberWallet.address
    ): Promise<void> => {
        const subscriberKeyExchangeStreamPartId = KeyExchangeStreamIDUtils.formStreamPartID(expectedRecipientAddress)
        expect(actualResponse).toMatchObject({
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
        expect(GroupKeyErrorResponse.fromArray(actualResponse!.getParsedContent() as any)).toMatchObject({
            requestId: expect.any(String),
            errorCode: expect.any(String),
            errorMessage: expect.any(String),
            groupKeyIds: expectedGroupKeyIds
        })
    }

    beforeEach(async () => {
        publisherWallet = fastWallet()
        subscriberWallet = fastWallet()
        subscriberRSAKeyPair = await RSAKeyPair.create()
        environment = new FakeEnvironment()
        publisherClient = environment.createClient({
            auth: {
                privateKey: publisherWallet.privateKey
            }
        })
        mockStream = await createStream()
        subscriberNode = environment.startNode(subscriberWallet.address)
        await startPublisherKeyExchangeSubscription(publisherClient)
    })

    describe('responds to a group key request', () => {

        /*
         * A publisher node starts a subscription to receive group key requests
         * - tests that a correct kind of response message is sent to a subscriber node
         */
        it('happy path', async () => {
            const key = GroupKey.generate()
            await getGroupKeyStore(mockStream.id, publisherWallet.address).add(key)

            const receivedResponses = addSubscriber(subscriberNode, KeyExchangeStreamIDUtils.formStreamPartID(subscriberWallet.address))

            const request = createGroupKeyRequest(key.id)
            subscriberNode.publish(request)

            const response = await nextValue(receivedResponses)
            await testSuccessResponse(response!, [key])
        })

        it('no group key in store', async () => {
            const receivedResponses = addSubscriber(subscriberNode, KeyExchangeStreamIDUtils.formStreamPartID(subscriberWallet.address))

            const request = createGroupKeyRequest(GroupKey.generate().id)
            subscriberNode.publish(request)

            const response = await nextValue(receivedResponses)
            await testSuccessResponse(response!, [])
        })

        it('request from non-subscriber', async () => {
            const groupKey = GroupKey.generate()
            const otherWallet = fastWallet()
            const otherNode = environment.startNode(otherWallet.address)
            const receivedResponses = addSubscriber(otherNode, KeyExchangeStreamIDUtils.formStreamPartID(otherWallet.address))

            const request = createGroupKeyRequest(groupKey.id, otherWallet, (await RSAKeyPair.create()).getPublicKey())
            otherNode.publish(request)

            const response = await nextValue(receivedResponses)
            await testErrorResponse(response!, [ groupKey.id ], otherWallet.address)
        })

        it('invalid request', async () => {
            const groupKey = GroupKey.generate()
            const receivedResponses = addSubscriber(subscriberNode, KeyExchangeStreamIDUtils.formStreamPartID(subscriberWallet.address))

            const request: any = createGroupKeyRequest(groupKey.id)
            delete request.signature
            subscriberNode.publish(request)

            const response = await nextValue(receivedResponses)
            await testErrorResponse(response!, [ groupKey.id ])
        })
    })
})
