import 'reflect-metadata'
import { DependencyContainer } from 'tsyringe'
import { Wallet } from '@ethersproject/wallet'
import { Stream } from '../../src/Stream'
import { StreamRegistry } from '../../src/StreamRegistry'
import { Subscriber } from '../../src/subscribe/Subscriber'
import { addFakeNode, createFakeContainer } from '../test-utils/fake/fakeEnvironment'
import { addFakePublisherNode } from '../test-utils/fake/fakePublisherNode'
import { StreamPermission } from '../../src'
import { createTestMessage } from '../test-utils/utils'
import { GroupKey } from '../../src/encryption/GroupKey'
import { first } from '../../src/utils/GeneratorUtils'
import { waitForCondition } from 'streamr-test-utils'
import { StreamMessage } from 'streamr-client-protocol'

const MOCK_CONTENT = { foo: 'bar' }

describe('Subscriber', () => {

    let stream: Stream
    let subscriberWallet: Wallet
    let publisherWallet: Wallet
    let dependencyContainer: DependencyContainer

    const createMockMessage = (groupKey?: GroupKey): StreamMessage => {
        return createTestMessage({
            streamPartId: stream.getStreamParts()[0],
            publisher: publisherWallet,
            content: MOCK_CONTENT,
            encryptionKey: groupKey
        })
    }

    beforeEach(async () => {
        subscriberWallet = Wallet.createRandom()
        publisherWallet = Wallet.createRandom()
        dependencyContainer = createFakeContainer({
            auth: {
                privateKey: subscriberWallet.privateKey
            }
        })
        const streamRegistry = dependencyContainer.resolve(StreamRegistry)
        stream = await streamRegistry.createStream('/path')
    })

    it('without encryption', async () => {
        await stream.grantPermissions({
            permissions: [StreamPermission.PUBLISH],
            public: true
        })

        const subscriber = dependencyContainer.resolve(Subscriber)
        const sub = await subscriber.subscribe(stream.id)

        const publisherNode = addFakeNode(publisherWallet.address, dependencyContainer)
        publisherNode.publishToNode(createMockMessage())

        const receivedMessage = await first(sub)
        expect(receivedMessage.getParsedContent()).toEqual(MOCK_CONTENT)
    })

    it('with encryption', async () => {
        await stream.grantPermissions({
            permissions: [StreamPermission.PUBLISH],
            user: publisherWallet.address
        })

        const groupKey = GroupKey.generate()
        const publisherNode = await addFakePublisherNode(publisherWallet, [groupKey], dependencyContainer)

        const subscriber = dependencyContainer.resolve(Subscriber)
        const sub = await subscriber.subscribe(stream.id)

        publisherNode.publishToNode(createMockMessage(groupKey))

        const receivedMessage = await first(sub)
        expect(receivedMessage.getParsedContent()).toEqual(MOCK_CONTENT)
    })

    it('group key response error', async () => {
        await stream.grantPermissions({
            permissions: [StreamPermission.PUBLISH],
            user: publisherWallet.address
        })
        const publisherNode = await addFakePublisherNode(
            publisherWallet,
            [],
            dependencyContainer,
            () => 'mock-error-code'
        )

        const subscriber = dependencyContainer.resolve(Subscriber)
        const sub = await subscriber.subscribe(stream.id)
        const onError = jest.fn()
        sub.on('error', onError)

        publisherNode.publishToNode(createMockMessage(GroupKey.generate()))

        await waitForCondition(() => onError.mock.calls.length > 0)
        expect(onError.mock.calls[0][0].message).toInclude('GroupKeyErrorResponse')
    })
})
