import { wait } from 'streamr-test-utils'
import LeakDetector from 'jest-leak-detector'

import { fakePrivateKey, describeRepeats, getPublishTestMessages, snapshot } from '../utils'
import { StreamrClient } from '../../src/StreamrClient'

import config from '../integration/config'

describeRepeats('Leaks', () => {
    let leakDetector: LeakDetector | undefined
    afterEach(async () => {
        expect(leakDetector).toBeTruthy()
        if (!leakDetector) { return }
        const detector = leakDetector
        leakDetector = undefined
        await wait(1000)
        expect(await detector.isLeaking()).toBeFalsy()
    })

    describe('StreamrClient', () => {
        const createClient = (opts = {}) => {
            const c = new StreamrClient({
                ...config.clientOptions,
                auth: {
                    privateKey: fakePrivateKey(),
                },
                autoConnect: false,
                autoDisconnect: false,
                maxRetries: 2,
                ...opts,
            })
            c.onError = jest.fn()
            return c
        }

        beforeEach(async () => {
            // eslint-disable-next-line require-atomic-updates
        })

        test('creating client', () => {
            const client = createClient()
            leakDetector = new LeakDetector(client)
        })

        test('connect + disconnect', async () => {
            const client = createClient()
            leakDetector = new LeakDetector(client)
            await client.connect()
            await client.disconnect()
        })

        test('connect + disconnect + session token', async () => {
            const client = createClient()
            leakDetector = new LeakDetector(client)
            await client.connect()
            await client.session.getSessionToken()
            await client.disconnect()
        })

        test('connect + disconnect + getAddress', async () => {
            const client = createClient()
            leakDetector = new LeakDetector(client)
            await client.connect()
            await client.session.getSessionToken()
            await client.getAddress()
            await client.disconnect()
        })

        describe('stream', () => {
            let client: StreamrClient | undefined

            beforeEach(async () => {
                client = createClient()
                leakDetector = new LeakDetector(client)
                await client.connect()
                await client.session.getSessionToken()
                snapshot()
            })

            afterEach(async () => {
                if (!client) { return }
                const c = client
                client = undefined
                await c.disconnect()
                snapshot()
            })

            test('create', async () => {
                if (!client) { return }

                await client.createStream({
                    requireSignedData: true,
                })
            })

            test('cached functions', async () => {
                if (!client) { return }

                const stream = await client.createStream({
                    requireSignedData: true,
                })
                await client.cached.getUserInfo()
                await client.cached.getUserId()
                const ethAddress = await client.getAddress()
                await client.cached.isStreamPublisher(stream.id, ethAddress)
                await client.cached.isStreamSubscriber(stream.id, ethAddress)
                await client.cached.getUserId()
                await client.disconnect()
            }, 15000)

            test('publish', async () => {
                if (!client) { return }

                const stream = await client.createStream({
                    requireSignedData: true,
                })
                const publishTestMessages = getPublishTestMessages(client, {
                    retainMessages: false,
                    stream
                })

                await publishTestMessages(5)
                await client.disconnect()
                await wait(3000)
            }, 15000)
        })
    })
})
