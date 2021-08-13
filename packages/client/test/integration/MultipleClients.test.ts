import { wait, waitForCondition } from 'streamr-test-utils'

import { describeRepeats, uid, fakePrivateKey, addAfterFn, createTestStream } from '../utils'
import { getPublishTestMessages, getWaitForStorage } from './brubeck/utils'
import { BrubeckClient as StreamrClient } from '../../src/BrubeckClient'
import { counterId } from '../../src/utils'
import { StorageNode } from '../../src/StorageNode'
import { Stream, StreamOperation } from '../../src/Stream'

import clientOptions from './config'

const createClient = (opts: any = {}) => new StreamrClient({
    ...clientOptions,
    auth: {
        privateKey: fakePrivateKey()
    },
    autoConnect: false,
    autoDisconnect: false,
    // disconnectDelay: 1,
    // publishAutoDisconnectDelay: 1,
    ...opts,
})

const MAX_MESSAGES = 3

describeRepeats('PubSub with multiple clients', () => {
    let stream: Stream
    let mainClient: StreamrClient
    let otherClient: StreamrClient
    let privateKey: string
    let errors: Error[] = []

    const addAfter = addAfterFn()

    const getOnError = (errs: Error[]) => jest.fn((err) => {
        errs.push(err)
    })

    beforeEach(async () => {
        errors = []
        privateKey = fakePrivateKey()

        mainClient = createClient({
            id: 'main',
            auth: {
                privateKey
            }
        })
        // mainClient.on('error', getOnError(errors))
        stream = await createTestStream(mainClient, module)
        await stream.addToStorageNode(StorageNode.STREAMR_DOCKER_DEV)
    })

    afterEach(async () => {
        if (mainClient) {
            mainClient.debug('disconnecting after test')
            await mainClient.disconnect()
        }

        if (otherClient) {
            otherClient.debug('disconnecting after test')
            await otherClient.disconnect()
        }

        expect(errors).toEqual([])
    })

    async function createPublisher(opts = {}) {
        const pubClient = createClient({
            auth: {
                privateKey: fakePrivateKey(),
            },
            ...opts,
        })
        const publisherId = (await pubClient.getAddress()).toLowerCase()

        addAfter(async () => {
            counterId.clear(publisherId) // prevent overflows in counter
            await pubClient.disconnect()
        })

        // pubClient.on('error', getOnError(errors))
        const pubUser = await pubClient.getUserInfo()
        await stream.grantPermission(StreamOperation.STREAM_GET, pubUser.username)
        await stream.grantPermission(StreamOperation.STREAM_PUBLISH, pubUser.username)
        // needed to check last
        await stream.grantPermission(StreamOperation.STREAM_SUBSCRIBE, pubUser.username)
        await pubClient.session.getSessionToken()
        await pubClient.connect()

        return pubClient
    }

    async function createSubscriber(opts = {}) {
        const client = createClient({
            id: 'subscriber',
            auth: {
                privateKey
            },
            ...opts,
        })

        addAfter(async () => (
            client.disconnect()
        ))

        // client.on('error', getOnError(errors))
        await client.session.getSessionToken()
        const user = await client.getUserInfo()

        await stream.grantPermission(StreamOperation.STREAM_GET, user.username)
        await stream.grantPermission(StreamOperation.STREAM_SUBSCRIBE, user.username)
        await client.connect()
        return client
    }

    function checkMessages<T>(published: Record<string, T[]>, received: Record<string, T[]>) {
        for (const [key, msgs] of Object.entries(published)) {
            expect(received[key]).toEqual(msgs)
        }
    }

    describe('can get messages published from other client', () => {
        test('it works', async () => {
            otherClient = await createSubscriber()
            await mainClient.connect()

            const receivedMessagesOther: any[] = []
            const receivedMessagesMain: any[] = []
            // subscribe to stream from other client instance
            await otherClient.subscribe({
                stream: stream.id,
            }, (msg) => {
                receivedMessagesOther.push(msg)
            })
            // subscribe to stream from main client instance
            await mainClient.subscribe({
                stream: stream.id,
            }, (msg) => {
                receivedMessagesMain.push(msg)
            })
            const message = {
                msg: uid('message'),
            }
            // publish message on main client
            await mainClient.publish(stream, message)
            await wait(5000)
            // messages should arrive on both clients?
            expect(receivedMessagesMain).toEqual([message])
            expect(receivedMessagesOther).toEqual([message])
        }, 60000)
        /*
        describe('subscriber disconnects after each message (uses resend)', () => {
            test('single subscriber', async () => {
                const maxMessages = MAX_MESSAGES + Math.floor(Math.random() * MAX_MESSAGES * 0.25)
                otherClient = await createSubscriber()
                await mainClient.connect()

                const receivedMessagesOther: any[] = []
                const msgs = receivedMessagesOther
                const otherDone = Defer()
                // subscribe to stream from other client instance
                await otherClient.subscribe({
                    stream: stream.id,
                }, (msg) => {
                    receivedMessagesOther.push(msg)
                    onConnectionMessage()

                    if (receivedMessagesOther.length === maxMessages) {
                        cancelled = true
                        otherDone.resolve(undefined)
                    }
                })

                let cancelled = false
                const localOtherClient = otherClient // capture so no chance of disconnecting wrong client
                let reconnected = Defer()

                const disconnect = async () => {
                    if (localOtherClient !== otherClient) {
                        throw new Error('not equal')
                    }

                    if (cancelled || msgs.length === MAX_MESSAGES) {
                        reconnected.resolve(undefined)
                        return
                    }

                    await wait(500) // some backend bug causes subs to stop working if we disconnect too quickly
                    if (cancelled || msgs.length === MAX_MESSAGES) {
                        reconnected.resolve(undefined)
                        return
                    }

                    if (localOtherClient !== otherClient) {
                        throw new Error('not equal')
                    }
                    await localOtherClient.nextConnection()
                    if (cancelled || msgs.length === MAX_MESSAGES) {
                        reconnected.resolve(undefined)
                        return
                    }

                    if (localOtherClient !== otherClient) {
                        throw new Error('not equal')
                    }
                    localOtherClient.connection.socket.close()
                    // wait for reconnection before possibly disconnecting again
                    await localOtherClient.nextConnection()
                    const p = reconnected
                    p.resolve(undefined)
                    reconnected = Defer()
                }

                const onConnectionMessage = jest.fn(() => {
                    // disconnect after every message
                    disconnect()
                })

                const onConnected = jest.fn()
                const onDisconnected = jest.fn()
                otherClient.connection.on('connected', onConnected)
                otherClient.connection.on('disconnected', onDisconnected)
                addAfter(() => {
                    otherClient.connection.off('connected', onConnected)
                    otherClient.connection.off('disconnected', onDisconnected)
                })
                let t = 0
                const publishTestMessages = getPublishTestMessages(mainClient, {
                    stream,
                    delay: 600,
                    timestamp: () => {
                        t += 1
                        return t
                    },
                    waitForLast: true,
                    waitForLastTimeout: 10000,
                    waitForLastCount: maxMessages,
                })

                const published = await publishTestMessages(maxMessages)
                await otherDone

                expect(receivedMessagesOther).toEqual(published)
            }, 60000)

            test('publisher also subscriber', async () => {
                const maxMessages = MAX_MESSAGES + Math.floor(Math.random() * MAX_MESSAGES * 0.25)
                otherClient = await createSubscriber()
                await mainClient.connect()

                const receivedMessagesOther = []
                const msgs = receivedMessagesOther
                const receivedMessagesMain = []
                const mainDone = Defer()
                const otherDone = Defer()
                // subscribe to stream from other client instance
                await otherClient.subscribe({
                    stream: stream.id,
                }, (msg) => {
                    otherClient.debug('other %d of %d', receivedMessagesOther.length, maxMessages, msg.value)
                    receivedMessagesOther.push(msg)

                    if (receivedMessagesOther.length === maxMessages) {
                        otherDone.resolve()
                    }
                })

                const disconnect = pLimitFn(async () => {
                    if (msgs.length === maxMessages) { return }
                    otherClient.debug('disconnecting...', msgs.length)
                    otherClient.connection.socket.close()
                    // wait for reconnection before possibly disconnecting again
                    await otherClient.nextConnection()
                    otherClient.debug('reconnected...', msgs.length)
                })

                const onConnectionMessage = jest.fn(() => {
                    disconnect.clear()
                    // disconnect after every message
                    disconnect()
                })

                otherClient.connection.on(ControlMessage.TYPES.BroadcastMessage, onConnectionMessage)
                otherClient.connection.on(ControlMessage.TYPES.UnicastMessage, onConnectionMessage)
                // subscribe to stream from main client instance
                await mainClient.subscribe({
                    stream: stream.id,
                }, (msg) => {
                    mainClient.debug('main %d of %d', receivedMessagesOther.length, maxMessages, msg.value)
                    receivedMessagesMain.push(msg)
                    if (receivedMessagesMain.length === maxMessages) {
                        mainDone.resolve()
                    }
                })

                let t = 0

                const publishTestMessages = getPublishTestMessages(mainClient, {
                    stream,
                    delay: 600,
                    waitForLast: true,
                    waitForLastTimeout: 10000,
                    waitForLastCount: maxMessages,
                    timestamp: () => {
                        t += 1
                        return t
                    },
                })
                const published = await publishTestMessages(maxMessages)
                mainClient.debug('publish done')
                mainDone.then(() => mainClient.debug('done')).catch(() => {})
                otherDone.then(() => otherClient.debug('done')).catch(() => {})
                await mainDone
                await otherDone

                // messages should arrive on both clients?
                expect(receivedMessagesMain).toEqual(published)
                expect(receivedMessagesOther).toEqual(published)
            }, 60000)
        })
        */
    })

    describe('multiple publishers (uses resend)', () => {
        test('works with multiple publishers on a single stream', async () => {
            // this creates two subscriber clients and multiple publisher clients
            // all subscribing and publishing to same stream
            await mainClient.session.getSessionToken()
            await mainClient.connect()

            otherClient = await createSubscriber()

            const receivedMessagesOther: Record<string, any[]> = {}
            const receivedMessagesMain: Record<string, any[]> = {}
            // subscribe to stream from other client instance
            await otherClient.subscribe({
                stream: stream.id,
            }, (msg, streamMessage) => {
                const msgs = receivedMessagesOther[streamMessage.getPublisherId().toLowerCase()] || []
                msgs.push(msg)
                receivedMessagesOther[streamMessage.getPublisherId().toLowerCase()] = msgs
            })

            // subscribe to stream from main client instance
            await mainClient.subscribe({
                stream: stream.id,
            }, (msg, streamMessage) => {
                const msgs = receivedMessagesMain[streamMessage.getPublisherId().toLowerCase()] || []
                msgs.push(msg)
                receivedMessagesMain[streamMessage.getPublisherId().toLowerCase()] = msgs
            })

            /* eslint-disable no-await-in-loop */
            // const publishers = []
            // for (let i = 0; i < 3; i++) {
            // publishers.push(await createPublisher({
            // id: `publisher-${i}`,
            // }))
            // }
            const publishers = [mainClient]
            /* eslint-enable no-await-in-loop */
            const published: Record<string, any[]> = {}
            await Promise.all(publishers.map(async (pubClient) => {
                const publisherId = (await pubClient.getAddress()).toLowerCase()
                addAfter(() => {
                    counterId.clear(publisherId) // prevent overflows in counter
                })
                const publishTestMessages = getPublishTestMessages(pubClient, stream, {
                    // delay: 500 + Math.random() * 1500,
                    waitForLast: true,
                    waitForLastTimeout: 10000,
                    waitForLastCount: MAX_MESSAGES * publishers.length,
                    createMessage: ({ batchId }) => ({
                        batchId,
                        value: counterId(publisherId),
                    }),
                })
                published[publisherId] = await publishTestMessages(MAX_MESSAGES)
            }))

            await waitForCondition(() => {
                try {
                    checkMessages(published, receivedMessagesMain)
                    checkMessages(published, receivedMessagesOther)
                    return true
                } catch (err) {
                    return false
                }
            }, 5000).catch((err) => {
                checkMessages(published, receivedMessagesMain)
                checkMessages(published, receivedMessagesOther)
                throw err
            })

            checkMessages(published, receivedMessagesMain)
            checkMessages(published, receivedMessagesOther)
        }, 60000)

        test('works with multiple publishers on one stream with late subscriber', async () => {
            // this creates two subscriber clients and multiple publisher clients
            // all subscribing and publishing to same stream
            // the otherClient subscribes after the 3rd message hits storage
            otherClient = await createSubscriber()
            await mainClient.session.getSessionToken()
            await mainClient.connect()

            const receivedMessagesOther: Record<string, any[]> = {}
            const receivedMessagesMain: Record<string, any[]> = {}

            // subscribe to stream from main client instance
            const mainSub = await mainClient.subscribe({
                stream: stream.id,
            }, (msg, streamMessage) => {
                const key = streamMessage.getPublisherId().toLowerCase()
                const msgs = receivedMessagesMain[key] || []
                msgs.push(msg)
                receivedMessagesMain[key] = msgs
                if (Object.values(receivedMessagesMain).every((m) => m.length === MAX_MESSAGES)) {
                    mainSub.unsubscribe()
                }
            })

            /* eslint-disable no-await-in-loop */
            const publishers = []
            for (let i = 0; i < 3; i++) {
                publishers.push(await createPublisher({
                    id: `publisher-${i}`,
                }))
            }

            /* eslint-enable no-await-in-loop */
            let counter = 0
            const published: Record<string, any[]> = {}
            await Promise.all(publishers.map(async (pubClient) => {
                const waitForStorage = getWaitForStorage(pubClient, {
                    stream,
                    timeout: 10000,
                    count: MAX_MESSAGES * publishers.length,
                })

                const publisherId = (await pubClient.getAddress()).toLowerCase()
                addAfter(() => {
                    counterId.clear(publisherId) // prevent overflows in counter
                })

                const publishTestMessages = getPublishTestMessages(pubClient, stream, {
                    waitForLast: true,
                    waitForLastTimeout: 10000,
                    waitForLastCount: MAX_MESSAGES * publishers.length,
                    delay: 500 + Math.random() * 1500,
                    createMessage: () => ({
                        value: counterId(publisherId),
                    }),
                })

                async function addLateSubscriber() {
                    // late subscribe to stream from other client instance
                    const lateSub = await otherClient.subscribe({
                        stream: stream.id,
                    }, (msg, streamMessage) => {
                        const key = streamMessage.getPublisherId().toLowerCase()
                        const msgs = receivedMessagesOther[key] || []
                        msgs.push(msg)
                        receivedMessagesOther[key] = msgs
                    })

                    addAfter(async () => {
                        await lateSub.unsubscribe()
                    })
                }

                published[publisherId] = await publishTestMessages(MAX_MESSAGES, {
                    waitForLast: true,
                    async afterEach(streamMessage) {
                        counter += 1
                        if (counter === 3) {
                            await waitForStorage(streamMessage) // make sure lastest message has hit storage
                            await addLateSubscriber()
                        }
                    }
                })
            }))

            await waitForCondition(() => {
                try {
                    checkMessages(published, receivedMessagesMain)
                    checkMessages(published, receivedMessagesOther)
                    return true
                } catch (err) {
                    return false
                }
            }, 15000, 300).catch((err) => {
                // convert timeout to actual error
                checkMessages(published, receivedMessagesMain)
                checkMessages(published, receivedMessagesOther)
                throw err
            })
        }, 60000)
    })

    test.only('works with multiple publishers on one stream', async () => {
        await mainClient.session.getSessionToken()
        await mainClient.connect()

        otherClient = createClient({
            auth: {
                privateKey
            }
        })
        // otherClient.on('error', getOnError(errors))
        await otherClient.session.getSessionToken()
        const otherUser = await otherClient.getUserInfo()
        await stream.grantPermission(StreamOperation.STREAM_GET, otherUser.username)
        await stream.grantPermission(StreamOperation.STREAM_SUBSCRIBE, otherUser.username)
        await otherClient.connect()

        const receivedMessagesOther: Record<string, any[]> = {}
        const receivedMessagesMain: Record<string, any[]> = {}
        // subscribe to stream from other client instance
        await otherClient.subscribe({
            stream: stream.id,
        }, (msg, streamMessage) => {
            const key = streamMessage.getPublisherId().toLowerCase()
            const msgs = receivedMessagesOther[key] || []
            msgs.push(msg)
            receivedMessagesOther[key] = msgs
        })

        // subscribe to stream from main client instance
        await mainClient.subscribe({
            stream: stream.id,
        }, (msg, streamMessage) => {
            const key = streamMessage.getPublisherId().toLowerCase()
            const msgs = receivedMessagesMain[key] || []
            msgs.push(msg)
            receivedMessagesMain[key] = msgs
        })

        /* eslint-disable no-await-in-loop */
        const publishers = []
        for (let i = 0; i < 1; i++) {
            publishers.push(await createPublisher())
        }

        /* eslint-enable no-await-in-loop */
        const published: Record<string, any[]> = {}
        await Promise.all(publishers.map(async (pubClient) => {
            const publisherId = (await pubClient.getAddress()).toLowerCase()
            const publishTestMessages = getPublishTestMessages(pubClient, stream, {
                waitForLast: true,
            })

            await publishTestMessages(MAX_MESSAGES, {
                // delay: 500 + Math.random() * 1500,
                afterEach(msg) {
                    published[publisherId] = published[publisherId] || []
                    published[publisherId].push(msg)
                }
            })
        }))

        await waitForCondition(() => {
            try {
                checkMessages(published, receivedMessagesMain)
                checkMessages(published, receivedMessagesOther)
                return true
            } catch (err) {
                return false
            }
        }, 5000).catch(() => {
            checkMessages(published, receivedMessagesMain)
            checkMessages(published, receivedMessagesOther)
        })

    }, 40000)

    test('works with multiple publishers on one stream with late subscriber', async () => {
        const published: Record<string, any[]> = {}
        await mainClient.session.getSessionToken()
        await mainClient.connect()

        otherClient = createClient({
            auth: {
                privateKey
            }
        })
        otherClient.on('error', getOnError(errors))
        await otherClient.session.getSessionToken()
        const otherUser = await otherClient.getUserInfo()

        await stream.grantPermission(StreamOperation.STREAM_GET, otherUser.username)
        await stream.grantPermission(StreamOperation.STREAM_SUBSCRIBE, otherUser.username)
        await otherClient.connect()

        const receivedMessagesOther: Record<string, any[]> = {}
        const receivedMessagesMain: Record<string, any[]> = {}

        // subscribe to stream from main client instance
        const mainSub = await mainClient.subscribe({
            stream: stream.id,
        }, (msg, streamMessage) => {
            const key = streamMessage.getPublisherId().toLowerCase()
            const msgs = receivedMessagesMain[key] || []
            msgs.push(msg)
            receivedMessagesMain[key] = msgs
            if (Object.values(receivedMessagesMain).every((m) => m.length === MAX_MESSAGES)) {
                mainSub.cancel()
            }
        })

        /* eslint-disable no-await-in-loop */
        const publishers = []
        for (let i = 0; i < 3; i++) {
            publishers.push(await createPublisher())
        }

        let counter = 0
        /* eslint-enable no-await-in-loop */
        await Promise.all(publishers.map(async (pubClient) => {
            const waitForStorage = getWaitForStorage(pubClient, {
                stream,
                timeout: 10000,
                count: MAX_MESSAGES * publishers.length,
            })

            const publisherId = (await pubClient.getAddress()).toString().toLowerCase()
            const publishTestMessages = getPublishTestMessages(pubClient, stream, {
                waitForLast: true,
                waitForLastTimeout: 10000,
                waitForLastCount: MAX_MESSAGES * publishers.length,
                delay: 500 + Math.random() * 1500,
            })

            async function addLateSubscriber() {
                // late subscribe to stream from other client instance
                const lateSub = await otherClient.subscribe({
                    stream: stream.id,
                }, (msg, streamMessage) => {
                    const key = streamMessage.getPublisherId().toLowerCase()
                    const msgs = receivedMessagesOther[key] || []
                    msgs.push(msg)
                    receivedMessagesOther[key] = msgs
                })

                addAfter(async () => {
                    await lateSub.unsubscribe()
                })
            }

            await publishTestMessages(MAX_MESSAGES, {
                async afterEach(streamMessage) {
                    published[publisherId] = published[publisherId] || []
                    published[publisherId].push(streamMessage)
                    counter += 1
                    if (counter === 3) {
                        await waitForStorage(streamMessage) // make sure lastest message has hit storage
                        // late subscribe to stream from other client instance
                        await addLateSubscriber()
                    }
                }
            })
        }))

        await waitForCondition(() => {
            try {
                checkMessages(published, receivedMessagesMain)
                checkMessages(published, receivedMessagesOther)
                return true
            } catch (err) {
                return false
            }
        }, 15000, 300).catch(() => {
            checkMessages(published, receivedMessagesMain)
            checkMessages(published, receivedMessagesOther)
        })
    }, 60000)

    /*
    test('disconnecting one client does not disconnect the other', async () => {
        otherClient = createClient({
            id: 'other',
            auth: {
                privateKey
            }
        })
        addAfter(() => otherClient.disconnect())
        const onConnectedOther = jest.fn()
        const onConnectedMain = jest.fn()
        const onDisconnectedOther = jest.fn()
        const onDisconnectedMain = jest.fn()
        otherClient.on('disconnected', onDisconnectedOther)
        mainClient.on('disconnected', onDisconnectedMain)
        otherClient.on('connected', onConnectedOther)
        mainClient.on('connected', onConnectedMain)
        otherClient.on('error', getOnError(errors))

        await otherClient.connect()
        await mainClient.connect()

        otherClient.connection.socket.close()
        expect(mainClient.connection.getState()).toBe('connected')
        await otherClient.nextConnection()
        expect(otherClient.connection.getState()).toBe('connected')
        expect(onDisconnectedMain).toHaveBeenCalledTimes(0)
        expect(onDisconnectedOther).toHaveBeenCalledTimes(1)
        expect(onConnectedMain).toHaveBeenCalledTimes(1)
        expect(onConnectedOther).toHaveBeenCalledTimes(2)
    })

    test('disconnecting one client does not disconnect the other: with autoConnect', async () => {
        otherClient = createClient({
            id: 'other',
            auth: {
                privateKey
            }
        })
        addAfter(() => otherClient.disconnect())
        const onConnectedOther = jest.fn()
        const onConnectedMain = jest.fn()
        const onDisconnectedOther = jest.fn()
        const onDisconnectedMain = jest.fn()
        otherClient.on('disconnected', onDisconnectedOther)
        mainClient.on('disconnected', onDisconnectedMain)
        otherClient.on('connected', onConnectedOther)
        mainClient.on('connected', onConnectedMain)
        otherClient.on('error', getOnError(errors))

        otherClient.enableAutoConnect()
        mainClient.enableAutoConnect()
        await otherClient.connection.addHandle(1)
        await mainClient.connection.addHandle(2)

        otherClient.connection.socket.close()
        expect(mainClient.connection.getState()).toBe('connected')
        await otherClient.nextConnection()
        expect(otherClient.connection.getState()).toBe('connected')
        expect(onDisconnectedMain).toHaveBeenCalledTimes(0)
        expect(onDisconnectedOther).toHaveBeenCalledTimes(1)
        expect(onConnectedMain).toHaveBeenCalledTimes(1)
        expect(onConnectedOther).toHaveBeenCalledTimes(2)
    })
    */
})
