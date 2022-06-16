import { wait } from 'streamr-test-utils'

import { getCreateClient, Msg, publishManyGenerator, uid, publishFromMetadata } from '../test-utils/utils'
import { StreamrClient } from '../../src/StreamrClient'

import { Stream } from '../../src/Stream'
import { StreamPermission } from '../../src'
import { collect } from '../../src/utils/GeneratorUtils'

const TEST_TIMEOUT = 60 * 1000

jest.setTimeout(TEST_TIMEOUT)

describe('StreamrClient', () => {
    const MAX_MESSAGES = 10
    let expectErrors = 0 // check no errors by default
    let errors: any[] = []

    const getOnError = (errs: any) => jest.fn((err) => {
        errs.push(err)
    })

    let onError = jest.fn()
    let client: StreamrClient

    const createClient = getCreateClient()

    beforeEach(() => {
        errors = []
        expectErrors = 0
        onError = getOnError(errors)
    })

    afterEach(async () => {
        await wait(0)
        // ensure no unexpected errors
        expect(errors).toHaveLength(expectErrors)
    })

    let stream: Stream

    const createStream = async ({ ...opts } = {}) => {
        const id = `/${uid('stream')}`
        const s = await client.createStream({
            id,
            partitions: 1,
            ...opts,
        })
        expect(s.id).toBeTruthy()
        return s
    }

    beforeEach(async () => {
        client = await createClient()
        client.debug('create stream >>')
        stream = await createStream()
        await stream.grantPermissions({ permissions: [StreamPermission.SUBSCRIBE], public: true })
        client.debug('create stream <<')
        expect(onError).toHaveBeenCalledTimes(0)
    })

    describe('Pub/Sub', () => {
        it('can successfully pub/sub 1 message', async () => {
            const sub = await client.subscribe({
                streamId: stream.id,
            })
            const testMsg = Msg()
            await client.publish(stream.id, testMsg)
            const received = []
            for await (const msg of sub) {
                received.push(msg.getParsedContent())
                if (received.length === 1) {
                    break
                }
            }
            expect(received).toEqual([testMsg])
        })

        it('can successfully pub/sub multiple messages', async () => {
            const sub = await client.subscribe({
                streamId: stream.id,
            })
            const source = publishManyGenerator(MAX_MESSAGES, { timestamp: 1111111 })
            const publish = publishFromMetadata(stream, source, client)
            const published = await collect(publish, MAX_MESSAGES)
            const received = []
            for await (const msg of sub) {
                received.push(msg)
                if (received.length === published.length) {
                    break
                }
            }

            expect(received.map((s) => s.getParsedContent())).toEqual(published.map((s) => s.getParsedContent()))
            expect(received.map((streamMessage) => streamMessage.getTimestamp())).toEqual(published.map(() => 1111111))
        })

        it('can successfully pub/sub multiple streams', async () => {
            async function testPubSub(testStream: Stream) {
                const sub = await client.subscribe({
                    streamId: testStream.id,
                })
                const source = publishManyGenerator(MAX_MESSAGES, { timestamp: 1111111 })
                const publish = publishFromMetadata(testStream, source, client)
                const published = await collect(publish, MAX_MESSAGES)
                const received = []
                for await (const msg of sub) {
                    received.push(msg)
                    if (received.length === published.length) {
                        break
                    }
                }
                expect(received.map((s) => s.getParsedContent())).toEqual(published.map((s) => s.getParsedContent()))
                return expect(received.map((streamMessage) => streamMessage.getTimestamp())).toEqual(published.map(() => 1111111))
            }
            const stream2 = await createStream()
            await stream2.grantPermissions({ permissions: [StreamPermission.SUBSCRIBE], public: true })

            const tasks = [
                testPubSub(stream),
                testPubSub(stream2),
            ]
            await Promise.allSettled(tasks)
            await Promise.all(tasks)
        })
    })
})
