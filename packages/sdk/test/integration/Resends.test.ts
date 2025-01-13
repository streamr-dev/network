import 'reflect-metadata'

import { fastWallet } from '@streamr/test-utils'
import { collect } from '@streamr/utils'
import { mock } from 'jest-mock-extended'
import { createPrivateKeyAuthentication } from '../../src/Authentication'
import { Stream } from '../../src/Stream'
import { StreamrClient } from '../../src/StreamrClient'
import { GroupKey } from '../../src/encryption/GroupKey'
import { StreamPermission } from '../../src/permission'
import { MessageFactory } from '../../src/publish/MessageFactory'
import { MessageSigner } from '../../src/signature/MessageSigner'
import { SignatureValidator } from '../../src/signature/SignatureValidator'
import { FakeEnvironment } from '../test-utils/fake/FakeEnvironment'
import { createGroupKeyQueue, createStreamRegistry } from '../test-utils/utils'

describe('Resends', () => {
    let stream: Stream
    let subscriber: StreamrClient
    let messageFactory: MessageFactory
    let environment: FakeEnvironment

    beforeEach(async () => {
        const publisherPrivateKey = fastWallet().privateKey
        environment = new FakeEnvironment()
        const publisher = environment.createClient({
            auth: {
                privateKey: publisherPrivateKey
            }
        })
        stream = await publisher.createStream('/path')
        subscriber = environment.createClient({
            maxGapRequests: 1,
            gapFillTimeout: 100
        })
        await stream.grantPermissions({
            userId: await subscriber.getUserId(),
            permissions: [StreamPermission.SUBSCRIBE]
        })
        const groupKey = GroupKey.generate()
        const authentication = createPrivateKeyAuthentication(publisherPrivateKey)
        messageFactory = new MessageFactory({
            authentication,
            streamId: stream.id,
            streamRegistry: createStreamRegistry(),
            groupKeyQueue: await createGroupKeyQueue(authentication, groupKey),
            signatureValidator: mock<SignatureValidator>(),
            messageSigner: new MessageSigner(authentication)
        })
        // store the encryption key publisher's local group key store
        await publisher.updateEncryptionKey({
            streamId: stream.id,
            distributionMethod: 'rekey',
            key: groupKey
        })
        // trigger publisher to start serving response for group key requests
        await publisher.publish(stream.id, {})
    })

    afterEach(async () => {
        await environment.destroy()
    })

    it('one storage node', async () => {
        const allMessages = [
            await messageFactory.createMessage({ foo: 1 }, { timestamp: 1000 }),
            await messageFactory.createMessage({ foo: 2 }, { timestamp: 2000 }),
            await messageFactory.createMessage({ foo: 3 }, { timestamp: 3000 })
        ]
        const storageNode = await environment.startStorageNode()
        await stream.addToStorageNode(storageNode.getAddress())
        storageNode.storeMessage(allMessages[0])
        storageNode.storeMessage(allMessages[2])
        const messageStream = await subscriber.resend(stream.id, { last: 2 })
        const receivedMessages = await collect(messageStream)
        expect(receivedMessages.map((msg) => msg.content)).toEqual([{ foo: 1 }, { foo: 3 }])
    })

    it('multiple storage nodes', async () => {
        const allMessages = [
            await messageFactory.createMessage({ foo: 1 }, { timestamp: 1000 }),
            await messageFactory.createMessage({ foo: 2 }, { timestamp: 2000 }),
            await messageFactory.createMessage({ foo: 3 }, { timestamp: 3000 }),
            await messageFactory.createMessage({ foo: 4 }, { timestamp: 4000 })
        ]
        const storageNode1 = await environment.startStorageNode()
        await stream.addToStorageNode(storageNode1.getAddress())
        storageNode1.storeMessage(allMessages[0])
        storageNode1.storeMessage(allMessages[2])
        storageNode1.storeMessage(allMessages[3])
        const storageNode2 = await environment.startStorageNode()
        await stream.addToStorageNode(storageNode2.getAddress())
        storageNode2.storeMessage(allMessages[0])
        storageNode2.storeMessage(allMessages[1])
        storageNode2.storeMessage(allMessages[3])
        const messageStream = await subscriber.resend(stream.id, { last: 4 })
        const receivedMessages = await collect(messageStream)
        expect(receivedMessages.map((msg) => msg.content)).toEqual([{ foo: 1 }, { foo: 2 }, { foo: 3 }, { foo: 4 }])
    })
})
