import 'reflect-metadata'
import { Wallet } from '@ethersproject/wallet'
import { Stream } from '../../src/Stream'
import { FakeEnvironment } from '../test-utils/fake/FakeEnvironment'
import StreamrClient, { StreamPermission } from '../../src'
import { createMockMessage, startPublisherKeyExchangeSubscription } from '../test-utils/utils'
import { GroupKey } from '../../src/encryption/GroupKey'
import { nextValue } from '../../src/utils/iterators'
import { fastWallet } from 'streamr-test-utils'

const MOCK_CONTENT = { foo: 'bar' }

describe('Subscriber', () => {

    let stream: Stream
    let subscriberWallet: Wallet
    let publisherWallet: Wallet
    let subscriber: StreamrClient
    let environment: FakeEnvironment

    beforeEach(async () => {
        subscriberWallet = fastWallet()
        publisherWallet = fastWallet()
        environment = new FakeEnvironment()
        subscriber = environment.createClient({
            auth: {
                privateKey: subscriberWallet.privateKey
            }
        })
        stream = await subscriber.createStream('/path')
    })

    it('without encryption', async () => {
        await stream.grantPermissions({
            permissions: [StreamPermission.PUBLISH],
            public: true
        })

        const sub = await subscriber.subscribe(stream.id)

        const publisherNode = environment.startNode(publisherWallet.address)
        publisherNode.publish(createMockMessage({
            stream,
            publisher: publisherWallet,
            content: MOCK_CONTENT
        }))

        const receivedMessage = await nextValue(sub)
        expect(receivedMessage!.getParsedContent()).toEqual(MOCK_CONTENT)
    })

    it('with encryption', async () => {
        await stream.grantPermissions({
            permissions: [StreamPermission.PUBLISH],
            user: publisherWallet.address
        })

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

        const sub = await subscriber.subscribe(stream.id)

        const publisherNode = await publisher.getNode()
        publisherNode.publish(createMockMessage({
            stream,
            publisher: publisherWallet,
            content: MOCK_CONTENT,
            encryptionKey: groupKey
        }))

        const receivedMessage = await nextValue(sub)
        expect(receivedMessage!.getParsedContent()).toEqual(MOCK_CONTENT)
        expect(receivedMessage!.groupKeyId).toEqual(groupKey.id)
    })
})
