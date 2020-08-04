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
    let mainClient
    let otherClient
    let privateKey

    async function setup() {
        privateKey = ethers.Wallet.createRandom().privateKey

        mainClient = createClient({
            auth: {
                privateKey
            }
        })
        mainClient.once('error', throwError)
        stream = await mainClient.createStream({
            name: uid('stream')
        })
    }

    async function teardown() {
        if (stream) {
            await stream.delete()
            stream = undefined // eslint-disable-line require-atomic-updates
        }

        if (mainClient) {
            await mainClient.ensureDisconnected()
        }

        if (otherClient) {
            await otherClient.ensureDisconnected()
        }
    }

    beforeEach(async () => {
        await setup()
    })

    afterEach(async () => {
        await teardown()
    })

    test('can get messages published from other client', async (done) => {
        otherClient = createClient({
            auth: {
                privateKey
            }
        })
        otherClient.once('error', done)
        mainClient.once('error', done)
        await otherClient.ensureConnected()
        await mainClient.ensureConnected()

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
        otherClient.removeListener('error', done)
        mainClient.removeListener('error', done)
        done()
    }, 30000)
})
