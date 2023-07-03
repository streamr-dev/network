import 'reflect-metadata'

import { Wallet } from '@ethersproject/wallet'
import { StreamMessage } from '@streamr/protocol'
import { fastWallet } from '@streamr/test-utils'
import { collect, toEthereumAddress } from '@streamr/utils'
import { GroupKey } from '../../src/encryption/GroupKey'
import { FakeEnvironment } from '../test-utils/fake/FakeEnvironment'
import { createGroupKeyQueue, createStreamRegistry, createTestStream, startFailingStorageNode } from '../test-utils/utils'
import { createPrivateKeyAuthentication } from './../../src/Authentication'
import { Stream } from './../../src/Stream'
import { MessageFactory } from './../../src/publish/MessageFactory'

const GROUP_KEY = GroupKey.generate()

describe('gap fill', () => {

    let publisherWallet: Wallet
    let stream: Stream
    let messageFactory: MessageFactory
    let environment: FakeEnvironment

    const createMessage = (timestamp: number) => messageFactory.createMessage({}, { timestamp })

    const publish = (msg: StreamMessage) => environment.getNetwork().send(msg, publisherWallet.address, () => true)

    beforeEach(async () => {
        publisherWallet = fastWallet()
        environment = new FakeEnvironment()
        const publisher = environment.createClient({
            auth: {
                privateKey: publisherWallet.privateKey
            }
        })
        stream = await createTestStream(publisher, module)
        const authentication = createPrivateKeyAuthentication(publisherWallet.privateKey, undefined as any)
        messageFactory = new MessageFactory({
            authentication,
            streamId: stream.id,
            streamRegistry: createStreamRegistry(),
            groupKeyQueue: await createGroupKeyQueue(authentication, GROUP_KEY)
        })
    })

    afterEach(async () => {
        await environment.destroy()
    })

    it('happy path', async () => {
        const storageNode = await environment.startStorageNode()
        await stream.addToStorageNode(storageNode.id)
        const subscriber = environment.createClient({
            gapFillTimeout: 50
        })
        subscriber.addEncryptionKey(GROUP_KEY, toEthereumAddress(publisherWallet.address))
        const sub = await subscriber.subscribe(stream.id)
        const receivedMessages = collect(sub, 3)
        publish(await createMessage(1000))
        storageNode.storeMessage(await createMessage(2000))
        publish(await createMessage(3000))
        expect((await receivedMessages).map((m) => m.timestamp)).toEqual([1000, 2000, 3000])
    })

    it('failing storage node', async () => {
        const storageNode = await startFailingStorageNode(new Error('expected'), environment)
        await stream.addToStorageNode(storageNode.id)
        const subscriber = environment.createClient({
            gapFillTimeout: 50
        })
        subscriber.addEncryptionKey(GROUP_KEY, toEthereumAddress(publisherWallet.address))
        const sub = await subscriber.subscribe(stream.id)
        const receivedMessages = collect(sub, 2)
        publish(await createMessage(1000))
        await createMessage(2000)
        publish(await createMessage(3000))
        expect((await receivedMessages).map((m) => m.timestamp)).toEqual([1000, 3000])
    })

})
