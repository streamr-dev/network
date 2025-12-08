import StreamrClient, { StreamPermission } from '@streamr/sdk'
import { createTestPrivateKey } from '@streamr/test-utils'
import { collect, StreamID } from '@streamr/utils'
import { createTestClient, startCommand } from './utils'
import { Wallet } from 'ethers'

describe('stream-subscribe', () => {

    let streamId: StreamID
    let publisherPrivateKey: string
    let subscriberPrivateKey: string

    beforeEach(async () => {
        publisherPrivateKey = await createTestPrivateKey({ gas: true })
        subscriberPrivateKey = await createTestPrivateKey({ gas: true })
        const client = createTestClient(await createTestPrivateKey({ gas: true }))
        const stream = await client.createStream(`/${Date.now()}`)
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

    async function publishTestMesssage(): Promise<StreamrClient> {
        const publisher = createTestClient(publisherPrivateKey)
        await publisher.publish(streamId, { foo: 123 })
        return publisher
    }

    it('happy path', async () => {
        const subscriberAbortController = new AbortController()
        const subscriberOutputIterable = startCommand(`stream subscribe ${streamId}`, {
            abortSignal: subscriberAbortController.signal,
            privateKey: subscriberPrivateKey
        })
        const publisher = await publishTestMesssage()
        const receivedMessage = (await collect(subscriberOutputIterable, 1))[0]
        expect(JSON.parse(receivedMessage)).toEqual({
            foo: 123
        })
        await publisher.destroy()
        subscriberAbortController.abort()
    })

    it('raw', async () => {
        const subscriberAbortController = new AbortController()
        const subscriberOutputIterable = startCommand(`stream subscribe ${streamId} --raw`, {
            abortSignal: subscriberAbortController.signal,
            privateKey: subscriberPrivateKey
        })
        const publisher = await publishTestMesssage()
        const receivedMessage = (await collect(subscriberOutputIterable, 1))[0]
        expect(receivedMessage).toMatch(/^[0-9a-fA-F]+$/)
        await publisher.destroy()
        subscriberAbortController.abort()
    })

    it('with metadata', async () => {
        const subscriberAbortController = new AbortController()
        const subscriberOutputIterable = startCommand(`stream subscribe ${streamId} --with-metadata`, {
            abortSignal: subscriberAbortController.signal,
            privateKey: subscriberPrivateKey
        })
        const publisher = await publishTestMesssage()
        const receivedMessage = (await collect(subscriberOutputIterable, 1))[0]
        expect(JSON.parse(receivedMessage)).toMatchObject({
            content: {
                foo: 123
            },
            metadata: {
                streamId,
                streamPartition: 0,
                timestamp: expect.any(Number),
                sequenceNumber: 0,
                signature: expect.any(String),
                publisherId: new Wallet(publisherPrivateKey).address.toLowerCase(),
                msgChainId: expect.stringMatching(/[0-9a-zA-Z]+/)
            }
        })
        await publisher.destroy()
        subscriberAbortController.abort()
    })

    it('with metadata, receive as raw', async () => {
        const subscriberAbortController = new AbortController()
        const subscriberOutputIterable = startCommand(`stream subscribe ${streamId} --with-metadata --raw`, {
            abortSignal: subscriberAbortController.signal,
            privateKey: subscriberPrivateKey
        })
        const publisher = await publishTestMesssage()
        const receivedMessage = (await collect(subscriberOutputIterable, 1))[0]
        expect(JSON.parse(receivedMessage)).toMatchObject({
            content: expect.stringMatching(/^[0-9a-fA-F]+$/),
            metadata: {
                streamId,
                streamPartition: 0,
                timestamp: expect.any(Number),
                sequenceNumber: 0,
                signature: expect.any(String),
                publisherId: new Wallet(publisherPrivateKey).address.toLowerCase(),
                msgChainId: expect.stringMatching(/[0-9a-zA-Z]+/)
            }
        })
        await publisher.destroy()
        subscriberAbortController.abort()
    })
})
