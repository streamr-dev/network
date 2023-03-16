import 'reflect-metadata'

import { toEthereumAddress, waitForCondition } from '@streamr/utils'
import { Wallet } from '@ethersproject/wallet'
import {
    ContentType,
    EncryptionType,
    StreamMessage,
    StreamMessageType,
    StreamPartID,
    StreamPartIDUtils
} from '@streamr/protocol'
import { fastWallet } from '@streamr/test-utils'
import { GroupKey } from '../../src/encryption/GroupKey'
import { StreamPermission } from '../../src/permission'
import { Stream } from '../../src/Stream'
import { StreamrClient } from '../../src/StreamrClient'
import { FakeEnvironment } from '../test-utils/fake/FakeEnvironment'
import {
    createMockMessage,
    createRelativeTestStreamId,
    getGroupKeyStore
} from '../test-utils/utils'

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

    const triggerGroupKeyRequest = async (key: GroupKey, publisher: StreamrClient): Promise<void> => {
        const publisherNode = await publisher.getNode()
        publisherNode.publish(await createMockMessage({
            streamPartId,
            publisher: publisherWallet,
            encryptionKey: key
        }), publisher.getEntryPoints())
    }

    const assertGroupKeyRequest = async (request: StreamMessage, expectedRequestedKeyIds: string[]): Promise<void> => {
        expect(request).toMatchObject({
            messageId: {
                streamId: StreamPartIDUtils.getStreamID(streamPartId),
                streamPartition:  StreamPartIDUtils.getStreamPartition(streamPartId),
                publisherId: toEthereumAddress(subscriberWallet.address)
            },
            messageType: StreamMessageType.GROUP_KEY_REQUEST,
            contentType: ContentType.JSON,
            encryptionType: EncryptionType.NONE,
            signature: expect.any(String)
        })
        expect(request!.getParsedContent()).toEqual([
            expect.any(String),
            expect.toEqualCaseInsensitive(publisherWallet.address),
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
                }
            })
            await publisher.addEncryptionKey(groupKey, StreamPartIDUtils.getStreamID(streamPartId))
            await subscriber.subscribe(streamPartId, () => {})

            await triggerGroupKeyRequest(groupKey, publisher)

            const request = await environment.getNetwork().waitForSentMessage({
                messageType: StreamMessageType.GROUP_KEY_REQUEST
            })
            await assertGroupKeyRequest(request!, [groupKey.id])
            const keyStore = getGroupKeyStore(toEthereumAddress(subscriberWallet.address))
            await waitForCondition(async () => (await keyStore.get(groupKey.id, StreamPartIDUtils.getStreamID(streamPartId))) !== undefined)
        })
    })
})
