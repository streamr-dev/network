import 'reflect-metadata'

import { GroupKey } from '../../src/encryption/GroupKey'
import { StreamPermission } from '../../src/permission'
import { StreamMessageType } from '../../src/protocol/StreamMessage'
import { nextValue } from '../../src/utils/iterators'
import { FakeEnvironment } from '../test-utils/fake/FakeEnvironment'
import { createTestStream } from '../test-utils/utils'

describe('pre-agreed encryption key', () => {
    let environment: FakeEnvironment

    beforeAll(() => {
        environment = new FakeEnvironment()
    })

    afterAll(async () => {
        await environment.destroy()
    })

    it('happy path', async () => {
        const publisher = environment.createClient()
        const subscriber = environment.createClient()
        const stream = await createTestStream(publisher, module)
        await stream.grantPermissions({
            userId: await subscriber.getUserId(),
            permissions: [StreamPermission.SUBSCRIBE]
        })

        const key = GroupKey.generate()
        await publisher.updateEncryptionKey({
            key,
            streamId: stream.id,
            distributionMethod: 'rekey'
        })
        await subscriber.addEncryptionKey(key, await publisher.getUserId())
        const sub = await subscriber.subscribe(stream.id)
        await publisher.publish(stream.id, { foo: 'bar' })
        const receivedMessage = await nextValue(sub[Symbol.asyncIterator]())

        expect(receivedMessage?.streamMessage.groupKeyId).toBe(key.id)
        const groupKeyRequests = environment.getNetwork().getSentMessages({
            messageType: StreamMessageType.GROUP_KEY_REQUEST
        })
        expect(groupKeyRequests).toHaveLength(0)
    })
})
