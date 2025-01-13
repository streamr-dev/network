import { Wallet } from 'ethers'
import { fetchPrivateKeyWithGas } from '@streamr/test-utils'
import { collect } from '@streamr/utils'
import { StreamPermission } from '@streamr/sdk'
import { createTestClient, runCommand, startCommand } from './utils'

const TIMEOUT = 30 * 1000

describe('publish and subscribe', () => {
    let publisherPrivateKey: string
    let subscriberPrivateKey: string
    let streamId: string

    beforeAll(async () => {
        publisherPrivateKey = await fetchPrivateKeyWithGas()
        subscriberPrivateKey = await fetchPrivateKeyWithGas()
        const client = createTestClient(publisherPrivateKey)
        const stream = await client.createStream(`/${Date.now()}`)
        await stream.grantPermissions({
            userId: new Wallet(subscriberPrivateKey).address,
            permissions: [StreamPermission.SUBSCRIBE]
        })
        streamId = stream.id
        await client.destroy()
    }, TIMEOUT)

    function publishViaCliCommand() {
        setImmediate(async () => {
            await runCommand(`stream publish ${streamId}`, {
                inputLines: [JSON.stringify({ foo: 123 })],
                privateKey: publisherPrivateKey
            })
        })
    }

    it(
        'happy path',
        async () => {
            const subscriberAbortController = new AbortController()
            const subscriberOutputIterable = startCommand(`stream subscribe ${streamId}`, {
                privateKey: subscriberPrivateKey,
                abortSignal: subscriberAbortController.signal
            })
            publishViaCliCommand()
            const receivedMessage = (await collect(subscriberOutputIterable, 1))[0]
            subscriberAbortController.abort()
            expect(JSON.parse(receivedMessage)).toEqual({
                foo: 123
            })
        },
        TIMEOUT
    )

    it(
        'raw subscription',
        async () => {
            const subscriberAbortController = new AbortController()
            const subscriberOutputIterable = startCommand(`stream subscribe ${streamId} --raw`, {
                privateKey: subscriberPrivateKey,
                abortSignal: subscriberAbortController.signal
            })
            publishViaCliCommand()
            const receivedMessage = (await collect(subscriberOutputIterable, 1))[0]
            subscriberAbortController.abort()
            expect(receivedMessage).toMatch(/^[0-9a-fA-F]+$/)
        },
        TIMEOUT
    )

    it(
        'with metadata',
        async () => {
            const subscriberAbortController = new AbortController()
            const subscriberOutputIterable = startCommand(`stream subscribe ${streamId} --with-metadata`, {
                privateKey: subscriberPrivateKey,
                abortSignal: subscriberAbortController.signal
            })
            publishViaCliCommand()
            const receivedMessage = (await collect(subscriberOutputIterable, 1))[0]
            subscriberAbortController.abort()
            expect(JSON.parse(receivedMessage)).toMatchObject({
                content: {
                    foo: 123
                },
                metadata: {
                    streamId,
                    streamPartition: 0,
                    timestamp: expect.any(Number),
                    sequenceNumber: 0,
                    publisherId: new Wallet(publisherPrivateKey).address.toLowerCase(),
                    msgChainId: expect.stringMatching(/[0-9a-zA-Z]+/)
                }
            })
        },
        TIMEOUT
    )

    it(
        'with metadata and raw',
        async () => {
            const subscriberAbortController = new AbortController()
            const subscriberOutputIterable = startCommand(`stream subscribe ${streamId} --with-metadata --raw`, {
                privateKey: subscriberPrivateKey,
                abortSignal: subscriberAbortController.signal
            })
            publishViaCliCommand()
            const receivedMessage = (await collect(subscriberOutputIterable, 1))[0]
            subscriberAbortController.abort()
            expect(JSON.parse(receivedMessage)).toMatchObject({
                content: expect.stringMatching(/^[0-9a-fA-F]+$/),
                metadata: {
                    streamId,
                    streamPartition: 0,
                    timestamp: expect.any(Number),
                    sequenceNumber: 0,
                    publisherId: new Wallet(publisherPrivateKey).address.toLowerCase(),
                    msgChainId: expect.stringMatching(/[0-9a-zA-Z]+/)
                }
            })
        },
        TIMEOUT
    )
})
