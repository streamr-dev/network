import { wait } from 'streamr-test-utils'
import { ControlLayer } from 'streamr-client-protocol'

import { describeRepeats, uid, fakePrivateKey, getWaitForStorage, getPublishTestMessages, addAfterFn } from '../utils'
import { StreamrClient } from '../../src/StreamrClient'
import { counterId, Defer, pLimitFn } from '../../src/utils'
import Connection from '../../src/Connection'

import config from './config'

const { ControlMessage } = ControlLayer

const createClient = (opts = {}) => new StreamrClient({
    ...config.clientOptions,
    auth: {
        privateKey: fakePrivateKey()
    },
    autoConnect: false,
    autoDisconnect: false,
    // disconnectDelay: 1,
    // publishAutoDisconnectDelay: 1,
    ...opts,
})

const MAX_MESSAGES = 10

describeRepeats('PubSub with multiple clients', () => {
    let stream
    let mainClient
    let otherClient
    let privateKey
    let errors = []

    const runAfterTest = addAfterFn()

    const getOnError = (errs) => jest.fn((err) => {
        errs.push(err)
    })

    beforeEach(async () => {
        errors = []
        privateKey = fakePrivateKey()

        mainClient = createClient({
            auth: {
                privateKey
            }
        })
        mainClient.on('error', getOnError(errors))
        stream = await mainClient.createStream({
            name: uid('stream')
        })
        await stream.addToStorageNode(config.clientOptions.storageNode.address)
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

    describe('can get messages published from other client', () => {
        test('it works', async () => {
            otherClient = createClient({
                auth: {
                    privateKey
                }
            })
            otherClient.on('error', getOnError(errors))
            await otherClient.connect()
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
            await wait(5000)
            // publish message on main client
            await mainClient.publish(stream, message)
            await wait(5000)
            // messages should arrive on both clients?
            expect(receivedMessagesMain).toEqual([message])
            expect(receivedMessagesOther).toEqual([message])
        }, 60000)

        describe('subscriber disconnects after each message', () => {
            test('single subscriber', async () => {
                const maxMessages = MAX_MESSAGES + Math.floor(Math.random() * MAX_MESSAGES * 0.25)
                otherClient = createClient({
                    auth: {
                        privateKey
                    }
                })
                otherClient.on('error', getOnError(errors))
                await otherClient.connect()
                await mainClient.connect()

                const receivedMessagesOther = []
                const msgs = receivedMessagesOther
                const otherDone = Defer()
                // subscribe to stream from other client instance
                await otherClient.subscribe({
                    stream: stream.id,
                }, (msg) => {
                    otherClient.debug('other', msg.value)
                    receivedMessagesOther.push(msg)

                    if (receivedMessagesOther.length === maxMessages) {
                        otherDone.resolve()
                    }
                })
                let disconnecting = false
                const disconnect = async () => {
                    if (msgs.length === maxMessages) { return }

                    if (disconnecting) { return }
                    disconnecting = true
                    otherClient.debug('disconnecting...', msgs.length)
                    otherClient.connection.socket.close()
                    // wait for reconnection before possibly disconnecting again
                    try {
                        await otherClient.nextConnection()
                        otherClient.debug('reconnected...', msgs.length)
                    } finally {
                        // eslint-disable-next-line require-atomic-updates
                        disconnecting = false
                    }
                }

                const onConnectionMessage = jest.fn(() => {
                    // disconnect after every message
                    disconnect()
                })

                otherClient.connection.on(ControlMessage.TYPES.BroadcastMessage, onConnectionMessage)
                otherClient.connection.on(ControlMessage.TYPES.UnicastMessage, onConnectionMessage)
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
                otherClient = createClient({
                    auth: {
                        privateKey
                    }
                })
                otherClient.on('error', getOnError(errors))
                await otherClient.connect()
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

    describe('multiple publishers', () => {
        async function createPublisher() {
            const pubClient = createClient({
                auth: {
                    privateKey: fakePrivateKey(),
                }
            })
            runAfterTest(() => pubClient.disconnect())
            pubClient.on('error', getOnError(errors))
            const pubUser = await pubClient.getUserInfo()
            await stream.grantPermission('stream_get', pubUser.username)
            await stream.grantPermission('stream_publish', pubUser.username)
            // needed to check last
            await stream.grantPermission('stream_subscribe', pubUser.username)
            await pubClient.session.getSessionToken()
            await pubClient.connect()

            runAfterTest(async () => {
                await pubClient.disconnect()
            })
            return pubClient
        }

        // eslint-disable-next-line no-inner-declarations
        function checkMessages(published, received) {
            for (const [key, msgs] of Object.entries(published)) {
                expect(received[key]).toEqual(msgs)
            }
        }

        test('works with multiple publishers on one stream', async () => {
            // this creates two subscriber clients and multiple publisher clients
            // all subscribing and publishing to same stream
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
                const msgs = receivedMessagesOther[streamMessage.getPublisherId()] || []
                msgs.push(msg)
                receivedMessagesOther[streamMessage.getPublisherId()] = msgs
            })

            // subscribe to stream from main client instance
            await mainClient.subscribe({
                stream: stream.id,
            }, (msg, streamMessage) => {
                const msgs = receivedMessagesMain[streamMessage.getPublisherId()] || []
                msgs.push(msg)
                receivedMessagesMain[streamMessage.getPublisherId()] = msgs
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
                runAfterTest(() => {
                    counterId.clear(publisherId) // prevent overflows in counter
                })
                const publishTestMessages = getPublishTestMessages(pubClient, {
                    stream,
                    delay: 500 + Math.random() * 1500,
                    waitForLast: true,
                    waitForLastTimeout: 10000,
                    waitForLastCount: MAX_MESSAGES,
                    createMessage: () => ({
                        value: counterId(publisherId),
                    }),
                })
                published[publisherId] = await publishTestMessages(MAX_MESSAGES)
            }))

            checkMessages(published, receivedMessagesMain)
            checkMessages(published, receivedMessagesOther)
        }, 60000)

        test('works with multiple publishers on one stream with late subscriber', async () => {
            // this creates two subscriber clients and multiple publisher clients
            // all subscribing and publishing to same stream
            // the otherClient subscribes after the 3rd message hits storage
            await mainClient.session.getSessionToken()
            await mainClient.connect()

            otherClient = createClient({
                auth: {
                    privateKey
                }
            })

            runAfterTest(() => {
                otherClient.disconnect()
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
                const msgs = receivedMessagesMain[streamMessage.getPublisherId()] || []
                msgs.push(msg)
                receivedMessagesMain[streamMessage.getPublisherId()] = msgs
                if (Object.values(receivedMessagesMain).every((m) => m.length === MAX_MESSAGES)) {
                    mainSub.unsubscribe()
                }
            })

            /* eslint-disable no-await-in-loop */
            const publishers = []
            for (let i = 0; i < 3; i++) {
                publishers.push(await createPublisher())
            }

            /* eslint-enable no-await-in-loop */
            let counter = 0
            const published = {}
            await Promise.all(publishers.map(async (pubClient) => {
                const waitForStorage = getWaitForStorage(pubClient, {
                    stream,
                    timeout: 10000,
                    count: MAX_MESSAGES,
                })

                const publisherId = (await pubClient.getPublisherId()).toLowerCase()
                runAfterTest(() => {
                    counterId.clear(publisherId) // prevent overflows in counter
                })
                const publishTestMessages = getPublishTestMessages(pubClient, {
                    stream,
                    waitForLast: true,
                    waitForLastTimeout: 10000,
                    waitForLastCount: MAX_MESSAGES,
                    delay: 500 + Math.random() * 1500,
                    createMessage: () => ({
                        value: counterId(publisherId),
                    }),
                })

                published[publisherId] = await publishTestMessages(MAX_MESSAGES, {
                    async afterEach(_pubMsg, req) {
                        counter += 1
                        if (counter === 3) {
                            // late subscribe to stream from other client instance
                            await waitForStorage(req) // make sure lastest message has hit storage
                            const lateSub = await otherClient.subscribe({
                                stream: stream.id,
                                resend: {
                                    last: 1000,
                                }
                            }, (msg, streamMessage) => {
                                const msgs = receivedMessagesOther[streamMessage.getPublisherId()] || []
                                msgs.push(msg)
                                receivedMessagesOther[streamMessage.getPublisherId()] = msgs
                            })

                            runAfterTest(async () => {
                                await lateSub.unsubscribe()
                            })
                        }
                    }
                })
            }))
            checkMessages(published, receivedMessagesMain)
            checkMessages(published, receivedMessagesOther)
        }, 65000)
    })

    test('disconnecting one client does not disconnect the other', async () => {
        otherClient = createClient({
            auth: {
                privateKey
            }
        })
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
            auth: {
                privateKey
            }
        })
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
