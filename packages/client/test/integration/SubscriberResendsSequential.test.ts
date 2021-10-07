import {
    Msg,
    clientOptions,
    describeRepeats,
    fakePrivateKey,
    getWaitForStorage,
    getPublishTestStreamMessages,
    createTestStream,
} from '../utils'
import { StreamrClient } from '../../src/StreamrClient'

import { Stream } from '../../src/Stream'
import { StorageNode } from '../../src/StorageNode'

const WAIT_FOR_STORAGE_TIMEOUT = process.env.CI ? 12000 : 6000
const MAX_MESSAGES = 5
const ITERATIONS = 6

describeRepeats('sequential resend subscribe', () => {
    let client: StreamrClient
    let stream: Stream

    let publishTestMessages: ReturnType<typeof getPublishTestStreamMessages>
    let waitForStorage: (...args: any[]) => Promise<void>

    let published: any[] = [] // keeps track of stream message data so we can verify they were resent

    beforeAll(async () => {
        client = new StreamrClient({
            ...clientOptions,
            auth: {
                privateKey: fakePrivateKey(),
            },
        })

        // eslint-disable-next-line require-atomic-updates
        await Promise.all([
            client.connect(),
        ])
        stream = await createTestStream(client, module)
        await stream.addToStorageNode(StorageNode.STREAMR_DOCKER_DEV)

        publishTestMessages = getPublishTestStreamMessages(client, stream)

        waitForStorage = getWaitForStorage(client, {
            stream,
            timeout: WAIT_FOR_STORAGE_TIMEOUT,
        })

        await client.connect()
        // initialize resend data by publishing some messages and waiting for
        // them to land in storage
        published = await publishTestMessages(MAX_MESSAGES, {
            waitForLast: true,
            timestamp: 111111,
        })
    }, WAIT_FOR_STORAGE_TIMEOUT * 2)

    beforeEach(async () => {
        await client.connect()
    })

    afterEach(async () => {
        await client.connect()
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
            const sub = await client.resendSubscribe({
                streamId: stream.id,
                last: published.length,
            })

            const onResent = jest.fn()
            sub.onResent(onResent)

            const message = Msg()
            // eslint-disable-next-line no-await-in-loop
            const streamMessage = await client.publish(stream.id, message, id) // should be realtime
            // keep track of published messages so we can check they are resent in next test(s)
            published.push(streamMessage)
            const msgs = await sub.collect(published.length)
            expect(msgs).toHaveLength(published.length)
            expect(msgs).toEqual(published)
        })
    }
})
