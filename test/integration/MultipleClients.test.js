import { ethers } from 'ethers'
import { wait } from 'streamr-test-utils'

import { uid } from '../utils'
import StreamrClient from '../../src'

import config from './config'

const createClient = (opts = {}) => new StreamrClient({
    auth: {
        privateKey: ethers.Wallet.createRandom().privateKey,
    },
    autoConnect: false,
    autoDisconnect: false,
    ...config.clientOptions,
    ...opts,
})

const throwError = (error) => { throw error }

describe('PubSub with multiple clients', () => {
    let stream
    let client
    let privateKey

    async function setup() {
        privateKey = ethers.Wallet.createRandom().privateKey

        client = createClient({
            auth: {
                privateKey
            }
        })
        client.once('error', throwError)
        stream = await client.createStream({
            name: uid('stream')
        })
    }

    async function teardown() {
        if (stream) {
            await stream.delete()
            stream = undefined // eslint-disable-line require-atomic-updates
        }

        if (client && client.isConnected()) {
            await client.disconnect()
            client.off('error', throwError)
            client = undefined // eslint-disable-line require-atomic-updates
        }
    }

    beforeEach(async () => {
        await setup()
    })

    afterEach(async () => {
        await teardown()
    })

    test('can get messages published from other client', async (done) => {
        const mainClient = client
        const otherClient = createClient({
            auth: {
                privateKey
            }
        })
        otherClient.once('error', done)
        mainClient.once('error', done)
        await otherClient.ensureConnected()
        await client.ensureConnected()

        const receivedMessagesOther = []
        const receivedMessagesMain = []
        // subscribe to stream from other client instance
        await new Promise((resolve) => {
            otherClient.subscribe({
                stream: stream.id,
            }, (msg) => {
                receivedMessagesOther.push(msg)
            }).once('subscribed', resolve)
        })
        // subscribe to stream from main client instance
        await new Promise((resolve) => {
            mainClient.subscribe({
                stream: stream.id,
            }, (msg) => {
                receivedMessagesMain.push(msg)
            }).once('subscribed', resolve)
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
