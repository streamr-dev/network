import { wait } from 'streamr-test-utils'

import { describeRepeats, uid, fakePrivateKey, getPublishTestMessages } from '../utils'
import StreamrClient from '../../src'
import Connection from '../../src/Connection'

import config from './config'

const createClient = (opts = {}) => new StreamrClient({
    ...config.clientOptions,
    auth: {
        privateKey: fakePrivateKey()
    },
    autoConnect: false,
    autoDisconnect: false,
    ...opts,
})

describeRepeats('PubSub with multiple clients', () => {
    let stream
    let mainClient
    let otherClient
    let privateKey
    let errors = []

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
    })

    afterEach(async () => {
        if (stream) {
            await stream.delete()
        }

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

    test('can get messages published from other client', async () => {
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
    }, 30000)

    test('works with multiple publishers on one stream', async () => {
        const onEnd = []
        async function createPublisher() {
            const pubClient = createClient({
                auth: {
                    privateKey: fakePrivateKey(),
                }
            })
            onEnd.push(() => pubClient.disconnect())
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

        try {
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
                const publisherId = await pubClient.getPublisherId()
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

            await wait(5000)

            mainClient.debug('%j', {
                published,
                receivedMessagesMain,
                receivedMessagesOther,
            })

            // eslint-disable-next-line no-inner-declarations
            function checkMessages(received) {
                for (const [key, msgs] of Object.entries(published)) {
                    expect(received[key]).toEqual(msgs)
                }
            }

            checkMessages(receivedMessagesMain)
            checkMessages(receivedMessagesOther)
        } finally {
            await Promise.all(onEnd.map((fn) => fn()))
        }
    }, 40000)

    test('works with multiple publishers on one stream with late subscriber', async () => {
        const onEnd = []
        async function createPublisher() {
            const pubClient = createClient({
                auth: {
                    privateKey: fakePrivateKey(),
                }
            })
            onEnd.push(() => pubClient.disconnect())
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

        const published = {}
        function checkMessages(received) {
            for (const [key, msgs] of Object.entries(published)) {
                expect(received[key]).toEqual(msgs)
            }
        }

        const MAX_MESSAGES = 10

        try {
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
                const msgs = receivedMessagesMain[streamMessage.getPublisherId()] || []
                msgs.push(msg)
                receivedMessagesMain[streamMessage.getPublisherId()] = msgs
                if (Object.values(receivedMessagesMain).every((m) => m.length === MAX_MESSAGES)) {
                    mainSub.end()
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
                const publisherId = await pubClient.getPublisherId()
                const publishTestMessages = getPublishTestMessages(pubClient, {
                    stream,
                    waitForLast: true,
                })
                await publishTestMessages(MAX_MESSAGES, {
                    delay: 500 + Math.random() * 1500,
                    async afterEach(pubMsg) {
                        published[publisherId] = published[publisherId] || []
                        published[publisherId].push(pubMsg)
                        counter += 1
                        if (counter === 3) {
                            // late subscribe to stream from other client instance
                            const otherSub = await otherClient.subscribe({
                                stream: stream.id,
                                resend: {
                                    last: 1000,
                                }
                            }, (msg, streamMessage) => {
                                const msgs = receivedMessagesOther[streamMessage.getPublisherId()] || []
                                msgs.push(msg)
                                receivedMessagesOther[streamMessage.getPublisherId()] = msgs
                                if (msgs.length === MAX_MESSAGES) {
                                    return otherSub.end()
                                }
                            })
                        }
                    }
                })
            }))

            await wait(15000)

            mainClient.debug('%j', {
                published,
                receivedMessagesMain,
                receivedMessagesOther,
            })

            checkMessages(receivedMessagesMain)
            checkMessages(receivedMessagesOther)
        } finally {
            await Promise.all(onEnd.map((fn) => fn()))
        }
    }, 60000)

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
