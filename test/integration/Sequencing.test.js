import { wait, waitForCondition, waitForEvent } from 'streamr-test-utils'

import { uid, fakePrivateKey, getWaitForStorage } from '../utils'
import StreamrClient from '../../src'
import Connection from '../../src/Connection'

import config from './config'

const Msg = (opts) => ({
    value: uid('msg'),
    ...opts,
})

function toSeq(requests, ts = Date.now()) {
    return requests.map((m) => {
        const { prevMsgRef } = m.streamMessage
        return [
            [m.streamMessage.getTimestamp() - ts, m.streamMessage.getSequenceNumber()],
            prevMsgRef ? [prevMsgRef.timestamp - ts, prevMsgRef.sequenceNumber] : null
        ]
    })
}

describe('Sequencing', () => {
    let expectErrors = 0 // check no errors by default
    let onError = jest.fn()
    let client
    let stream

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

    beforeEach(async () => {
        expectErrors = 0
        onError = jest.fn()
        client = createClient()
        await client.connect()

        stream = await client.createStream({
            name: uid('stream')
        })
    })

    afterEach(async () => {
        await wait()
        // ensure no unexpected errors
        expect(onError).toHaveBeenCalledTimes(expectErrors)
        if (client) {
            expect(client.onError).toHaveBeenCalledTimes(expectErrors)
        }
    })

    afterEach(async () => {
        await wait()
        if (client) {
            client.debug('disconnecting after test')
            await client.disconnect()
        }

        const openSockets = Connection.getOpen()
        if (openSockets !== 0) {
            throw new Error(`sockets not closed: ${openSockets}`)
        }
    })

    it('should sequence in order', async () => {
        const ts = Date.now()
        const msgsPublished = []
        const msgsReceieved = []

        await client.subscribe(stream.id, (m) => msgsReceieved.push(m))

        const nextMsg = () => {
            const msg = Msg()
            msgsPublished.push(msg)
            return msg
        }

        const requests = await Promise.all([
            // first 2 messages at ts + 0
            client.publish(stream, nextMsg(), ts),
            client.publish(stream, nextMsg(), ts),
            // next two messages at ts + 1
            client.publish(stream, nextMsg(), ts + 1),
            client.publish(stream, nextMsg(), ts + 1),
        ])
        const seq = toSeq(requests, ts)
        expect(seq).toEqual([
            [[0, 0], null],
            [[0, 1], [0, 0]],
            [[1, 0], [0, 1]],
            [[1, 1], [1, 0]],
        ])

        await waitForCondition(() => (
            msgsReceieved.length === msgsPublished.length
        ), 8000).catch(() => {}) // ignore, tests will fail anyway

        expect(msgsReceieved).toEqual(msgsPublished)
    }, 10000)

    it('should sequence in order even if some calls delayed', async () => {
        const ts = Date.now()
        const msgsPublished = []
        const msgsReceieved = []

        let calls = 0
        const { clear } = client.publisher.msgCreationUtil.getPublisherId
        const getPublisherId = client.publisher.msgCreationUtil.getPublisherId.bind(client.publisher.msgCreationUtil)
        client.publisher.msgCreationUtil.getPublisherId = async (...args) => {
            // delay getPublisher call
            calls += 1
            if (calls === 2) {
                const result = await getPublisherId(...args)
                // delay resolving this call
                await wait(100)
                return result
            }
            return getPublisherId(...args)
        }
        client.publisher.msgCreationUtil.getPublisherId.clear = clear

        const nextMsg = () => {
            const msg = Msg()
            msgsPublished.push(msg)
            return msg
        }

        await client.subscribe(stream.id, (m) => msgsReceieved.push(m))
        const requests = await Promise.all([
            // first 2 messages at ts + 0
            client.publish(stream, nextMsg(), ts),
            client.publish(stream, nextMsg(), ts),
            // next two messages at ts + 1
            client.publish(stream, nextMsg(), ts + 1),
            client.publish(stream, nextMsg(), ts + 1),
        ])
        const seq = toSeq(requests, ts)
        expect(seq).toEqual([
            [[0, 0], null],
            [[0, 1], [0, 0]],
            [[1, 0], [0, 1]],
            [[1, 1], [1, 0]],
        ])

        await waitForCondition(() => (
            msgsReceieved.length === msgsPublished.length
        ), 5000).catch(() => {}) // ignore, tests will fail anyway

        expect(msgsReceieved).toEqual(msgsPublished)
    }, 10000)

    it('should sequence in order even if publish requests backdated', async () => {
        const ts = Date.now()
        const msgsPublished = []
        const msgsReceieved = []

        await client.subscribe(stream.id, (m) => msgsReceieved.push(m))

        const nextMsg = (...args) => {
            const msg = Msg(...args)
            msgsPublished.push(msg)
            return msg
        }

        const requests = await Promise.all([
            // publish at ts + 0
            client.publish(stream, nextMsg(), ts),
            // publish at ts + 1
            client.publish(stream, nextMsg(), ts + 1),
            // backdate at ts + 0
            client.publish(stream, nextMsg({
                backdated: true,
            }), ts),
            // resume at ts + 2
            client.publish(stream, nextMsg(), ts + 2),
            client.publish(stream, nextMsg(), ts + 2),
            client.publish(stream, nextMsg(), ts + 3),
        ])

        await waitForCondition(() => (
            msgsReceieved.length === msgsPublished.length
        ), 2000).catch(() => {}) // ignore, tests will fail anyway

        const lastMessage = msgsPublished[msgsPublished.length - 1]
        const waitForStorage = getWaitForStorage(client)
        await waitForStorage({
            msg: lastMessage,
            timeout: 6000,
            streamId: stream.id,
        })
        const msgsResent = []
        const sub = await client.resend({
            stream: stream.id,
            resend: {
                from: {
                    timestamp: 0
                },
            },
        }, (m) => msgsResent.push(m))
        await waitForEvent(sub, 'resent')

        expect(msgsReceieved).toEqual(msgsResent)
        // backdated messages disappear
        expect(msgsReceieved).toEqual(msgsPublished.filter(({ backdated }) => !backdated))

        const seq = toSeq(requests, ts)
        client.debug(seq)
        expect(seq).toEqual([
            [[0, 0], null],
            [[1, 0], [0, 0]],
            [[0, 0], [1, 0]], // bad message
            [[2, 0], [1, 0]],
            [[2, 1], [2, 0]],
            [[3, 0], [2, 1]],
        ])
    }, 10000)

    it('should sequence in order even if publish requests backdated in sequence', async () => {
        const ts = Date.now()
        const msgsPublished = []
        const msgsReceieved = []

        await client.subscribe(stream.id, (m) => msgsReceieved.push(m))

        const nextMsg = (...args) => {
            const msg = Msg(...args)
            msgsPublished.push(msg)
            return msg
        }

        const requests = await Promise.all([
            // first 3 messages at ts + 0
            client.publish(stream, nextMsg(), ts),
            client.publish(stream, nextMsg(), ts),
            client.publish(stream, nextMsg(), ts),
            // next two messages at ts + 1
            client.publish(stream, nextMsg(), ts + 1),
            client.publish(stream, nextMsg(), ts + 1),
            // backdate at ts + 0
            client.publish(stream, nextMsg({
                backdated: true,
            }), ts),
            // resume publishing at ts + 1
            client.publish(stream, nextMsg(), ts + 1),
            client.publish(stream, nextMsg(), ts + 1),
            client.publish(stream, nextMsg(), ts + 2),
            client.publish(stream, nextMsg(), ts + 2),
        ])

        await waitForCondition(() => (
            msgsReceieved.length === msgsPublished.length
        ), 2000).catch(() => {}) // ignore, tests will fail anyway

        const lastMessage = msgsPublished[msgsPublished.length - 1]
        const waitForStorage = getWaitForStorage(client)
        await waitForStorage({
            msg: lastMessage,
            timeout: 6000,
            streamId: stream.id,
        })

        const msgsResent = []
        const sub = await client.resend({
            stream: stream.id,
            resend: {
                from: {
                    timestamp: 0
                },
            },
        }, (m) => msgsResent.push(m))
        await waitForEvent(sub, 'resent')

        expect(msgsReceieved).toEqual(msgsResent)
        // backdated messages disappear
        expect(msgsReceieved).toEqual(msgsPublished.filter(({ backdated }) => !backdated))

        const seq = toSeq(requests, ts)
        expect(seq).toEqual([
            [[0, 0], null],
            [[0, 1], [0, 0]],
            [[0, 2], [0, 1]],
            [[1, 0], [0, 2]],
            [[1, 1], [1, 0]],
            [[0, 0], [1, 1]], // bad message
            [[1, 2], [1, 1]],
            [[1, 3], [1, 2]],
            [[2, 0], [1, 3]],
            [[2, 1], [2, 0]],
        ])
    }, 10000)
})
