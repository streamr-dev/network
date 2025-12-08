import StreamrClient, { StreamPermission } from '@streamr/sdk'
import { createTestPrivateKey } from '@streamr/test-utils'
import { binaryToHex, keyToArrayIndex, StreamID } from '@streamr/utils'
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

    function publishViaCliCommand(inputLine: string, additionalArgs: string[] = []) {
        const args = [streamId, ...additionalArgs]
        setImmediate(async () => {
            await runCommand(`stream publish ${args.join(' ')}`, {
                inputLines: [inputLine],
                privateKey: publisherPrivateKey
            })
        })
    }

    it('happy path', async () => {
        const subscriber = createSubscriber()
        const subscriptions = await Promise.all(range(PARTITION_COUNT).map((partition) => subscriber.subscribe({ id: streamId, partition })))
        publishViaCliCommand(JSON.stringify({ foo: 123 }))
        const receivedMessage = await Promise.race(subscriptions.map((s) => nextValue(s[Symbol.asyncIterator]())))
        expect(receivedMessage!.content).toEqual({ foo: 123 })
        await subscriber.destroy()
    })

    it('hex content', async () => {
        const PARTITION = 5
        const subscriber = createSubscriber()
        const subscription = await subscriber.subscribe({ id: streamId, partition: PARTITION })
        publishViaCliCommand(binaryToHex(new Uint8Array([4, 5, 6]), false), [`--partition ${PARTITION}`])
        const receivedMessage = await nextValue(subscription[Symbol.asyncIterator]())
        expect(receivedMessage!.content).toEqualBinary(new Uint8Array([4, 5, 6]))
        await subscriber.destroy()
    })

    it('explicit partition', async () => {
        const PARTITION = 5
        const subscriber = createSubscriber()
        const subscription = await subscriber.subscribe({ id: streamId, partition: PARTITION })
        publishViaCliCommand(JSON.stringify({ foo: 123 }), [`--partition ${PARTITION}`])
        const receivedMessage = await nextValue(subscription[Symbol.asyncIterator]())
        expect(receivedMessage!.content).toEqual({ foo: 123 })
        await subscriber.destroy()
    })

    it('partition key field', async () => {
        const partition = keyToArrayIndex(PARTITION_COUNT, 123)
        const subscriber = createSubscriber()
        const subscription = await subscriber.subscribe({ id: streamId, partition })
        publishViaCliCommand(JSON.stringify({ foo: 123 }), ['--partition-key-field foo'])
        const receivedMessage = await nextValue(subscription[Symbol.asyncIterator]())
        expect(receivedMessage!.content).toEqual({ foo: 123 })
        await subscriber.destroy()
    })

    it('with metadata', async () => {
        const PARTITION = 5
        const PAYLOAD = { content: { foo: 123 }, metadata: { msgChainId: 'testMsgChainId' } }
        const subscriber = createSubscriber()
        const subscription = await subscriber.subscribe({ id: streamId, partition: PARTITION })
        publishViaCliCommand(JSON.stringify(PAYLOAD), ['--with-metadata', `--partition ${PARTITION}`])
        const receivedMessage = await nextValue(subscription[Symbol.asyncIterator]())
        expect(receivedMessage!.content).toEqual({ foo: 123 })
        expect(receivedMessage!.msgChainId).toEqual('testMsgChainId')
        await subscriber.destroy()
    })

    it('with metadata, hex content', async () => {
        const PARTITION = 5
        const PAYLOAD = { content: binaryToHex(new Uint8Array([4, 5, 6]), false), metadata: { msgChainId: 'testMsgChainId' } }
        const subscriber = createSubscriber()
        const subscription = await subscriber.subscribe({ id: streamId, partition: PARTITION })
        publishViaCliCommand(JSON.stringify(PAYLOAD), ['--with-metadata', `--partition ${PARTITION}`])
        const receivedMessage = await nextValue(subscription[Symbol.asyncIterator]())
        expect(receivedMessage!.content).toEqual(new Uint8Array([4, 5, 6]))
        expect(receivedMessage!.msgChainId).toEqual('testMsgChainId')
        await subscriber.destroy()
    })
})
