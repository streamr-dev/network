import StreamrClient, { Stream } from 'streamr-client'
import { Tracker } from 'streamr-network'
import { wait, waitForCondition } from 'streamr-test-utils'
import { Broker } from '../../src/broker'
import { startBroker, fastPrivateKey, createClient, createTestStream, startTestTracker } from '../utils'

const trackerPort = 17711
const httpPort = 17712
const wsPort = 17713

describe('local propagation', () => {
    let tracker: Tracker
    let broker: Broker
    const privateKey = fastPrivateKey()
    let client1: StreamrClient
    let client2: StreamrClient
    let freshStream: Stream
    let freshStreamId: string

    beforeEach(async () => {
        tracker = await startTestTracker(trackerPort)

        broker = await startBroker({
            name: 'broker1',
            privateKey: '0xfe77283a570fda0e581897b18d65632c438f0d00f9440183119c1b7e4d5275e1',
            trackerPort,
            httpPort,
            wsPort
        })

        client1 = createClient(tracker, privateKey)
        client2 = createClient(tracker, privateKey)
    })

    beforeEach(async () => {
        freshStream = await createTestStream(client1, module)
        freshStreamId = freshStream.id

        await wait(3000)
    }, 10 * 1000)

    afterEach(async () => {
        await Promise.all([
            tracker.stop(),
            client1.destroy(),
            client2.destroy(),
            broker.stop()
        ])
    })

    test('local propagation using StreamrClients', async () => {
        const client1Messages: any[] = []
        const client2Messages: any[] = []

        await Promise.all([
            client1.subscribe({
                stream: freshStreamId
            }, (message) => {
                client1Messages.push(message)
            }),
            client2.subscribe({
                stream: freshStreamId
            }, (message) => {
                client2Messages.push(message)
            })
        ])

        await client1.publish(freshStreamId, {
            key: 1
        })
        await client1.publish(freshStreamId, {
            key: 2
        })
        await client1.publish(freshStreamId, {
            key: 3
        })

        await waitForCondition(() => client2Messages.length === 3)
        await waitForCondition(() => client1Messages.length === 3)

        expect(client1Messages).toEqual([
            {
                key: 1
            },
            {
                key: 2
            },
            {
                key: 3
            },
        ])

        expect(client2Messages).toEqual([
            {
                key: 1
            },
            {
                key: 2
            },
            {
                key: 3
            },
        ])
    })
})
