import StreamrClient, { Stream } from 'streamr-client'
import { startTracker, Tracker } from 'streamr-network'
import { wait, waitForCondition } from 'streamr-test-utils'
import { Broker } from '../../src/broker'
import { startBroker, fastPrivateKey, createClient, createTestStream } from '../utils'

const trackerPort = 17711
const httpPort = 17712
const wsPort = 17713

describe('local propagation', () => {
    let tracker: Tracker
    let broker: Broker
    let privateKey: string
    let client1: StreamrClient
    let client2: StreamrClient
    let freshStream: Stream
    let freshStreamId: string

    beforeAll(async () => {
        privateKey = await getPrivateKey()
        tracker = await startTracker({
            listen: {
                hostname: '127.0.0.1',
                port: trackerPort
            },
            id: 'tracker-1'
        })
        brokerWallet = new Wallet(await getPrivateKey())

        broker = await startBroker({
            name: 'broker1',
            privateKey: brokerWallet.privateKey,
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
        await freshStream.grantUserPermission(StreamOperation.STREAM_PUBLISH, brokerWallet.address)

        await wait(3000)
    })

    afterAll(async () => {
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
