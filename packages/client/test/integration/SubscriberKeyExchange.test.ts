import 'reflect-metadata'
import {
    KeyExchangeStreamIDUtils,
    StreamMessage,
    StreamPartID,
    StreamPartIDUtils,
} from 'streamr-client-protocol'
import { GroupKey } from '../../src/encryption/GroupKey'
import { Wallet } from 'ethers'
import { Stream } from '../../src/Stream'
import { StreamPermission } from '../../src/permission'
import { FakeEnvironment } from '../test-utils/fake/FakeEnvironment'
import { fastWallet, waitForCondition } from 'streamr-test-utils'
import { 
    createMockMessage,
    createRelativeTestStreamId,
    getGroupKeyStore,
    startPublisherKeyExchangeSubscription
} from '../test-utils/utils'
import { StreamrClient } from '../../src/StreamrClient'
import { NetworkNodeStub } from '../../src'

describe('SubscriberKeyExchange', () => {

    let publisherWallet: Wallet
    let subscriberWallet: Wallet
    let subscriber: StreamrClient
    let streamPartId: StreamPartID
    let environment: FakeEnvironment

    const createStream = async (): Promise<Stream> => {
        const s = await subscriber.createStream(createRelativeTestStreamId(module))
        await s.grantPermissions({
            permissions: [StreamPermission.PUBLISH],
            user: publisherWallet.address
        })
        return s
    }

    const triggerGroupKeyRequest = (key: GroupKey, publisherNode: NetworkNodeStub): void => {
        publisherNode.publish(createMockMessage({
            streamPartId,
            publisher: publisherWallet,
            encryptionKey: key
        }))
    }

    const assertGroupKeyRequest = async (request: StreamMessage, expectedRequestedKeyIds: string[]): Promise<void> => {
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
            StreamPartIDUtils.getStreamID(streamPartId),
            expect.any(String),
            expectedRequestedKeyIds
        ])
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
        const stream = await createStream()
        streamPartId = stream.getStreamParts()[0]
    })

    afterEach(async () => {
        await environment.destroy()
    })

    describe('requests a group key', () => {

        /*
         * A subscriber node requests a group key
         * - tests that a correct kind of request message is sent to a publisher node
         * - tests that we store the received key
        */
        it('happy path', async () => {
            const groupKey = GroupKey.generate()
            const publisher = environment.createClient({
                auth: {
                    privateKey: publisherWallet.privateKey
                },
                encryptionKeys: {
                    [StreamPartIDUtils.getStreamID(streamPartId)]: {
                        [groupKey.id]: groupKey
                    }
                }
            })
            await startPublisherKeyExchangeSubscription(publisher)
            const publisherNode = await publisher.getNode()
            await subscriber.subscribe(streamPartId, () => {})

            triggerGroupKeyRequest(groupKey, publisherNode)
            
            const request = await environment.getNetwork().waitForSentMessage({
                messageType: StreamMessage.MESSAGE_TYPES.GROUP_KEY_REQUEST
            })
            await assertGroupKeyRequest(request!, [groupKey.id])
            const keyPersistence = getGroupKeyStore(StreamPartIDUtils.getStreamID(streamPartId), subscriberWallet.address)
            await waitForCondition(async () => (await keyPersistence.get(groupKey.id)) !== undefined)
        }) 
    })
})
