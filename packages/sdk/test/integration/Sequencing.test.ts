import 'reflect-metadata'

import { collect, merge, wait, until } from '@streamr/utils'
import { Message } from '../../src/Message'
import { Stream } from '../../src/Stream'
import { StreamrClient } from '../../src/StreamrClient'
import { FakeEnvironment } from '../test-utils/fake/FakeEnvironment'
import { getWaitForStorage } from '../test-utils/publish'
import { createTestStream, uid } from '../test-utils/utils'

const Msg = (opts?: any) => {
    return merge(
        {
            value: uid('msg')
        },
        opts
    )
}

function toSeq(requests: Message[], ts = Date.now()) {
    return requests.map((msg) => {
        const { prevMsgRef } = msg.streamMessage
        return [
            [msg.timestamp - ts, msg.sequenceNumber],
            prevMsgRef ? [prevMsgRef.timestamp - ts, prevMsgRef.sequenceNumber] : null
        ]
    })
}

describe('Sequencing', () => {
    let client: StreamrClient
    let stream: Stream
    let environment: FakeEnvironment

    beforeEach(async () => {
        environment = new FakeEnvironment()
        client = environment.createClient()
        stream = await createTestStream(client, module)
    })

    afterEach(async () => {
        await environment.destroy()
    })

    it('should sequence in order', async () => {
        const ts = Date.now()
        const msgsPublished: any[] = []
        const msgsReceieved: any[] = []

        await client.subscribe(stream.id, (m) => {
            msgsReceieved.push(m)
        })

        const nextMsg = () => {
            const msg = Msg()
            msgsPublished.push(msg)
            return msg
        }

        const requests = await Promise.all([
            // first 2 messages at ts + 0
            client.publish(stream, nextMsg(), { timestamp: ts }),
            client.publish(stream, nextMsg(), { timestamp: ts }),
            // next two messages at ts + 1
            client.publish(stream, nextMsg(), { timestamp: ts + 1 }),
            client.publish(stream, nextMsg(), { timestamp: ts + 1 })
        ])
        const seq = toSeq(requests, ts)
        expect(seq).toEqual([
            [[0, 0], null],
            [
                [0, 1],
                [0, 0]
            ],
            [
                [1, 0],
                [0, 1]
            ],
            [
                [1, 1],
                [1, 0]
            ]
        ])

        await until(() => msgsReceieved.length === msgsPublished.length, 8000).catch(() => {}) // ignore, tests will fail anyway

        expect(msgsReceieved).toEqual(msgsPublished)
    }, 10000)

    it('should sequence in order even if some calls delayed', async () => {
        const ts = Date.now()
        const msgsPublished: any[] = []
        const msgsReceieved: any[] = []

        let calls = 0
        const getStream = client.getStream.bind(client)
        client.getStream = async (...args) => {
            // delay getStream call
            calls += 1
            if (calls === 2) {
                const result = await getStream(...args)
                // delay resolving this call
                await wait(100)
                return result
            }
            return getStream(...args)
        }

        const nextMsg = () => {
            const msg = Msg()
            msgsPublished.push(msg)
            return msg
        }

        await client.subscribe(stream.id, (m) => {
            msgsReceieved.push(m)
        })
        const requests = await Promise.all([
            // first 2 messages at ts + 0
            client.publish(stream, nextMsg(), { timestamp: ts }),
            client.publish(stream, nextMsg(), { timestamp: ts }),
            // next two messages at ts + 1
            client.publish(stream, nextMsg(), { timestamp: ts + 1 }),
            client.publish(stream, nextMsg(), { timestamp: ts + 1 })
        ])
        const seq = toSeq(requests, ts)
        expect(seq).toEqual([
            [[0, 0], null],
            [
                [0, 1],
                [0, 0]
            ],
            [
                [1, 0],
                [0, 1]
            ],
            [
                [1, 1],
                [1, 0]
            ]
        ])

        await until(() => msgsReceieved.length === msgsPublished.length, 5000).catch(() => {}) // ignore, tests will fail anyway

        expect(msgsReceieved).toEqual(msgsPublished)
    }, 10000)

    // Skipped because backend seems to reject these now
    it.skip('should sequence in order even if publish requests backdated', async () => {
        const ts = Date.now()
        const msgsPublished: any[] = []
        const msgsReceieved: any[] = []

        await client.subscribe(stream.id, (m) => {
            msgsReceieved.push(m)
        })

        const nextMsg = (...args: any[]) => {
            const msg = Msg(...args)
            msgsPublished.push(msg)
            return msg
        }

        const requests = await Promise.all([
            // publish at ts + 0
            client.publish(stream, nextMsg(), { timestamp: ts }),
            // publish at ts + 1
            client.publish(stream, nextMsg(), { timestamp: ts + 1 }),
            // backdate at ts + 0
            client.publish(
                stream,
                nextMsg({
                    backdated: true
                }),
                { timestamp: ts }
            ),
            // resume at ts + 2
            client.publish(stream, nextMsg(), { timestamp: ts + 2 }),
            client.publish(stream, nextMsg(), { timestamp: ts + 2 }),
            client.publish(stream, nextMsg(), { timestamp: ts + 3 })
        ])

        await until(() => msgsReceieved.length === msgsPublished.length, 2000).catch(() => {}) // ignore, tests will fail anyway

        const lastRequest = requests[requests.length - 1]
        const waitForStorage = getWaitForStorage(client, {
            stream,
            timeout: 6000
        })
        await waitForStorage(lastRequest)
        const sub = await client.resend(stream.id, {
            from: {
                timestamp: 0
            }
        })
        const msgsResent = (await collect(sub)).map((m) => m.content)

        expect(msgsReceieved).toEqual(msgsResent)
        // backdated messages disappear
        expect(msgsReceieved).toEqual(msgsPublished.filter(({ backdated }) => !backdated))

        const seq = toSeq(requests, ts)
        expect(seq).toEqual([
            [[0, 0], null],
            [
                [1, 0],
                [0, 0]
            ],
            [
                [0, 0],
                [1, 0]
            ], // bad message
            [
                [2, 0],
                [1, 0]
            ],
            [
                [2, 1],
                [2, 0]
            ],
            [
                [3, 0],
                [2, 1]
            ]
        ])
    }, 10000)

    it.skip('should sequence in order even if publish requests backdated in sequence', async () => {
        const ts = Date.now()
        const msgsPublished: any[] = []
        const msgsReceieved: any[] = []

        await client.subscribe(stream.id, (m) => msgsReceieved.push(m))

        const nextMsg = (...args: any[]) => {
            const msg = Msg(...args)
            msgsPublished.push(msg)
            return msg
        }

        const requests = await Promise.all([
            // first 3 messages at ts + 0
            client.publish(stream, nextMsg(), { timestamp: ts }),
            client.publish(stream, nextMsg(), { timestamp: ts }),
            client.publish(stream, nextMsg(), { timestamp: ts }),
            // next two messages at ts + 1
            client.publish(stream, nextMsg(), { timestamp: ts + 1 }),
            client.publish(stream, nextMsg(), { timestamp: ts + 1 }),
            // backdate at ts + 0
            client.publish(
                stream,
                nextMsg({
                    backdated: true
                }),
                { timestamp: ts }
            ),
            // resume publishing at ts + 1
            client.publish(stream, nextMsg(), { timestamp: ts + 1 }),
            client.publish(stream, nextMsg(), { timestamp: ts + 1 }),
            client.publish(stream, nextMsg(), { timestamp: ts + 2 }),
            client.publish(stream, nextMsg(), { timestamp: ts + 2 })
        ])

        await until(() => msgsReceieved.length === msgsPublished.length, 2000).catch(() => {}) // ignore, tests will fail anyway

        const lastRequest = requests[requests.length - 1]
        const waitForStorage = getWaitForStorage(client, {
            stream,
            timeout: 6000
        })
        await waitForStorage(lastRequest)

        const sub = await client.resend(stream.id, {
            from: {
                timestamp: 0
            }
        })
        const msgsResent = (await collect(sub)).map((m) => m.content)

        expect(msgsReceieved).toEqual(msgsResent)
        // backdated messages disappear
        expect(msgsReceieved).toEqual(msgsPublished.filter(({ backdated }) => !backdated))

        const seq = toSeq(requests, ts)
        expect(seq).toEqual([
            [[0, 0], null],
            [
                [0, 1],
                [0, 0]
            ],
            [
                [0, 2],
                [0, 1]
            ],
            [
                [1, 0],
                [0, 2]
            ],
            [
                [1, 1],
                [1, 0]
            ],
            [
                [0, 0],
                [1, 1]
            ], // bad message
            [
                [1, 2],
                [1, 1]
            ],
            [
                [1, 3],
                [1, 2]
            ],
            [
                [2, 0],
                [1, 3]
            ],
            [
                [2, 1],
                [2, 0]
            ]
        ])
    }, 10000)
})
