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

import config from './config'
import { Stream } from '../../src/stream'
import { Subscriber } from '../../src/subscribe'

/* eslint-disable no-await-in-loop */

const WAIT_FOR_STORAGE_TIMEOUT = process.env.CI ? 12000 : 6000
const MAX_MESSAGES = 5
const ITERATIONS = 3

describeRepeats('sequential resend subscribe', () => {
    let expectErrors = 0 // check no errors by default
    let onError = jest.fn()
    let client: StreamrClient
    let stream: Stream
    let published: any[]
    let publishedRequests: any[]
    let publishTestMessages: ReturnType<typeof getPublishTestMessages>
    let waitForStorage: (...args: any[]) => Promise<void>
    let subscriber: Subscriber

    const createClient = (opts = {}) => {
        const c = new StreamrClient({
            ...config.clientOptions,
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
        client.debug('connecting before test >>')
        await Promise.all([
            client.connect(),
            client.session.getSessionToken(),
        ])
        stream = await client.createStream({
            name: uid('stream')
        })
        await stream.addToStorageNode(config.clientOptions.storageNode.address)
        client.debug('connecting before test <<')

        publishTestMessages = getPublishTestMessages(client, {
            stream,
        })

        waitForStorage = getWaitForStorage(client, {
            stream,
            timeout: WAIT_FOR_STORAGE_TIMEOUT,
        })

        await client.connect()
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
        await wait(0)
        // ensure no unexpected errors
        expect(onError).toHaveBeenCalledTimes(expectErrors)
        if (client) {
            expect(client.onError).toHaveBeenCalledTimes(expectErrors)
        }
    })

    afterEach(async () => {
        await client.connect()
        // ensure last message is in storage
        const lastRequest = publishedRequests[publishedRequests.length - 1]
        await waitForStorage(lastRequest)
        client.debug('was stored', lastRequest)
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
        const id = (i + 1) * 111111
        // eslint-disable-next-line no-loop-func
        test(`test ${id}`, async () => {
            const debug = client.debug.extend(`check ${id}`)
            debug('check >')
            const sub = await subscriber.resendSubscribe({
                streamId: stream.id,
                last: published.length,
            })

            const onResent = jest.fn()
            sub.on('resent', onResent)

            const message = Msg()
            // eslint-disable-next-line no-await-in-loop
            debug('PUBLISH >')
            const req = await client.publish(stream.id, message, id) // should be realtime
            debug('PUBLISH <')
            published.push(message)
            publishedRequests.push(req)
            debug('COLLECT >')
            const receivedMsgs = await collect(sub, async ({ received }) => {
                if (received.length === published.length) {
                    await sub.return()
                }
            })
            debug('COLLECT <')

            const msgs = receivedMsgs
            expect(msgs).toHaveLength(published.length)
            expect(msgs).toEqual(published)
            client.debug('check <')
        }, 30000)
    }
})
