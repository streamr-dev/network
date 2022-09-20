import 'reflect-metadata'
import { StreamMessage } from 'streamr-client-protocol'
import { GroupKey } from '../../src/encryption/GroupKey'
import { createMockMessage, startPublisherKeyExchangeSubscription } from '../test-utils/utils'
import { Stream } from '../../src/Stream'
import { fastWallet } from 'streamr-test-utils'
import { StreamPermission } from '../../src/permission'
import { FakeStorageNode } from '../test-utils/fake/FakeStorageNode'
import { StreamrClient } from '../../src/StreamrClient'
import { FakeEnvironment } from '../test-utils/fake/FakeEnvironment'
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
            user: publisherWallet.address,
            permissions: [StreamPermission.PUBLISH]
        })
        storageNode = environment.startStorageNode()
        subscriber.addStreamToStorageNode(stream.id, storageNode.id)
    })

    afterAll(async () => {
        await environment.destroy()
    })

    it('happy path', async () => {
        const groupKey = GroupKey.generate()
        const publisher = environment.createClient({
            auth: {
                privateKey: publisherWallet.privateKey
            },
            encryptionKeys: {
                [stream.id]: {
                    [groupKey.id]: groupKey
                }
            }
        })
    
        await startPublisherKeyExchangeSubscription(publisher)

        const historicalMessage = createMockMessage({
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

        const receivedMessage1 = await nextValue(sub)

        await publisher.publish(stream.id, { mockId: 2 }, { timestamp: 2000 })

        const receivedMessage2 = await nextValue(sub)
        expect(receivedMessage1!.getParsedContent()).toEqual({
            mockId: 1
        })
        expect(receivedMessage1!.groupKeyId).toBe(groupKey.id)
        expect(receivedMessage2!.getParsedContent()).toEqual({
            mockId: 2
        })
        expect(receivedMessage2!.groupKeyId).toBe(groupKey.id)
        const groupKeyRequests = environment.getNetwork().getSentMessages({
            messageType: StreamMessage.MESSAGE_TYPES.GROUP_KEY_REQUEST
        })
        expect(groupKeyRequests.length).toBe(1)
    })
})
