import { createTestStream } from '../test-utils/utils'
import { getPublishTestStreamMessages, getWaitForStorage, Msg } from '../test-utils/publish'
import { StreamrClient } from '../../src/StreamrClient'
import { Stream } from '../../src/Stream'
import { StreamPermission } from '../../src/permission'
import { FakeEnvironment } from '../test-utils/fake/FakeEnvironment'

const MAX_MESSAGES = 5
const ITERATIONS = 4

describe('sequential resend subscribe', () => {
    let publisher: StreamrClient
    let subscriber: StreamrClient
    let stream: Stream

    let publishTestMessages: ReturnType<typeof getPublishTestStreamMessages>
    let waitForStorage: (...args: any[]) => Promise<void> = async () => {}

    let published: any[] = [] // keeps track of stream message data so we can verify they were resent
    let environment: FakeEnvironment

    beforeAll(async () => {
        environment = new FakeEnvironment()
        publisher = environment.createClient()
        subscriber = environment.createClient()
        stream = await createTestStream(publisher, module)
        await stream.grantPermissions({ permissions: [StreamPermission.SUBSCRIBE], public: true })
        const storageNode = environment.startStorageNode()
        await stream.addToStorageNode(storageNode.id)
        publishTestMessages = getPublishTestStreamMessages(publisher, stream)
        await stream.grantPermissions({
            user: await subscriber.getAddress(),
            permissions: [StreamPermission.SUBSCRIBE]
        })
        waitForStorage = getWaitForStorage(publisher, {
            stream
        })
        // initialize resend data by publishing some messages and waiting for
        // them to land in storage
        published = await publishTestMessages(MAX_MESSAGES, {
            waitForLast: true,
            timestamp: 111111,
        })
    })

    afterAll(async () => {
        await publisher?.destroy()
        await subscriber?.destroy()
    })

    afterEach(async () => {
        // ensure last message is in storage
        const last = published[published.length - 1]
        await waitForStorage(last)
    })

    for (let i = 0; i < ITERATIONS; i++) {
        // keep track of which messages were published in previous tests
        // so we can check that they exist in resends of subsequent tests
        // publish messages with timestamps like 222222, 333333, etc so the
        // sequencing is clearly visible in logs
        const id = (i + 2) * 111111 // start at 222222
        // eslint-disable-next-line no-loop-func
        test(`test ${id}`, async () => {
            const sub = await subscriber.subscribe({
                streamId: stream.id,
                resend: {
                    last: published.length,
                }
            })

            const onResent = jest.fn()
            sub.once('resendComplete', onResent)

            const expectedMessageCount = published.length + 1 // the realtime message which we publish next
            setImmediate(async () => {
                const message = Msg()
                // eslint-disable-next-line no-await-in-loop
                const streamMessage = await publisher.publish(stream.id, message, { // should be realtime
                    timestamp: id
                })
                // keep track of published messages so we can check they are resent in next test(s)
                published.push(streamMessage)
            })
            const msgs = await sub.collect(expectedMessageCount)
            expect(msgs).toHaveLength(expectedMessageCount)
            expect(msgs).toEqual(published)
        })
    }
})
