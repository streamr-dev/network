import { GroupKey } from '../../src/encryption/GroupKey'
import { StreamPermission } from '../../src/permission'
import { FakeEnvironment } from '../test-utils/fake/FakeEnvironment'
import { createTestStream, getLocalGroupKeyStore } from '../test-utils/utils'
import { nextValue } from '../../src/utils/iterators'
import { binaryToHex, toUserId } from '@streamr/utils'

describe('explicit encryption keys', () => {

    it('happy path', async () => {
        const environment = new FakeEnvironment()
        const stream = await createTestStream(environment.createClient(), module)
        const explicitKey = GroupKey.generate()
        const config = {
            encryption: {
                keys: {
                    [stream.id]: {
                        id: explicitKey.id,
                        data: binaryToHex(explicitKey.data)
                    }
                }
            }
        }
        const publisher = environment.createClient(config)
        const subscriber = environment.createClient(config)
        await stream.grantPermissions({
            userId: await publisher.getUserId(),
            permissions: [StreamPermission.PUBLISH]
        }, {
            userId: await subscriber.getUserId(),
            permissions: [StreamPermission.SUBSCRIBE]
        })
        const subscription = await subscriber.subscribe(stream.id)
        await publisher.publish(stream.id, {
            foo: 'bar'
        })
        const message = await nextValue(subscription[Symbol.asyncIterator]())
        expect(message!.content).toEqual({
            foo: 'bar'
        })
        const store = getLocalGroupKeyStore(toUserId(await publisher.getUserId()))
        for (const ownerId of [await publisher.getUserId(), await subscriber.getUserId()]) {
            const key = await store.get(message!.streamMessage.groupKeyId!, toUserId(ownerId))
            expect(key).toBeUndefined()
        }
        await publisher.destroy()
        await subscriber.destroy()
    })
})
