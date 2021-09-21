import { wait } from 'streamr-test-utils'

import { describeRepeats, uid, getCreateClient, Msg, publishManyGenerator, until } from '../utils'
import { StreamrClient } from '../../src/StreamrClient'

import { Stream } from '../../src/Stream'

jest.setTimeout(15000)

describeRepeats('StreamrClient', () => {
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
        await until(async () => { return client.streamExistsOnTheGraph(s.id) }, 100000, 1000)

        // await s.addToStorageNode(StorageNode.STREAMR_DOCKER_DEV)

        expect(s.id).toBeTruthy()
        return s
    }

    beforeEach(async () => {
        client = createClient()
        client.debug('create stream >>')
        stream = await createStream()
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
            const publish = client.publisher.publishFromMetadata(stream, source)
            const published = await client.publisher.collectMessages(publish, MAX_MESSAGES)
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
                const publish = client.publisher.publishFromMetadata(testStream, source)
                const published = await client.publisher.collectMessages(publish, MAX_MESSAGES)
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
            const tasks = [
                testPubSub(stream),
                testPubSub(stream2),
            ]
            await Promise.allSettled(tasks)
            await Promise.all(tasks)
        })
    })
})
