import { fastWallet, waitForCondition } from 'streamr-test-utils'
import { wait } from '@streamr/utils'
import { createTestStream } from '../test-utils/utils'
import { getPublishTestStreamMessages } from '../test-utils/publish'
import { StreamrClient } from '../../src/StreamrClient'
import { Stream } from '../../src/Stream'
import { range } from 'lodash'
import { FakeEnvironment } from '../test-utils/fake/FakeEnvironment'
import { StreamPermission } from './../../src/permission'

const NUM_MESSAGES = 8
const MAX_MESSAGES = 4
const PARTITIONS = 3

describe('subscribe all partitions', () => {
    let client: StreamrClient
    let stream: Stream
    let publishTestMessages: ReturnType<typeof getPublishTestStreamMessages>

    beforeEach(async () => {
        const environment = new FakeEnvironment()
        client = environment.createClient()
        stream = await createTestStream(client, module, {
            partitions: PARTITIONS,
        })
        const publisherWallet = fastWallet()
        await stream.grantPermissions({
            user: publisherWallet.address,
            permissions: [StreamPermission.PUBLISH]
        })
        publishTestMessages = getPublishTestStreamMessages(environment.createClient({
            auth: {
                privateKey: publisherWallet.privateKey
            }
        }), stream)
    })

    afterEach(async () => {
        // @ts-expect-error private
        expect(await client.subscriber.count()).toBe(0)
        // @ts-expect-error private
        expect(await client.subscriber.count(stream.id)).toBe(0)
        // @ts-expect-error private
        expect(client.subscriber.countSubscriptionSessions()).toBe(0)
        await client?.destroy()
    })

    it('subscribes to all partitions', async () => {
        const subMsgs: any[] = []
        await client.subscribeAll(stream.id, (_content, msg) => {
            subMsgs.push(msg)
        })
        const pubs = await Promise.all(range(PARTITIONS).map((streamPartition) => {
            return publishTestMessages(NUM_MESSAGES, { partitionKey: streamPartition })
        }))
        const publishedMsgs = pubs.flat()
        expect(publishedMsgs.length).toBe(PARTITIONS * NUM_MESSAGES)
        await waitForCondition(() => subMsgs.length >= (PARTITIONS * NUM_MESSAGES), 25000)
        expect(subMsgs.map((m) => m.signature)).toIncludeSameMembers(publishedMsgs.map((m) => m.signature))
        await client.unsubscribe()
        expect(await client.getSubscriptions()).toHaveLength(0)
    })

    it('works with single partition', async () => {
        const subMsgs: any[] = []
        stream = await createTestStream(client, module, {
            partitions: 1
        })
        publishTestMessages = getPublishTestStreamMessages(client, stream)

        await client.subscribeAll(stream.id, (_content, msg) => {
            subMsgs.push(msg)
        })

        const pubs = await Promise.all([0].map((streamPartition) => {
            return publishTestMessages(NUM_MESSAGES, { partitionKey: streamPartition })
        }))
        const publishedMsgs = pubs.flat()
        expect(publishedMsgs.length).toBe(NUM_MESSAGES)
        await waitForCondition(() => subMsgs.length >= (NUM_MESSAGES), 25000)
        expect(subMsgs.map((m) => m.signature)).toIncludeSameMembers(publishedMsgs.map((m) => m.signature))

        await client.unsubscribe()
        expect(await client.getSubscriptions()).toHaveLength(0)
    })

    it('can stop prematurely', async () => {
        const subMsgs: any[] = []
        const sub = await client.subscribeAll(stream.id, (_content, msg) => {
            subMsgs.push(msg)
            if (subMsgs.length === MAX_MESSAGES) {
                sub.return()
            }
        })
        const pubs = await Promise.all(range(PARTITIONS).map((streamPartition) => {
            return publishTestMessages(NUM_MESSAGES, { partitionKey: streamPartition })
        }))
        const publishedMsgs = pubs.flat()
        expect(publishedMsgs.length).toBe(PARTITIONS * NUM_MESSAGES)
        await sub.onFinally.listen()
        await wait(500) // TODO: why is this wait needed? wasn't needed before encryption was enabled.
        // got the messages
        expect(subMsgs).toHaveLength(MAX_MESSAGES)
        // unsubscribed from everything
        expect((await client.getSubscriptions(stream.id)).length).toBe(0)
    })

    it('stops with unsubscribeAll', async () => {
        const subMsgs: any[] = []
        const sub = await client.subscribeAll(stream.id, (_content, msg) => {
            subMsgs.push(msg)
            if (subMsgs.length === MAX_MESSAGES) {
                client.unsubscribe()
            }
        })
        const pubs = await Promise.all(range(PARTITIONS).map((streamPartition) => {
            return publishTestMessages(NUM_MESSAGES, { partitionKey: streamPartition })
        }))
        const publishedMsgs = pubs.flat()
        expect(publishedMsgs.length).toBe(PARTITIONS * NUM_MESSAGES)
        await sub.onFinally.listen()
        // got the messages
        expect(subMsgs).toHaveLength(MAX_MESSAGES)
        // unsubscribed from everything
        expect(await client.getSubscriptions()).toHaveLength(0)
    })

    it('stops only when all subs are unsubbed', async () => {
        const subMsgs: any[] = []
        const sub = await client.subscribeAll(stream.id, (_content, msg) => {
            subMsgs.push(msg)
        })
        const onFinallyCalled = jest.fn()
        sub.onFinally.listen(onFinallyCalled)

        const pubs = await Promise.all(range(PARTITIONS).map((streamPartition) => {
            return publishTestMessages(NUM_MESSAGES, { partitionKey: streamPartition })
        }))
        const publishedMsgs = pubs.flat()
        expect(publishedMsgs.length).toBe(PARTITIONS * NUM_MESSAGES)
        await waitForCondition(() => subMsgs.length >= (PARTITIONS * NUM_MESSAGES), 25000)
        expect(onFinallyCalled).toHaveBeenCalledTimes(0)
        // unsub from each partition
        // should only call onFinally once all unsubbed
        for (const p of range(PARTITIONS)) {
            expect(onFinallyCalled).toHaveBeenCalledTimes(0)
            // eslint-disable-next-line no-await-in-loop
            await client.unsubscribe({ streamId: stream.id, partition: p })
        }

        // should have ended after last partition unsubbed
        expect(onFinallyCalled).toHaveBeenCalledTimes(1)

        expect(subMsgs.map((m) => m.signature)).toIncludeSameMembers(publishedMsgs.map((m) => m.signature))
        // got the messages
        expect(subMsgs.length).toBe(PARTITIONS * NUM_MESSAGES)
        // unsubscribed from everything
        expect((await client.getSubscriptions(stream.id)).length).toBe(0)
    })
})
