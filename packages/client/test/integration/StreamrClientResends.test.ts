import { wait, waitForEvent } from 'streamr-test-utils'

import { describeRepeats, fakePrivateKey, getPublishTestMessages, createTestStream } from '../utils'
import { StreamrClient } from '../../src/StreamrClient'
import Connection from '../../src/Connection'

import clientOptions from './config'
import { Stream } from '../../src/stream'
import { StorageNode } from '../../src/stream/StorageNode'

describeRepeats('StreamrClient Resend', () => {
    let expectErrors = 0 // check no errors by default
    let errors: any[] = []

    const getOnError = (errs: any) => jest.fn((err) => {
        errs.push(err)
    })

    let onError = jest.fn()
    let client: StreamrClient

    const createClient = (opts = {}) => {
        const c = new StreamrClient({
            ...clientOptions,
            auth: {
                privateKey: fakePrivateKey(),
            },
            autoConnect: false,
            autoDisconnect: false,
            // disconnectDelay: 500,
            // publishAutoDisconnectDelay: 250,
            maxRetries: 2,
            ...opts,
        })
        c.onError = jest.fn()
        c.on('error', onError)
        return c
    }

    beforeEach(() => {
        errors = []
        expectErrors = 0
        onError = getOnError(errors)
    })

    afterEach(async () => {
        await wait(0)
        // ensure no unexpected errors
        expect(errors).toHaveLength(expectErrors)
        if (client) {
            expect(client.onError).toHaveBeenCalledTimes(expectErrors)
        }
    })

    afterEach(async () => {
        await wait(0)
        if (client) {
            client.debug('disconnecting after test')
            await client.disconnect()
        }

        const openSockets = Connection.getOpen()
        if (openSockets !== 0) {
            throw new Error(`sockets not closed: ${openSockets}`)
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
            publishTestMessages = getPublishTestMessages(client, {
                stream,
            })
            expect(onError).toHaveBeenCalledTimes(0)
        })

        afterEach(async () => {
            await wait(0)
            // ensure no unexpected errors
            expect(onError).toHaveBeenCalledTimes(expectErrors)
        })

        afterEach(async () => {
            await wait(0)

            if (client) {
                client.debug('disconnecting after test')
                await client.disconnect()
            }

            const openSockets = Connection.getOpen()
            if (openSockets !== 0) {
                await Connection.closeOpen()
                throw new Error(`sockets not closed: ${openSockets}`)
            }
        })

        let timestamps: number[] = []
        let published: any[] = []

        beforeEach(async () => {
            publishTestMessages = getPublishTestMessages(client, {
                stream,
                waitForLast: true,
                waitForLastTimeout: 9000,
            })

            const publishedRaw = await publishTestMessages.raw(5)
            timestamps = publishedRaw.map(([, raw]: any) => raw.streamMessage.getTimestamp())
            published = publishedRaw.map(([msg]: any) => msg)
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
            }, (msg) => {
                messages.push(msg)
            })

            await waitForEvent(sub, 'resent')
            expect(messages).toEqual(published.slice(-3))
        })
    })
})
