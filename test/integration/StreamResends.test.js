import { ControlLayer } from 'streamr-client-protocol'
import { wait } from 'streamr-test-utils'
import Debug from 'debug'

import { uid, fakePrivateKey } from '../utils'
import StreamrClient from '../../src'
import Connection from '../../src/Connection'
import MessageStream from '../../src/Stream'

import config from './config'

const { ControlMessage } = ControlLayer

let ID = 0
const Msg = (opts) => ({
    value: `msg${ID++}`, // eslint-disable-line no-plusplus
    ...opts,
})

async function collect(iterator, fn = () => {}) {
    const received = []
    for await (const msg of iterator) {
        received.push(msg)
        await fn({
            msg, iterator, received,
        })
    }

    return received
}

const TEST_REPEATS = 1

/* eslint-disable no-await-in-loop */

console.log = Debug('Streamr::   CONSOLE   ')

const WAIT_FOR_STORAGE_TIMEOUT = 6000

describe('resends', () => {
    let expectErrors = 0 // check no errors by default
    let onError = jest.fn()
    let client
    let stream
    let published
    let emptyStream

    const createClient = (opts = {}) => {
        const c = new StreamrClient({
            auth: {
                privateKey: fakePrivateKey(),
            },
            autoConnect: false,
            autoDisconnect: false,
            maxRetries: 2,
            ...config.clientOptions,
            ...opts,
        })
        c.onError = jest.fn()
        c.on('error', onError)
        return c
    }

    async function waitForStorage({ streamId, streamPartition = 0, msg, timeout = 5000 }) {
        const start = Date.now()
        let last
        // eslint-disable-next-line no-constant-condition
        while (true) {
            const duration = Date.now() - start
            if (duration > timeout) {
                client.debug('waitForStorage timeout %o', {
                    timeout,
                    duration
                }, {
                    msg,
                    last: last.map((l) => l.content),
                })
                const err = new Error(`timed out after ${duration}ms waiting for message`)
                err.msg = msg
                throw err
            }

            last = await client.getStreamLast({
                streamId,
                streamPartition,
                count: 3,
            })

            let found = false
            for (const { content } of last) {
                if (content.value === msg.value) {
                    found = true
                    break
                }
            }

            if (found) {
                return
            }

            client.debug('message not found, retrying... %o', {
                msg, last: last.map(({ content }) => content)
            })
            await wait(500)
        }
    }

    beforeAll(async () => {
        // eslint-disable-next-line require-atomic-updates
        client = createClient()
        stream = await client.createStream({
            name: uid('stream'),
        })

        published = []
        await client.connect()
        for (let i = 0; i < 5; i++) {
            const message = Msg()
            // eslint-disable-next-line no-await-in-loop
            await client.publish(stream.id, message)
            published.push(message)
        }

        const lastMessage = published[published.length - 1]
        await waitForStorage({
            msg: lastMessage,
            timeout: WAIT_FOR_STORAGE_TIMEOUT,
            streamId: stream.id,
        })
    }, WAIT_FOR_STORAGE_TIMEOUT * 2)

    beforeEach(async () => {
        emptyStream = await client.createStream({
            name: uid('stream')
        })
        await client.connect()
        expectErrors = 0
        onError = jest.fn()
    })

    afterEach(async () => {
        await wait()
        // ensure no unexpected errors
        expect(onError).toHaveBeenCalledTimes(expectErrors)
        if (client) {
            expect(client.onError).toHaveBeenCalledTimes(expectErrors)
        }
    })

    afterAll(async () => {
        await wait(500)
        if (client) {
            client.debug('disconnecting after test')
            await client.disconnect()
        }

        const openSockets = Connection.getOpen()
        if (openSockets !== 0) {
            throw new Error(`sockets not closed: ${openSockets}`)
        }
    })

    for (let k = 0; k < TEST_REPEATS; k++) {
        // eslint-disable-next-line no-loop-func
        describe(`test repeat ${k + 1} of ${TEST_REPEATS}`, () => {
            describe('no data', () => {
                it('handles nothing to resend', async () => {
                    const M = new MessageStream(client)
                    const sub = await M.resend({
                        streamId: emptyStream.id,
                        last: 5,
                    })

                    const receivedMsgs = await collect(sub)
                    expect(receivedMsgs).toHaveLength(0)
                    expect(M.count(stream.id)).toBe(0)
                })

                it('resendSubscribe with nothing to resend', async () => {
                    const M = new MessageStream(client)
                    const sub = await M.resendSubscribe({
                        streamId: emptyStream.id,
                        last: 5,
                    })

                    expect(M.count(emptyStream.id)).toBe(1)
                    const message = Msg()
                    // eslint-disable-next-line no-await-in-loop
                    await client.publish(emptyStream.id, message)

                    const received = []
                    for await (const m of sub) {
                        received.push(m)
                        wait(100)
                        break
                    }

                    expect(received).toHaveLength(1)
                    expect(M.count(emptyStream.id)).toBe(0)
                })
            })

            describe('with resend data', () => {
                beforeEach(async () => {
                    // ensure last message is in storage
                    const lastMessage = published[published.length - 1]
                    await waitForStorage({
                        msg: lastMessage,
                        timeout: WAIT_FOR_STORAGE_TIMEOUT,
                        streamId: stream.id,
                    })
                }, WAIT_FOR_STORAGE_TIMEOUT * 1.2)

                it('requests resend', async () => {
                    const M = new MessageStream(client)
                    const sub = await M.resend({
                        streamId: stream.id,
                        last: published.length,
                    })

                    const receivedMsgs = await collect(sub)
                    expect(receivedMsgs).toHaveLength(published.length)
                    expect(receivedMsgs.map(({ streamMessage }) => streamMessage.getParsedContent())).toEqual(published)
                    expect(M.count(stream.id)).toBe(0)
                })

                it('requests resend number', async () => {
                    const M = new MessageStream(client)
                    const sub = await M.resend({
                        streamId: stream.id,
                        last: 2,
                    })

                    const receivedMsgs = await collect(sub)
                    expect(receivedMsgs).toHaveLength(2)
                    expect(receivedMsgs.map(({ streamMessage }) => streamMessage.getParsedContent())).toEqual(published.slice(-2))
                    expect(M.count(stream.id)).toBe(0)
                })

                it('closes stream', async () => {
                    const M = new MessageStream(client)
                    const sub = await M.resend({
                        streamId: stream.id,
                        last: published.length,
                    })

                    const received = []
                    for await (const m of sub) {
                        received.push(m)
                    }
                    expect(received).toHaveLength(published.length)
                    expect(M.count(stream.id)).toBe(0)
                    expect(sub.stream.readable).toBe(false)
                    expect(sub.stream.writable).toBe(false)
                })

                describe('resendSubscribe', () => {
                    it('sees resends and realtime', async () => {
                        const M = new MessageStream(client)
                        const sub = await M.resendSubscribe({
                            streamId: stream.id,
                            last: published.length,
                        })

                        const message = Msg()
                        // eslint-disable-next-line no-await-in-loop
                        await client.publish(stream.id, message) // should be realtime
                        published.push(message)
                        const receivedMsgs = await collect(sub, async ({ received }) => {
                            if (received.length === published.length) {
                                await wait()
                                await sub.return()
                            }
                        })

                        const msgs = receivedMsgs.map(({ streamMessage }) => streamMessage.getParsedContent())
                        expect(msgs).toHaveLength(published.length)
                        expect(msgs).toEqual(published)
                        expect(M.count(stream.id)).toBe(0)
                        expect(sub.realtime.stream.readable).toBe(false)
                        expect(sub.realtime.stream.writable).toBe(false)
                        expect(sub.resend.stream.readable).toBe(false)
                        expect(sub.resend.stream.writable).toBe(false)
                    })

                    it('sees resends and realtime again', async () => {
                        const M = new MessageStream(client)
                        const sub = await M.resendSubscribe({
                            streamId: stream.id,
                            last: published.length,
                        })

                        const message = Msg()
                        // eslint-disable-next-line no-await-in-loop
                        await client.publish(stream.id, message) // should be realtime
                        published.push(message)
                        const receivedMsgs = await collect(sub, async ({ received }) => {
                            if (received.length === published.length) {
                                await sub.return()
                            }
                        })

                        const msgs = receivedMsgs.map(({ streamMessage }) => streamMessage.getParsedContent())
                        expect(msgs).toHaveLength(published.length)
                        expect(msgs).toEqual(published)
                        expect(M.count(stream.id)).toBe(0)
                        expect(sub.realtime.stream.readable).toBe(false)
                        expect(sub.realtime.stream.writable).toBe(false)
                        expect(sub.resend.stream.readable).toBe(false)
                        expect(sub.resend.stream.writable).toBe(false)
                    })

                    it('can return before start', async () => {
                        const M = new MessageStream(client)
                        const sub = await M.resendSubscribe({
                            streamId: stream.id,
                            last: published.length,
                        })

                        expect(M.count(stream.id)).toBe(1)
                        const message = Msg()

                        await sub.return()
                        // eslint-disable-next-line no-await-in-loop
                        await client.publish(stream.id, message)
                        published.push(message)
                        const received = []
                        for await (const m of sub) {
                            received.push(m)
                        }

                        expect(received).toHaveLength(0)
                        expect(M.count(stream.id)).toBe(0)
                        expect(sub.realtime.stream.readable).toBe(false)
                        expect(sub.resend.stream.writable).toBe(false)
                    })

                    it('can end asynchronously', async () => {
                        const M = new MessageStream(client)
                        const sub = await M.resendSubscribe({
                            streamId: stream.id,
                            last: published.length,
                        })

                        const message = Msg()
                        // eslint-disable-next-line no-await-in-loop
                        await client.publish(stream.id, message)
                        published.push(message)

                        let t
                        let receivedMsgs
                        try {
                            receivedMsgs = await collect(sub, async ({ received }) => {
                                if (received.length === published.length) {
                                    t = setTimeout(() => {
                                        sub.end()
                                    })
                                }
                            })
                        } finally {
                            clearTimeout(t)
                        }

                        const msgs = receivedMsgs.map(({ streamMessage }) => streamMessage.getParsedContent())
                        expect(msgs).toHaveLength(published.length)
                        expect(msgs).toEqual(published)
                        expect(M.count(stream.id)).toBe(0)
                        expect(sub.realtime.stream.readable).toBe(false)
                        expect(sub.resend.stream.writable).toBe(false)
                    })

                    it('can end inside resend', async () => {
                        const unsubscribeEvents = []
                        client.connection.on(ControlMessage.TYPES.UnsubscribeResponse, (m) => {
                            unsubscribeEvents.push(m)
                        })
                        const M = new MessageStream(client)
                        const sub = await M.resendSubscribe({
                            streamId: stream.id,
                            last: published.length,
                        })

                        const message = Msg()
                        // eslint-disable-next-line no-await-in-loop
                        await client.publish(stream.id, message)
                        published.push(message)
                        const END_AFTER = 3
                        const receivedMsgs = await collect(sub, async ({ received }) => {
                            if (received.length === END_AFTER) {
                                await sub.end()
                                expect(unsubscribeEvents).toHaveLength(1)
                            }
                        })
                        const msgs = receivedMsgs.map(({ streamMessage }) => streamMessage.getParsedContent())
                        expect(msgs).toHaveLength(END_AFTER)
                        expect(msgs).toEqual(published.slice(0, END_AFTER))
                        expect(M.count(stream.id)).toBe(0)
                        expect(sub.realtime.stream.readable).toBe(false)
                        expect(sub.resend.stream.writable).toBe(false)
                    })
                })
            })
        })
    }
})
