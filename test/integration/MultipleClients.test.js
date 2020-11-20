import { wait } from 'streamr-test-utils'

import { uid, fakePrivateKey } from '../utils'
import StreamrClient from '../../src'
import Connection from '../../src/Connection'

import config from './config'

const createClient = (opts = {}) => new StreamrClient({
    auth: {
        privateKey: fakePrivateKey()
    },
    autoConnect: false,
    autoDisconnect: false,
    ...config.clientOptions,
    ...opts,
})

describe('PubSub with multiple clients', () => {
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
