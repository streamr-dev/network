import 'reflect-metadata'

import { Wallet } from '@ethersproject/wallet'
import { toEthereumAddress } from '@streamr/utils'
import { fastWallet } from '@streamr/test-utils'
import { GroupKey } from '../../src/encryption/GroupKey'
import { StreamPermission } from '../../src/permission'
import { Stream } from '../../src/Stream'
import { StreamrClient } from '../../src/StreamrClient'
import { nextValue } from '../../src/utils/iterators'
import { FakeEnvironment } from '../test-utils/fake/FakeEnvironment'
import { createMockMessage } from '../test-utils/utils'

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

    afterEach(async () => {
        await environment.destroy()
    })

    describe('normal subscription', () => {

        it('without encryption', async () => {
            await stream.grantPermissions({
                permissions: [StreamPermission.PUBLISH],
                public: true
            })
    
            const sub = await subscriber.subscribe(stream.id)
    
            const publisherNode = environment.startNode(publisherWallet.address)
            publisherNode.publish(await createMockMessage({
                stream,
                publisher: publisherWallet,
                content: MOCK_CONTENT
            }))
    
            const receivedMessage = await nextValue(sub[Symbol.asyncIterator]())
            expect(receivedMessage!.content).toEqual(MOCK_CONTENT)
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
                }
            })
            await publisher.addEncryptionKey(groupKey, toEthereumAddress(publisherWallet.address))
    
            const sub = await subscriber.subscribe(stream.id)
    
            const publisherNode = await publisher.getNode()
            publisherNode.publish(await createMockMessage({
                stream,
                publisher: publisherWallet,
                content: MOCK_CONTENT,
                encryptionKey: groupKey
            }))
    
            const receivedMessage = await nextValue(sub[Symbol.asyncIterator]())
            expect(receivedMessage!.content).toEqual(MOCK_CONTENT)
            expect(receivedMessage!.streamMessage.groupKeyId).toEqual(groupKey.id)
        })

    })

    describe('raw subscription', () => {

        it('without encryption', async () => {
            await stream.grantPermissions({
                permissions: [StreamPermission.PUBLISH],
                public: true
            })
    
            const sub = await subscriber.subscribe({ streamId: stream.id, raw: true })
    
            const publisherNode = environment.startNode(publisherWallet.address)
            publisherNode.publish(await createMockMessage({
                stream,
                publisher: publisherWallet,
                content: MOCK_CONTENT
            }))
    
            const receivedMessage = await nextValue(sub[Symbol.asyncIterator]())
            expect(receivedMessage!.content).toEqual(MOCK_CONTENT)
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
                }
            })
            await publisher.addEncryptionKey(groupKey, toEthereumAddress(publisherWallet.address))
    
            const sub = await subscriber.subscribe({ streamId: stream.id, raw: true })
    
            const publisherNode = await publisher.getNode()
            publisherNode.publish(await createMockMessage({
                stream,
                publisher: publisherWallet,
                content: MOCK_CONTENT,
                encryptionKey: groupKey
            }))
    
            const receivedMessage = await nextValue(sub[Symbol.asyncIterator]())
            expect(receivedMessage!.content).toBeString()
            expect(receivedMessage!.streamMessage.groupKeyId).toEqual(groupKey.id)
        })
    })
})
