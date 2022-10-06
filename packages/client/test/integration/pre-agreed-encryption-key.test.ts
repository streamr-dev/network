import 'reflect-metadata'
import { StreamMessage } from 'streamr-client-protocol'
import { GroupKey } from '../../src/encryption/GroupKey'
import { StreamPermission } from '../../src/permission'
import { nextValue } from '../../src/utils/iterators'
import { FakeEnvironment } from '../test-utils/fake/FakeEnvironment'
import { createTestStream } from '../test-utils/utils'

describe('pre-agreed encryption key', () => {

    it('happy path', async () => {
        const environment = new FakeEnvironment()
        const publisher = environment.createClient()
        const subscriber = environment.createClient()
        const stream = await createTestStream(publisher, module)
        await stream.grantPermissions({
            user: await subscriber.getAddress(),
            permissions: [StreamPermission.SUBSCRIBE]
        })

        const key = GroupKey.generate()
        await publisher.updateEncryptionKey({
            key,
            streamIdOrPath: stream.id,
            distributionMethod: 'rekey'
        })
        await subscriber.addEncryptionKey(key, stream.id)
        const sub = await subscriber.subscribe(stream.id)
        await publisher.publish(stream.id, { foo: 'bar' })
        const receivedMessage = await nextValue(sub)

        expect(receivedMessage?.groupKeyId).toBe(key.id)
        const groupKeyRequests = environment.getNetwork().getSentMessages({
            messageType: StreamMessage.MESSAGE_TYPES.GROUP_KEY_REQUEST
        })
        expect(groupKeyRequests).toHaveLength(0)
    })
})
