import 'reflect-metadata'

import { Wallet } from '@ethersproject/wallet'
import { StreamMessage } from '@streamr/protocol'
import { fastWallet } from '@streamr/test-utils'
import { collect, toEthereumAddress } from '@streamr/utils'
import { GroupKey } from '../../src/encryption/GroupKey'
import { FakeEnvironment } from '../test-utils/fake/FakeEnvironment'
import { createGroupKeyQueue, createStreamRegistryCached, createTestStream } from '../test-utils/utils'
import { createPrivateKeyAuthentication } from './../../src/Authentication'
import { Stream } from './../../src/Stream'
import { MessageFactory } from './../../src/publish/MessageFactory'
import { FakeStorageNode } from './../test-utils/fake/FakeStorageNode'

const GROUP_KEY = GroupKey.generate()

describe('gap fill', () => {

    let publisherWallet: Wallet
    let stream: Stream
    let storageNode: FakeStorageNode
    let messageFactory: MessageFactory
    let environment: FakeEnvironment

    const createMessage = (timestamp: number) => messageFactory.createMessage({}, { timestamp })

    const publish = (msg: StreamMessage) => environment.getNetwork().send(msg, publisherWallet.address, () => true)

    beforeAll(async () => {
        publisherWallet = fastWallet()
        environment = new FakeEnvironment()
        storageNode = environment.startStorageNode()
        const publisher = environment.createClient({
            auth: {
                privateKey: publisherWallet.privateKey
            }
        })
        stream = await createTestStream(publisher, module)
        await stream.addToStorageNode(storageNode.id)
        const authentication = createPrivateKeyAuthentication(publisherWallet.privateKey, undefined as any)
        messageFactory = new MessageFactory({
            authentication,
            streamId: stream.id,
            streamRegistry: createStreamRegistryCached(),
            groupKeyQueue: await createGroupKeyQueue(authentication, GROUP_KEY)
        })
    })

    afterAll(async () => {
        await environment.destroy()
    })

    it('real-time subscription uses gap fill', async () => {
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

})
