import fs from 'fs'
import path from 'path'
import { StreamMessage, StreamPartID, StreamPartIDUtils } from 'streamr-client-protocol'
import { fastPrivateKey, fastWallet } from 'streamr-test-utils'
import { wait } from '@streamr/utils'
import {
    Msg,
    createTestMessages,
    getPublishTestStreamMessages
} from '../test-utils/publish'
import { StreamrClient } from '../../src/StreamrClient'
import { Defer } from '../../src/utils/Defer'
import * as G from '../../src/utils/GeneratorUtils'
import { FakeEnvironment } from '../test-utils/fake/FakeEnvironment'
import { StreamPermission } from '../../src/permission'
import { createTestStream } from '../test-utils/utils'

// TODO rename this test to something more specific (and maybe divide to multiple test files?)

const MAX_MESSAGES = 10
const TIMEOUT = 30 * 1000
const WAIT_TIME = 600

describe('StreamrClient', () => {
    let client: StreamrClient
    let publishTestMessages: ReturnType<typeof getPublishTestStreamMessages>
    let streamDefinition: StreamPartID
    let privateKey: string
    let environment: FakeEnvironment

    beforeEach(async () => {
        privateKey = fastPrivateKey()
        environment = new FakeEnvironment()
        client = environment.createClient({
            auth: {
                privateKey
            }
        })
        const stream = await createTestStream(client, module)
        streamDefinition = stream.getStreamParts()[0]
        const publisherWallet = fastWallet()
        await stream.grantPermissions({
            user: publisherWallet.address,
            permissions: [StreamPermission.PUBLISH]
        })
        publishTestMessages = getPublishTestStreamMessages(environment.createClient({
            auth: {
                privateKey: publisherWallet.privateKey
            }
        }), streamDefinition)
    })

    describe('Pub/Sub', () => {
        it('client.publish does not error', async () => {
            await client.publish(streamDefinition, {
                test: 'client.publish',
            })
            await wait(WAIT_TIME)
        }, TIMEOUT)

        it('Stream.publish does not error', async () => {
            const stream = await client.getStream(StreamPartIDUtils.getStreamID(streamDefinition))
            await stream.publish({
                test: 'Stream.publish',
            })
            await wait(WAIT_TIME)
        }, TIMEOUT)

        it('client.publish with Stream object as arg', async () => {
            const stream = await client.getStream(StreamPartIDUtils.getStreamID(streamDefinition))
            await client.publish(stream, {
                test: 'client.publish.Stream.object',
            })
            await wait(WAIT_TIME)
        }, TIMEOUT)

        describe('subscribe/unsubscribe', () => {
            beforeEach(async () => {
                expect(await client.getSubscriptions()).toHaveLength(0)
            })

            it('client.subscribe then unsubscribe after subscribed', async () => {
                const subTask = client.subscribe<{ test: string }>(streamDefinition, () => {})
                expect(await client.getSubscriptions()).toHaveLength(0) // does not have subscription yet

                const sub = await subTask

                expect(await client.getSubscriptions()).toHaveLength(1)
                await client.unsubscribe(sub)
                expect(await client.getSubscriptions()).toHaveLength(0)
            }, TIMEOUT)

            it('client.subscribe then unsubscribe before subscribed', async () => {
                const subTask = client.subscribe(streamDefinition, () => {})

                expect(await client.getSubscriptions()).toHaveLength(0) // does not have subscription yet

                const unsubTask = client.unsubscribe(streamDefinition)

                expect(await client.getSubscriptions()).toHaveLength(0) // lost subscription immediately
                await unsubTask
                await subTask
                await wait(WAIT_TIME)
            }, TIMEOUT)
        })

        it('client.subscribe (realtime) with onMessage signal', async () => {
            const done = Defer()
            const msg = Msg()

            const sub = await client.subscribe<typeof msg>(streamDefinition)

            sub.onMessage.listen(done.wrap(async (streamMessage) => {
                sub.unsubscribe()
                const parsedContent = streamMessage.getParsedContent()
                expect(parsedContent).toEqual(msg)

                // Check signature stuff
                expect(streamMessage.signatureType).toBe(StreamMessage.SIGNATURE_TYPES.ETH)
                expect(streamMessage.getPublisherId()).toBeTruthy()
                expect(streamMessage.signature).toBeTruthy()
            }))

            // Publish after subscribed
            await client.publish(streamDefinition, msg)
            await sub.consume()
            await done
        })

        it('client.subscribe (realtime) with onMessage callback', async () => {
            const done = Defer()
            const msg = Msg()
            await client.subscribe<typeof msg>(streamDefinition, done.wrap(async (parsedContent, streamMessage) => {
                expect(parsedContent).toEqual(msg)

                // Check signature stuff
                expect(streamMessage.signatureType).toBe(StreamMessage.SIGNATURE_TYPES.ETH)
                expect(streamMessage.getPublisherId()).toBeTruthy()
                expect(streamMessage.signature).toBeTruthy()
            }))

            // Publish after subscribed
            await client.publish(streamDefinition, msg)
            await done
        })

        it('client.subscribe with onMessage & collect', async () => {
            const onMessageMsgs: StreamMessage[] = []
            const done = Defer()
            const sub = await client.subscribe(streamDefinition, async (_content, msg) => {
                onMessageMsgs.push(msg)
                if (onMessageMsgs.length === MAX_MESSAGES) {
                    done.resolve(undefined)
                }
            })

            const published = await publishTestMessages(MAX_MESSAGES)
            await expect(async () => sub.collect(1)).rejects.toThrow()
            await done
            expect(onMessageMsgs.map(((m) => m.signature))).toEqual(published.map(((m) => m.signature)))
        })

        it('client.subscribe with onMessage callback that throws', async () => {
            const onMessageMsgs: StreamMessage[] = []
            const err = new Error('expected error')
            const sub = await client.subscribe(streamDefinition, async (_content, msg) => {
                onMessageMsgs.push(msg)
                if (onMessageMsgs.length === MAX_MESSAGES) {
                    sub.return()
                }
                throw err
            })

            const onSubError = jest.fn()
            sub.onError.listen(onSubError)

            const published = await publishTestMessages(MAX_MESSAGES)
            await sub.onFinally.listen()
            expect(onMessageMsgs.map(((m) => m.signature))).toEqual(published.slice(0, 1).map(((m) => m.signature)))
            expect(onSubError).toHaveBeenCalledTimes(1)
            expect(onSubError).toHaveBeenCalledWith(err)
        })

        it('publish and subscribe a sequence of messages', async () => {
            const done = Defer()
            const received: StreamMessage[] = []
            const sub = await client.subscribe<any>(streamDefinition, done.wrapError((_content, streamMessage) => {
                received.push(streamMessage)
                // Check signature stuff
                expect(streamMessage.signatureType).toBe(StreamMessage.SIGNATURE_TYPES.ETH)
                expect(streamMessage.getPublisherId()).toBeTruthy()
                expect(streamMessage.signature).toBeTruthy()
                if (received.length === MAX_MESSAGES) {
                    done.resolve(client.unsubscribe(sub))
                }
            }))

            // Publish after subscribed
            const published = await publishTestMessages(MAX_MESSAGES)

            await done
            expect(received.map((m) => m.signature)).toEqual(published.map(((m) => m.signature)))
        })

        it('destroying stops publish', async () => {
            let publishedCount = 0
            const publishTask = (async () => {
                for (let i = 0; i < MAX_MESSAGES; i += 1) {
                    // eslint-disable-next-line no-await-in-loop
                    await client.publish(streamDefinition, Msg())
                    // eslint-disable-next-line no-plusplus
                    publishedCount++
                    if (publishedCount === 3) {
                        await client.destroy()
                    }
                }
            })()
            await expect(() => publishTask).rejects.toThrow('publish')
            expect(publishedCount).toBe(3)
        })

        it('destroying resolves publish promises', async () => {
            // the subscriber side of this test is partially disabled as we
            // can't yet reliably publish messages then disconnect and know
            // that subscriber will actually get something.
            // Probably needs to wait for propagation.
            const subscriber = environment.createClient({
                auth: {
                    privateKey
                }
            })

            const received: any[] = []
            await subscriber.subscribe(streamDefinition, (msg) => {
                received.push(msg)
            })

            const msgs = await G.collect(createTestMessages(MAX_MESSAGES))

            const publishTasks = [
                client.publish(streamDefinition, msgs[0]).finally(async () => {
                    await client.destroy()
                }),
                client.publish(streamDefinition, msgs[1]),
                client.publish(streamDefinition, msgs[2]),
                client.publish(streamDefinition, msgs[3]),
            ]
            const results = await Promise.allSettled(publishTasks)
            expect(results.map((r) => r.status)).toEqual(['fulfilled', 'rejected', 'rejected', 'rejected'])
            await wait(500)
            // should probably get every publish that was fulfilled, right?
            // expect(received).toEqual([msgs[0].content])
        })

        it('cannot subscribe or publish after destroy', async () => {
            await client.destroy()
            await expect(async () => {
                await client.subscribe(streamDefinition)
            }).rejects.toThrow('destroy')
            await expect(async () => {
                await client.publish(streamDefinition, Msg())
            }).rejects.toThrow('destroy')
            await expect(async () => {
                await client.connect()
            }).rejects.toThrow('destroy')
        })
    })

    describe('utf-8 encoding', () => {
        it('decodes realtime messages correctly', async () => {
            const publishedMessage = Msg({
                content: fs.readFileSync(path.join(__dirname, '../data/utf8Example.txt'), 'utf8')
            })
            const sub = await client.subscribe(streamDefinition)
            await client.publish(streamDefinition, publishedMessage)
            const messages = await sub.collect(1)
            expect(messages.map((s) => s.getParsedContent())).toEqual([publishedMessage])
        })
    })
})
