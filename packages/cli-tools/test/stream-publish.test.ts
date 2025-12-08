import StreamrClient, { StreamPermission } from '@streamr/sdk'
import { createTestPrivateKey } from '@streamr/test-utils'
import { keyToArrayIndex, StreamID } from '@streamr/utils'
import range from 'lodash/range'
import { createTestClient, nextValue, runCommand } from './utils'
import { Wallet } from 'ethers'

const PARTITION_COUNT = 10

describe('stream-publish', () => {

    let streamId: StreamID
    let publisherPrivateKey: string
    let subscriberPrivateKey: string

    function createSubscriber(): StreamrClient {
        return createTestClient(subscriberPrivateKey)
    }

    beforeEach(async () => {
        publisherPrivateKey = await createTestPrivateKey({ gas: true })
        subscriberPrivateKey = await createTestPrivateKey({ gas: true })
        const client = createTestClient(await createTestPrivateKey({ gas: true }))
        const stream = await client.createStream({ id: `/${Date.now()}`, partitions: PARTITION_COUNT })
        await stream.grantPermissions({
            userId: new Wallet(publisherPrivateKey).address,
            permissions: [StreamPermission.PUBLISH]
        }, {
            userId: new Wallet(subscriberPrivateKey).address,
            permissions: [StreamPermission.SUBSCRIBE]
        })
        streamId = stream.id
        await client.destroy()
    })

    function publishViaCliCommand(additionalArgs: string[] = []) {
        const args = [streamId, ...additionalArgs]
        setImmediate(async () => {
            await runCommand(`stream publish ${args.join(' ')}`, {
                inputLines: [JSON.stringify({ foo: 123 })],
                privateKey: publisherPrivateKey
            })
        })
    }

    it('happy path', async () => {
        const subscriber = createSubscriber()
        const subscriptions = await Promise.all(range(PARTITION_COUNT).map((partition) => subscriber.subscribe({ id: streamId, partition })))
        publishViaCliCommand()
        const receivedMessage = await Promise.race(subscriptions.map((s) => nextValue(s[Symbol.asyncIterator]())))
        expect(receivedMessage!.content).toEqual({ foo: 123 })
        await subscriber.destroy()
    })

    it('explicit partition', async () => {
        const PARTITION = 5
        const subscriber = createSubscriber()
        const subscription = await subscriber.subscribe({ id: streamId, partition: PARTITION })
        publishViaCliCommand([`--partition ${PARTITION}`])
        const receivedMessage = await nextValue(subscription[Symbol.asyncIterator]())
        expect(receivedMessage!.content).toEqual({ foo: 123 })
        await subscriber.destroy()
    })

    it('partition key field', async () => {
        const partition = keyToArrayIndex(PARTITION_COUNT, 123)
        const subscriber = createSubscriber()
        const subscription = await subscriber.subscribe({ id: streamId, partition })
        publishViaCliCommand(['--partition-key-field foo'])
        const receivedMessage = await nextValue(subscription[Symbol.asyncIterator]())
        expect(receivedMessage!.content).toEqual({ foo: 123 })
        await subscriber.destroy()
    })    
})
