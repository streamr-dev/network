import 'reflect-metadata'
import { Wallet } from '@ethersproject/wallet'
import { Stream } from '../../src/Stream'
import { FakeEnvironment } from '../test-utils/fake/FakeEnvironment'
import { startFakePublisherNode } from '../test-utils/fake/fakePublisherNode'
import StreamrClient, { StreamPermission } from '../../src'
import { createMockMessage } from '../test-utils/utils'
import { GroupKey } from '../../src/encryption/GroupKey'
import { nextValue } from '../../src/utils/iterators'
import { fastWallet, waitForCondition } from 'streamr-test-utils'

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

        const publisherNode = environment.startFakeNode(publisherWallet.address)
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
        const publisherNode = await startFakePublisherNode(publisherWallet, [groupKey], environment)

        const sub = await subscriber.subscribe(stream.id)

        publisherNode.publish(createMockMessage({
            stream,
            publisher: publisherWallet,
            content: MOCK_CONTENT,
            encryptionKey: groupKey
        }))

        const receivedMessage = await nextValue(sub)
        expect(receivedMessage!.getParsedContent()).toEqual(MOCK_CONTENT)
    })

    it('group key response error', async () => {
        await stream.grantPermissions({
            permissions: [StreamPermission.PUBLISH],
            user: publisherWallet.address
        })
        const publisherNode = await startFakePublisherNode(
            publisherWallet,
            [],
            environment,
            async () => 'mock-error-code'
        )

        const sub = await subscriber.subscribe(stream.id)
        const onError = jest.fn()
        sub.on('error', onError)

        publisherNode.publish(createMockMessage({
            stream,
            publisher: publisherWallet,
            content: MOCK_CONTENT,
            encryptionKey: GroupKey.generate()
        }))

        await waitForCondition(() => onError.mock.calls.length > 0)
        expect(onError.mock.calls[0][0].message).toInclude('GroupKeyErrorResponse')
    })
})
