import 'reflect-metadata'
import { DependencyContainer } from 'tsyringe'
import { StreamMessage } from 'streamr-client-protocol'
import { fastPrivateKey, fastWallet } from 'streamr-test-utils'
import { StreamRegistry } from '../../src/registry/StreamRegistry'
import { GroupKeyStoreFactory } from '../../src/encryption/GroupKeyStoreFactory'
import { GroupKey } from '../../src/encryption/GroupKey'
import { Stream } from '../../src/Stream'
import { addFakeNode, createFakeContainer } from '../test-utils/fake/fakeEnvironment'
import { StreamPermission } from '../../src/permission'
import { nextValue } from '../../src/utils/iterators'
import { EncryptionUtil } from '../../src/encryption/EncryptionUtil'

describe('update encryption key', () => {

    let receivedMessages: AsyncIterableIterator<StreamMessage>
    let stream: Stream
    let dependencyContainer: DependencyContainer

    beforeEach(async () => {
        dependencyContainer = createFakeContainer({
            auth: {
                privateKey: fastPrivateKey()
            }
        })
        const streamRegistry = dependencyContainer.resolve(StreamRegistry)
        stream = await streamRegistry.createStream('/path')
        const subscriberWallet = fastWallet()
        stream.grantPermissions({
            user: subscriberWallet.address,
            permissions: [StreamPermission.SUBSCRIBE]
        })
        const subscriberNode = addFakeNode(subscriberWallet.address, dependencyContainer)
        receivedMessages = subscriberNode.addSubscriber(...stream.getStreamParts())
    })

    it('rotating group key injects group key into next stream message', async () => {
        const groupKeyStore = await dependencyContainer.resolve(GroupKeyStoreFactory).getStore(stream.id)

        await stream.publish({})
        const msg1 = await nextValue(receivedMessages)
        expect(msg1!.groupKeyId).toEqual(expect.any(String))
        expect(msg1!.newGroupKey).toBeNull()
        const firstKey = (await groupKeyStore.get(msg1!.groupKeyId!))!

        const rotatedKey = GroupKey.generate()
        await groupKeyStore.setNextGroupKey(rotatedKey)
        await stream.publish({})
        const msg2 = await nextValue(receivedMessages)
        expect(msg2!.groupKeyId).toEqual(firstKey.id)
        expect(EncryptionUtil.decryptGroupKey(msg2!.newGroupKey!, firstKey)).toEqual(rotatedKey)

        await stream.publish({})
        const msg3 = await nextValue(receivedMessages)
        expect(msg3!.groupKeyId).toEqual(rotatedKey.id)
        expect(msg3!.newGroupKey).toBeNull()
    })

})