import 'reflect-metadata'

import { fastWallet } from '@streamr/test-utils'
import { Stream } from '../../src/Stream'
import { StreamrClient } from '../../src/StreamrClient'
import { GroupKey } from '../../src/encryption/GroupKey'
import { StreamPermission } from '../../src/permission'
import { StreamMessageType } from '../../src/protocol/StreamMessage'
import { convertBytesToGroupKeyRequest } from '../../src/protocol/oldStreamMessageBinaryUtils'
import { FakeEnvironment } from '../test-utils/fake/FakeEnvironment'
import { FakeStorageNode } from '../test-utils/fake/FakeStorageNode'
import { createMockMessage, startPublisherKeyExchangeSubscription } from '../test-utils/utils'
import { nextValue } from './../../src/utils/iterators'

/*
 * Subscriber fetches a historical message and can use the encryption key from the message
 * to decrypt a realtime message
 */
describe('resend and subscribe', () => {
    const subscriberWallet = fastWallet()
    const publisherWallet = fastWallet()
    let subscriber: StreamrClient
    let stream: Stream
    let storageNode: FakeStorageNode
    let environment: FakeEnvironment

    beforeAll(async () => {
        environment = new FakeEnvironment()
        subscriber = environment.createClient({
            auth: {
                privateKey: subscriberWallet.privateKey
            }
        })
        stream = await subscriber.createStream('/path')
        await stream.grantPermissions({
            userId: publisherWallet.address,
            permissions: [StreamPermission.PUBLISH]
        })
        storageNode = await environment.startStorageNode()
        subscriber.addStreamToStorageNode(stream.id, storageNode.getAddress())
    })

    afterAll(async () => {
        await environment.destroy()
    })

    it('happy path', async () => {
        const groupKey = GroupKey.generate()
        const publisher = environment.createClient({
            auth: {
                privateKey: publisherWallet.privateKey
            }
        })
        await publisher.updateEncryptionKey({
            key: groupKey,
            streamId: stream.id,
            distributionMethod: 'rekey'
        })
        await startPublisherKeyExchangeSubscription(publisher, (await stream.getStreamParts())[0])

        const historicalMessage = await createMockMessage({
            timestamp: 1000,
            encryptionKey: groupKey,
            stream,
            publisher: publisherWallet,
            content: {
                mockId: 1
            }
        })
        storageNode.storeMessage(historicalMessage)

        const sub = await subscriber.subscribe({
            streamId: stream.id,
            partition: 0,
            resend: {
                last: 1
            }
        })
        const messageIterator = sub[Symbol.asyncIterator]()

        const receivedMessage1 = await nextValue(messageIterator)

        await publisher.publish(stream.id, { mockId: 2 }, { timestamp: 2000 })

        const receivedMessage2 = await nextValue(messageIterator)
        expect(receivedMessage1!.content).toEqual({
            mockId: 1
        })
        expect(receivedMessage1!.streamMessage.groupKeyId).toBe(groupKey.id)
        expect(receivedMessage2!.content).toEqual({
            mockId: 2
        })
        expect(receivedMessage2!.streamMessage.groupKeyId).toBe(groupKey.id)
        const groupKeyRequests = environment.getNetwork().getSentMessages({
            messageType: StreamMessageType.GROUP_KEY_REQUEST
        })
        expect(groupKeyRequests.length).toBe(1)
        expect(convertBytesToGroupKeyRequest(groupKeyRequests[0].content).groupKeyIds).toEqual([groupKey.id])
    })
})
