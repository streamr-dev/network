import 'reflect-metadata'
import { range } from 'lodash'
import { StreamPermission } from './../../src/permission'
import { FakeEnvironment } from './../test-utils/fake/FakeEnvironment'
import { createTestStream } from './../test-utils/utils'

const MESSAGE_COUNT = 10

describe('message iteration', () => {

    it('async iterator breaks out of loop', async () => {
        const environment = new FakeEnvironment()
        const publisher = environment.createClient()
        const subscriber = environment.createClient()
        const stream = await createTestStream(publisher, module)
        stream.grantPermissions({
            public: true,
            permissions: [StreamPermission.SUBSCRIBE]
        })
        const sub = await subscriber.subscribe(stream.id)
        setImmediate(() => {
            range(MESSAGE_COUNT).map(() => publisher.publish(stream.id, {}))
        })
        let receivedMessageCount = 0
        // eslint-disable-next-line no-underscore-dangle
        for await (const _msg of sub) {
            receivedMessageCount++
            if (receivedMessageCount === (MESSAGE_COUNT / 2)) {
                break
            }
        }
        // - the break statement triggers iterator's return method to be called (standard JS behavior)
        // - the iterator is a Pipeline
        //   - in Pipeline#return we call this.iterator.return(v)
        // - this.iterator is a wrapped iterator (iteratorFinally), created in Pipeline constructor
        //   - it has a onFinally callback which calls Pipeline#cleanup
        // - in Pipeline#cleanup we call this.onBeforeFinally.trigger() to signal an event to listeners
        // - the event listener was initialized in SubscriptionSession#add
        //   - in the event listener we call SubscriptionSession#remove
        //   - there we remove the subscription by calling this.subscriptions.delete()
        expect(await subscriber.getSubscriptions(stream.id)).toHaveLength(1)
    })
})
