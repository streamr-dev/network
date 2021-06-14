import { wait } from 'streamr-test-utils'

import {
    Msg,
    uid,
    collect,
    describeRepeats,
    fakePrivateKey,
    getWaitForStorage,
    getPublishTestMessages,
} from '../utils'
import { StreamrClient } from '../../src/StreamrClient'
import Connection from '../../src/Connection'

import { clientOptions } from './devEnvironment'
import { Stream } from '../../src/stream'
import { Subscriber } from '../../src/subscribe'
import { StorageNode } from '../../src/stream/StorageNode'

/* eslint-disable no-await-in-loop */

const WAIT_FOR_STORAGE_TIMEOUT = process.env.CI ? 12000 : 6000
const MAX_MESSAGES = 5
const ITERATIONS = 6

describeRepeats('sequential resend subscribe', () => {
    let expectErrors = 0 // check no errors by default
    let onError = jest.fn()

    let client: StreamrClient
    let subscriber: Subscriber
    let stream: Stream

    let publishTestMessages: ReturnType<typeof getPublishTestMessages>
    let waitForStorage: (...args: any[]) => Promise<void>

    let published: any[] // keeps track of stream message data so we can verify they were resent
    let publishedRequests: any[] // tracks publish requests so we can pass them to waitForStorage

    const createClient = (opts = {}) => {
        const c = new StreamrClient({
            ...clientOptions,
            auth: {
                privateKey: fakePrivateKey(),
            },
            // @ts-expect-error
            publishAutoDisconnectDelay: 1000,
            autoConnect: false,
            autoDisconnect: false,
            maxRetries: 2,
            ...opts,
        })
        c.onError = jest.fn()
        c.on('error', onError)
        return c
    }

    beforeAll(async () => {
        client = createClient()
        subscriber = client.subscriber

        // eslint-disable-next-line require-atomic-updates
        await Promise.all([
            client.connect(),
            client.session.getSessionToken(),
        ])
        stream = await client.createStream({
            name: uid('stream')
        })
        await stream.addToStorageNode(StorageNode.STREAMR_DOCKER_DEV)

        publishTestMessages = getPublishTestMessages(client, {
            stream,
        })

        waitForStorage = getWaitForStorage(client, {
            stream,
            timeout: WAIT_FOR_STORAGE_TIMEOUT,
        })

        await client.connect()
        // initialize resend data by publishing some messages and waiting for
        // them to land in storage
        const results = await publishTestMessages.raw(MAX_MESSAGES, {
            waitForLast: true,
            timestamp: 111111,
        })

        published = results.map(([msg]: any) => msg)
        publishedRequests = results.map(([, req]: any) => req)
    }, WAIT_FOR_STORAGE_TIMEOUT * 2)

    beforeEach(async () => {
        await client.connect()
        expectErrors = 0
        onError = jest.fn()
    })

    afterEach(async () => {
        await client.connect()
        // ensure last message is in storage
        const lastRequest = publishedRequests[publishedRequests.length - 1]
        await waitForStorage(lastRequest)
    })

    afterEach(async () => {
        await wait(0)
        // ensure no unexpected errors
        expect(onError).toHaveBeenCalledTimes(expectErrors)
        if (client) {
            expect(client.onError).toHaveBeenCalledTimes(expectErrors)
        }
    })

    afterEach(async () => {
        if (client) {
            client.debug('disconnecting after test')
            await client.disconnect()
        }

        const openSockets = Connection.getOpen()
        if (openSockets !== 0) {
            await Connection.closeOpen()
            throw new Error(`sockets not closed: ${openSockets}`)
        }
        client.debug('\n\n\n\n')
    })

    for (let i = 0; i < ITERATIONS; i++) {
        // keep track of which messages were published in previous tests
        // so we can check that they exist in resends of subsequent tests
        // publish messages with timestamps like 222222, 333333, etc so the
        // sequencing is clearly visible in logs
        const id = (i + 2) * 111111 // start at 222222
        // eslint-disable-next-line no-loop-func
        test(`test ${id}`, async () => {
            const sub = await subscriber.resendSubscribe({
                streamId: stream.id,
                last: published.length,
            })

            const onResent = jest.fn()
            sub.on('resent', onResent)

            const message = Msg()
            // eslint-disable-next-line no-await-in-loop
            const req = await client.publish(stream.id, message, id) // should be realtime
            // keep track of published messages so we can check they are resent in next test(s)
            published.push(message)
            publishedRequests.push(req)
            const receivedMsgs = await collect(sub, async ({ received }) => {
                if (received.length === published.length) {
                    await sub.return()
                }
            })

            const msgs = receivedMsgs
            expect(msgs).toHaveLength(published.length)
            expect(msgs).toEqual(published)
        })
    }
})
