import { ethers } from 'ethers'
import uuid from 'uuid/v4'
import { wait } from 'streamr-test-utils'

import StreamrClient from '../../src'

import config from './config'

const createClient = (opts = {}) => new StreamrClient({
    url: config.websocketUrl,
    restUrl: config.restUrl,
    auth: {
        privateKey: ethers.Wallet.createRandom().privateKey,
    },
    autoConnect: false,
    autoDisconnect: false,
    ...opts,
})

const throwError = (error) => { throw error }

const RESEND_ALL = {
    from: {
        timestamp: 0,
    },
}

describe('Subscription', () => {
    let stream
    let client
    let subscription

    async function setup() {
        client = createClient()
        client.on('error', throwError)
        stream = await client.createStream({
            name: uuid(),
        })
    }

    async function teardown() {
        if (subscription) {
            await client.unsubscribe(subscription)
            subscription = undefined
        }

        if (stream) {
            await stream.delete()
            stream = undefined
        }

        if (client && client.isConnected()) {
            await client.disconnect()
            client.off('error', throwError)
            client = undefined
        }
    }

    /**
     * Returns an array which will be filled with subscription events in the order they occur.
     * Needs to create subscription at same time in order to track message events.
     */

    function createMonitoredSubscription(opts = {}) {
        if (!client) { throw new Error('No client') }
        const events = []
        subscription = client.subscribe({
            stream: stream.id,
            resend: RESEND_ALL,
            ...opts,
        }, (message) => {
            events.push(message)
        })
        subscription.on('subscribed', () => events.push('subscribed'))
        subscription.on('resending', () => events.push('resending'))
        subscription.on('resent', () => events.push('resent'))
        subscription.on('no_resend', () => events.push('no_resend'))
        subscription.on('unsubscribed', () => events.push('unsubscribed'))
        subscription.on('error', () => events.push('unsubscribed'))
        return events
    }

    async function publishMessage() {
        const message = {
            message: uuid(),
        }
        await stream.publish(message)
        return message
    }

    beforeEach(async () => {
        await teardown()
        await setup()
    })

    afterEach(async () => {
        await teardown()
    })

    describe('subscribe/unsubscribe events', () => {
        it('fires events in correct order', async (done) => {
            const subscriptionEvents = createMonitoredSubscription()
            subscription.on('subscribed', async () => {
                subscription.on('unsubscribed', () => {
                    expect(subscriptionEvents).toEqual([
                        'subscribed',
                        'unsubscribed',
                    ])
                    done()
                })
                await client.unsubscribe(subscription)
            })

            await client.connect()
        })
    })

    describe('resending/no_resend events', () => {
        it('fires events in correct order', async (done) => {
            const subscriptionEvents = createMonitoredSubscription()
            subscription.on('no_resend', async () => {
                await wait(0)
                expect(subscriptionEvents).toEqual([
                    'subscribed',
                    'no_resend',
                ])
                done()
            })

            await client.connect()
        })
    })

    describe('resending/resent events', () => {
        it('fires events in correct order', async (done) => {
            await client.connect()
            const message1 = await publishMessage()
            const message2 = await publishMessage()
            await wait(5000) // wait for messages to (probably) land in storage
            const subscriptionEvents = createMonitoredSubscription()
            subscription.on('resent', async () => {
                await wait(500) // wait in case messages appear after resent event
                expect(subscriptionEvents).toEqual([
                    'subscribed',
                    'resending',
                    message1,
                    message2,
                    'resent',
                ])
                done()
            })
            subscription.on('no_resend', () => {
                done('error: got no_resend, expected: resent')
            })
        }, 20 * 1000)
    })
})
