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
            await mainClient.disconnect()
        }

        if (otherClient) {
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
})
