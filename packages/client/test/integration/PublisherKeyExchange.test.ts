import 'reflect-metadata'
import { v4 as uuid } from 'uuid'
import {
    GroupKeyResponse,
    StreamMessage,
    StreamPartID,
    StreamPartIDUtils,
} from 'streamr-client-protocol'
import { GroupKey, GroupKeyId } from '../../src/encryption/GroupKey'
import { Wallet } from 'ethers'
import { RSAKeyPair } from '../../src/encryption/RSAKeyPair'
import { StreamPermission } from '../../src/permission'
import { 
    createMockMessage,
    createRelativeTestStreamId,
    getGroupKeyStore,
    startPublisherKeyExchangeSubscription
} from '../test-utils/utils'
import { FakeEnvironment } from '../test-utils/fake/FakeEnvironment'
import { FakeNetworkNode } from '../test-utils/fake/FakeNetworkNode'
import { fastWallet } from 'streamr-test-utils'
import { StreamrClient } from '../../src/StreamrClient'
import { EncryptionUtil } from '../../src/encryption/EncryptionUtil'

describe('PublisherKeyExchange', () => {

    let publisherWallet: Wallet
    let publisherClient: StreamrClient
    let subscriberWallet: Wallet
    let subscriberRSAKeyPair: RSAKeyPair
    let subscriberNode: FakeNetworkNode
    let streamPartId: StreamPartID
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
        groupKeyId: GroupKeyId,
        publisher = subscriberWallet,
        rsaPublicKey = subscriberRSAKeyPair.getPublicKey()
    ): StreamMessage => {
        return createMockMessage({
            streamPartId,
            publisher,
            content: JSON.stringify([
                uuid(),
                publisherWallet.address,
                rsaPublicKey,
                [groupKeyId]
            ]),
            messageType: StreamMessage.MESSAGE_TYPES.GROUP_KEY_REQUEST,
            encryptionType: StreamMessage.ENCRYPTION_TYPES.NONE,
            contentType: StreamMessage.CONTENT_TYPES.JSON,
        })
    }

    const testSuccessResponse = async (actualResponse: StreamMessage, expectedGroupKeys: GroupKey[]): Promise<void> => {
        expect(actualResponse).toMatchObject({
            messageId: {
                streamId: StreamPartIDUtils.getStreamID(streamPartId),
                streamPartition: StreamPartIDUtils.getStreamPartition(streamPartId),
                publisherId: publisherWallet.address.toLowerCase(),
            },
            messageType: StreamMessage.MESSAGE_TYPES.GROUP_KEY_RESPONSE,
            contentType: StreamMessage.CONTENT_TYPES.JSON,
            encryptionType: StreamMessage.ENCRYPTION_TYPES.RSA,
            signatureType: StreamMessage.SIGNATURE_TYPES.ETH,
            signature: expect.any(String)
        })
        const encryptedGroupKeys = (GroupKeyResponse.fromStreamMessage(actualResponse) as GroupKeyResponse).encryptedGroupKeys
        const actualKeys = encryptedGroupKeys.map((encryptedKey) => EncryptionUtil.decryptGroupKeyWithRSAPrivateKey(encryptedKey, subscriberRSAKeyPair.getPrivateKey()))
        expect(actualKeys).toEqual(expectedGroupKeys)
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
        const stream = await createStream()
        streamPartId = stream.getStreamParts()[0]
        subscriberNode = environment.startNode(subscriberWallet.address)
        await startPublisherKeyExchangeSubscription(publisherClient, streamPartId)
    })

    afterEach(async () => {
        await environment.destroy()
    })

    describe('responds to a group key request', () => {

        /*
         * A publisher node starts a subscription to receive group key requests
         * - tests that a correct kind of response message is sent to a subscriber node
         */
        it('happy path', async () => {
            const key = GroupKey.generate()
            await getGroupKeyStore(StreamPartIDUtils.getStreamID(streamPartId), publisherWallet.address).add(key)

            const request = createGroupKeyRequest(key.id)
            subscriberNode.publish(request)

            const response = await environment.getNetwork().waitForSentMessage({
                messageType: StreamMessage.MESSAGE_TYPES.GROUP_KEY_RESPONSE
            })
            await testSuccessResponse(response!, [key])
        })
    })
})
