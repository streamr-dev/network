import { wait } from 'streamr-test-utils'

import { describeRepeats, fakePrivateKey, getPublishTestMessages, getPublishTestStreamMessages, createTestStream } from '../utils'
import { StreamrClient } from '../../src/StreamrClient'

import clientOptions from './config'
import { Stream } from '../../src/Stream'
import { StorageNode } from '../../src/StorageNode'

describeRepeats('StreamrClient Resend', () => {
    let client: StreamrClient

    const createClient = (opts = {}) => {
        const c = new StreamrClient({
            ...clientOptions,
            // auth: {
//                 privateKey: fakePrivateKey(),
//            },
            autoConnect: false,
            autoDisconnect: false,
            // disconnectDelay: 500,
            // publishAutoDisconnectDelay: 250,
            maxRetries: 2,
            ...opts,
        })
        return c
    }

    afterEach(async () => {
        await wait(0)
        if (client) {
            client.debug('disconnecting after test')
            await client.disconnect()
        }
    })

    describe('StreamrClient', () => {
        let stream: Stream
        let publishTestMessages: ReturnType<typeof getPublishTestMessages>

        const createStream = async ({ requireSignedData = true, ...opts } = {}) => {
            const s = await createTestStream(client, module, {
                requireSignedData,
                ...opts,
            })
            await s.addToStorageNode(StorageNode.STREAMR_DOCKER_DEV)

            expect(s.id).toBeTruthy()
            expect(s.requireSignedData).toBe(requireSignedData)
            return s
        }

        beforeEach(async () => {
            client = createClient()
            await Promise.all([
                client.session.getSessionToken(),
                client.connect(),
            ])
            stream = await createStream()
            publishTestMessages = getPublishTestMessages(client, stream)
        })

        afterEach(async () => {
            await wait(0)

            if (client) {
                client.debug('disconnecting after test')
                await client.disconnect()
            }
        })

        let timestamps: number[] = []
        let published: any[] = []

        beforeEach(async () => {
            publishTestMessages = getPublishTestStreamMessages(client, stream, {
                waitForLast: true,
                waitForLastTimeout: 9000,
            })

            const publishedRaw = await publishTestMessages(5)
            // @ts-expect-error weird
            timestamps = publishedRaw.map((streamMessage) => streamMessage.getTimestamp())
            // @ts-expect-error weird
            published = publishedRaw.map((streamMessage) => streamMessage.getParsedContent())
        })

        it('resend last', async () => {
            const sub = await client.resend({
                stream: stream.id,
                resend: {
                    last: 3,
                },
            })

            expect(await sub.collect()).toEqual(published.slice(-3))
        })

        it('resend from', async () => {
            const sub = await client.resend({
                stream: stream.id,
                resend: {
                    from: {
                        timestamp: timestamps[3],
                    },
                },
            })

            expect(await sub.collect()).toEqual(published.slice(3))
        })

        it('resend range', async () => {
            const sub = await client.resend({
                stream: stream.id,
                resend: {
                    from: {
                        timestamp: timestamps[0],
                    },
                    to: {
                        timestamp: timestamps[3] - 1,
                    },
                },
            })

            expect(await sub.collect()).toEqual(published.slice(0, 3))
        })

        it('works with message handler + resent event', async () => {
            const messages: any[] = []
            const sub = await client.resend({
                stream: stream.id,
                resend: {
                    last: 3,
                },
            })

            await sub.collect()
            expect(messages).toEqual(published.slice(-3))
        })
    })
})
