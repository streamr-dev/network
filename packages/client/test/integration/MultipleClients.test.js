import { wait, waitForCondition } from 'streamr-test-utils'
import { ControlLayer } from 'streamr-client-protocol'

import { describeRepeats, uid, fakePrivateKey, getWaitForStorage, getPublishTestMessages, addAfterFn, createTestStream } from '../utils'
import { StreamrClient } from '../../src/StreamrClient'
import { counterId, Defer, pLimitFn } from '../../src/utils'
import Connection from '../../src/Connection'
import { StorageNode } from '../../src/stream/StorageNode'

import clientOptions from './config'

const { ControlMessage } = ControlLayer

const createClient = (opts = {}) => new StreamrClient({
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

const MAX_MESSAGES = 6

describeRepeats('PubSub with multiple clients', () => {
    let stream
    let mainClient
    let otherClient
    let privateKey
    let errors = []

    const addAfter = addAfterFn()

    const getOnError = (errs) => jest.fn((err) => {
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
        mainClient.on('error', getOnError(errors))
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

        const openSockets = Connection.getOpen()
        if (openSockets !== 0) {
            await Connection.closeOpen()
            throw new Error(`sockets not closed: ${openSockets}`)
        }
    })

    async function createPublisher(opts = {}) {
        const pubClient = createClient({
            auth: {
                privateKey: fakePrivateKey(),
            },
            ...opts,
        })
        const publisherId = (await pubClient.getPublisherId()).toLowerCase()

        addAfter(async () => {
            counterId.clear(publisherId) // prevent overflows in counter
            await pubClient.disconnect()
        })

        pubClient.on('error', getOnError(errors))
        const pubUser = await pubClient.getUserInfo()
        await stream.grantPermission('stream_get', pubUser.username)
        await stream.grantPermission('stream_publish', pubUser.username)
        // needed to check last
        await stream.grantPermission('stream_subscribe', pubUser.username)
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

        client.on('error', getOnError(errors))
        await client.session.getSessionToken()
        const user = await client.getUserInfo()
        await stream.grantPermission('stream_get', user.username)
        await stream.grantPermission('stream_subscribe', user.username)
        await client.connect()
        return client
    }

    function checkMessages(published, received) {
        for (const [key, msgs] of Object.entries(published)) {
            expect(received[key]).toEqual(msgs)
        }
    }

    describe('can get messages published from other client', () => {
        test('it works', async () => {
            otherClient = await createSubscriber()
            await mainClient.connect()

            const receivedMessagesOther = []
            const receivedMessagesMain = []
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

        describe('subscriber disconnects after each message (uses resend)', () => {
            test('single subscriber', async () => {
                const maxMessages = MAX_MESSAGES + Math.floor(Math.random() * MAX_MESSAGES * 0.25)
                otherClient = await createSubscriber()
                await mainClient.connect()

                const receivedMessagesOther = []
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
    })

    describe('multiple publishers (uses resend)', () => {
        test('works with multiple publishers on one stream', async () => {
            // this creates two subscriber clients and multiple publisher clients
            // all subscribing and publishing to same stream
            await mainClient.session.getSessionToken()
            await mainClient.connect()

            otherClient = await createSubscriber()

            const receivedMessagesOther = {}
            const receivedMessagesMain = {}
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
            const publishers = []
            for (let i = 0; i < 3; i++) {
                publishers.push(await createPublisher({
                    id: `publisher-${i}`,
                }))
            }
            /* eslint-enable no-await-in-loop */
            const published = {}
            await Promise.all(publishers.map(async (pubClient) => {
                const publisherId = (await pubClient.getPublisherId()).toLowerCase()
                addAfter(() => {
                    counterId.clear(publisherId) // prevent overflows in counter
                })
                const publishTestMessages = getPublishTestMessages(pubClient, {
                    stream,
                    delay: 500 + Math.random() * 1500,
                    waitForLast: true,
                    waitForLastTimeout: 10000,
                    waitForLastCount: MAX_MESSAGES * publishers.length,
                    createMessage: () => ({
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

            const receivedMessagesOther = {}
            const receivedMessagesMain = {}

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
            const published = {}
            await Promise.all(publishers.map(async (pubClient) => {
                const waitForStorage = getWaitForStorage(pubClient, {
                    stream,
                    timeout: 10000,
                    count: MAX_MESSAGES * publishers.length,
                })

                const publisherId = (await pubClient.getPublisherId()).toLowerCase()
                addAfter(() => {
                    counterId.clear(publisherId) // prevent overflows in counter
                })

                const publishTestMessages = getPublishTestMessages(pubClient, {
                    stream,
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
                        resend: {
                            last: 1000,
                        }
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
                    async afterEach(_pubMsg, req) {
                        counter += 1
                        if (counter === 3) {
                            await waitForStorage(req) // make sure lastest message has hit storage
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

    test('works with multiple publishers on one stream', async () => {
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
        await stream.grantPermission('stream_get', otherUser.username)
        await stream.grantPermission('stream_subscribe', otherUser.username)
        await otherClient.connect()

        const receivedMessagesOther = {}
        const receivedMessagesMain = {}
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
        for (let i = 0; i < 3; i++) {
            publishers.push(await createPublisher())
        }

        /* eslint-enable no-await-in-loop */
        const published = {}
        await Promise.all(publishers.map(async (pubClient) => {
            const publisherId = (await pubClient.getPublisherId()).toLowerCase()
            const publishTestMessages = getPublishTestMessages(pubClient, {
                stream,
                waitForLast: true,
            })
            await publishTestMessages(10, {
                delay: 500 + Math.random() * 1500,
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
        const published = {}
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
        await stream.grantPermission('stream_get', otherUser.username)
        await stream.grantPermission('stream_subscribe', otherUser.username)
        await otherClient.connect()

        const receivedMessagesOther = {}
        const receivedMessagesMain = {}

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

            const publisherId = (await pubClient.getPublisherId()).toString().toLowerCase()
            const publishTestMessages = getPublishTestMessages(pubClient, {
                stream,
                waitForLast: true,
                waitForLastTimeout: 10000,
                waitForLastCount: MAX_MESSAGES * publishers.length,
                delay: 500 + Math.random() * 1500,
            })

            async function addLateSubscriber() {
                // late subscribe to stream from other client instance
                const lateSub = await otherClient.subscribe({
                    stream: stream.id,
                    resend: {
                        last: 1000,
                    }
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
                async afterEach(pubMsg, req) {
                    published[publisherId] = published[publisherId] || []
                    published[publisherId].push(pubMsg)
                    counter += 1
                    if (counter === 3) {
                        await waitForStorage(req) // make sure lastest message has hit storage
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
})
