import { createTestWallet, testOnlyInNodeJs } from '@streamr/test-utils'
import { collect } from '@streamr/utils'
import { Wallet } from 'ethers'
import { mock } from 'jest-mock-extended'
import { GroupKey } from '../../src/encryption/GroupKey'
import { StreamMessage } from '../../src/protocol/StreamMessage'
import { SignatureValidator } from '../../src/signature/SignatureValidator'
import { FakeEnvironment } from '../test-utils/fake/FakeEnvironment'
import { createGroupKeyQueue, createMessageSigner, createStreamRegistry, createTestStream, startFailingStorageNode } from '../test-utils/utils'
import { Stream } from './../../src/Stream'
import { MessageFactory } from './../../src/publish/MessageFactory'
import { EthereumKeyPairIdentity } from '../../src/identity/EthereumKeyPairIdentity'
import { createStrictConfig } from '../../src/Config'

const GROUP_KEY = GroupKey.generate()

describe('gap fill', () => {

    let publisherWallet: Wallet
    let stream: Stream
    let messageFactory: MessageFactory
    let environment: FakeEnvironment

    const createMessage = (timestamp: number) => messageFactory.createMessage({}, { timestamp })

    const publish = async (msg: StreamMessage) => {
        const node = environment.createNode()
        await node.broadcast(msg)
    }

    beforeEach(async () => {
        publisherWallet = await createTestWallet()
        environment = new FakeEnvironment()
        const publisher = environment.createClient({
            auth: {
                privateKey: publisherWallet.privateKey
            }
        })
        stream = await createTestStream(publisher, module)
        const identity = EthereumKeyPairIdentity.fromPrivateKey(publisherWallet.privateKey)
        messageFactory = new MessageFactory({
            identity,
            streamId: stream.id,
            streamRegistry: createStreamRegistry(),
            groupKeyQueue: await createGroupKeyQueue(identity, GROUP_KEY),
            signatureValidator: mock<SignatureValidator>(),
            messageSigner: createMessageSigner(identity),
            config: createStrictConfig()
        })
    })

    afterEach(async () => {
        await environment.destroy()
    })

    it('happy path', async () => {
        const storageNode = await environment.startStorageNode()
        await stream.addToStorageNode(storageNode.getAddress())
        const subscriber = environment.createClient({
            gapFillTimeout: 50
        })
        subscriber.addEncryptionKey(GROUP_KEY, publisherWallet.address)
        const sub = await subscriber.subscribe(stream.id)
        const receivedMessages = collect(sub, 3)
        await publish(await createMessage(1000))
        storageNode.storeMessage(await createMessage(2000))
        await publish(await createMessage(3000))
        expect((await receivedMessages).map((m) => m.timestamp)).toEqual([1000, 2000, 3000])
    })

    testOnlyInNodeJs('failing storage node', async () => { // TODO: why doesn't this work in electron?
        const storageNode = await startFailingStorageNode(new Error('expected'), environment)
        await stream.addToStorageNode(storageNode.getAddress())
        const subscriber = environment.createClient({
            gapFillTimeout: 50,
            retryResendAfter: 50
        })
        subscriber.addEncryptionKey(GROUP_KEY, publisherWallet.address)
        const sub = await subscriber.subscribe(stream.id)
        const receivedMessages = collect(sub, 2)
        await publish(await createMessage(1000))
        await createMessage(2000)
        await publish(await createMessage(3000))
        expect((await receivedMessages).map((m) => m.timestamp)).toEqual([1000, 3000])
    })

})
