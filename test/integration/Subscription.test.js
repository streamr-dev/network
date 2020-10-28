import { wait, waitForEvent } from 'streamr-test-utils'

import { uid, fakePrivateKey } from '../utils'
import StreamrClient from '../../src'

import config from './config'

const createClient = (opts = {}) => new StreamrClient({
    auth: {
        privateKey: fakePrivateKey(),
    },
    autoConnect: false,
    autoDisconnect: false,
    ...config.clientOptions,
    ...opts,
})

const RESEND_ALL = {
    from: {
        timestamp: 0,
    },
}

describe('Subscription', () => {
    let stream
    let client
    let subscription
    let errors = []
    let expectedErrors = 0

    function onError(err) {
        errors.push(err)
    }

    /**
     * Returns an array which will be filled with subscription events in the order they occur.
     * Needs to create subscription at same time in order to track message events.
     */

    async function createMonitoredSubscription(opts = {}) {
        if (!client) { throw new Error('No client') }
        const events = []
        subscription = await client.subscribe({
            stream: stream.id,
            resend: RESEND_ALL,
            ...opts,
        }, (message) => {
            events.push(message)
        })
        subscription.on('subscribed', () => events.push('subscribed'))
        subscription.on('resent', () => events.push('resent'))
        subscription.on('unsubscribed', () => events.push('unsubscribed'))
        subscription.on('error', () => events.push('error'))
        return events
    }

    async function publishMessage() {
        const message = {
            message: uid('msg')
        }
        await stream.publish(message)
        return message
    }

    beforeEach(async () => {
        errors = []
        expectedErrors = 0
        client = createClient()
        client.on('error', onError)
        stream = await client.createStream({
            name: uid('stream')
        })
        await client.connect()
    })

    afterEach(async () => {
        expect(errors).toHaveLength(expectedErrors)
    })

    afterEach(async () => {
        if (!client) { return }
        client.off('error', onError)
        client.debug('disconnecting after test')
        await client.disconnect()
    })

    describe('subscribe/unsubscribe events', () => {
        it('fires events in correct order 1', async () => {
            const subscriptionEvents = await createMonitoredSubscription()
            await waitForEvent(subscription, 'resent')
            await client.unsubscribe(subscription)
            expect(subscriptionEvents).toEqual([
                'resent',
                'unsubscribed',
            ])
        })
    })

    describe('resending/no_resend events', () => {
        it('fires events in correct order 2', async () => {
            const subscriptionEvents = await createMonitoredSubscription()
            await waitForEvent(subscription, 'resent')
            expect(subscriptionEvents).toEqual([
                'resent',
            ])
        })
    })

    describe('resending/resent events', () => {
        it('fires events in correct order 3', async () => {
            const message1 = await publishMessage()
            const message2 = await publishMessage()
            await wait(5000) // wait for messages to (probably) land in storage
            const subscriptionEvents = await createMonitoredSubscription()
            await waitForEvent(subscription, 'resent')
            await wait(500) // wait in case messages appear after resent event
            expect(subscriptionEvents).toEqual([
                message1,
                message2,
                'resent',
            ])
        }, 20 * 1000)
    })
})
