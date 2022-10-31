import 'reflect-metadata'

import { toEthereumAddress } from '@streamr/utils'
import { Wallet } from 'ethers'
import {
    GroupKeyResponse,
    StreamMessage,
    StreamPartID,
    StreamPartIDUtils
} from 'streamr-client-protocol'
import { fastWallet } from 'streamr-test-utils'
import { GroupKey } from '../../src/encryption/GroupKey'
import { StreamPermission } from '../../src/permission'
import { StreamrClient } from '../../src/StreamrClient'
import { FakeEnvironment } from '../test-utils/fake/FakeEnvironment'
import {
    createRelativeTestStreamId,
    startPublisherKeyExchangeSubscription
} from '../test-utils/utils'

describe('PublisherKeyExchange', () => {

    let publisherWallet: Wallet
    let publisherClient: StreamrClient
    let subscriberWallet: Wallet
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

    const triggerGroupKeyRequest = async (): Promise<void> => {
        const subscriberClient = environment.createClient({
            auth: {
                privateKey: subscriberWallet.privateKey
            }
        })
        await subscriberClient.subscribe(streamPartId)
        await publisherClient.publish(streamPartId, {})
    }

    const assertValidResponse = async (actualResponse: StreamMessage, expectedGroupKey: GroupKey): Promise<void> => {
        expect(actualResponse).toMatchObject({
            messageId: {
                streamId: StreamPartIDUtils.getStreamID(streamPartId),
                streamPartition: StreamPartIDUtils.getStreamPartition(streamPartId),
                publisherId: toEthereumAddress(publisherWallet.address),
            },
            messageType: StreamMessage.MESSAGE_TYPES.GROUP_KEY_RESPONSE,
            contentType: StreamMessage.CONTENT_TYPES.JSON,
            encryptionType: StreamMessage.ENCRYPTION_TYPES.RSA,
            signature: expect.any(String)
        })
        const encryptedGroupKeys = (GroupKeyResponse.fromStreamMessage(actualResponse) as GroupKeyResponse).encryptedGroupKeys
        expect(encryptedGroupKeys).toMatchObject([{
            groupKeyId: expectedGroupKey.id,
            encryptedGroupKeyHex: expect.stringMatching(/^[0-9a-f]+$/i)
        }])
    }

    beforeEach(async () => {
        publisherWallet = fastWallet()
        subscriberWallet = fastWallet()
        environment = new FakeEnvironment()
        publisherClient = environment.createClient({
            auth: {
                privateKey: publisherWallet.privateKey
            }
        })
        const stream = await createStream()
        streamPartId = stream.getStreamParts()[0]
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
            await publisherClient.updateEncryptionKey({
                key,
                distributionMethod: 'rekey',
                streamId: StreamPartIDUtils.getStreamID(streamPartId)
            })

            await triggerGroupKeyRequest()

            const response = await environment.getNetwork().waitForSentMessage({
                messageType: StreamMessage.MESSAGE_TYPES.GROUP_KEY_RESPONSE
            })
            await assertValidResponse(response!, key)
        })
    })
})
