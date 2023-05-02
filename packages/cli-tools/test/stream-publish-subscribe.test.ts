import { Wallet } from '@ethersproject/wallet'
import { fetchPrivateKeyWithGas } from '@streamr/test-utils'
import { StreamPermission } from 'streamr-client'
import { collect, createTestClient, runCommand, startCommand } from './utils'

describe('publish and subscribe', () => {

    it('happy path', async () => {
        const publisherPrivateKey = await fetchPrivateKeyWithGas()
        const subscriberPrivateKey = await fetchPrivateKeyWithGas()
        const client = createTestClient(publisherPrivateKey)
        const stream = await client.createStream(`/${Date.now()}`)
        await stream.grantPermissions({
            user: new Wallet(subscriberPrivateKey).address,
            permissions: [StreamPermission.SUBSCRIBE]
        })
        const subscriberAbortController = new AbortController()
        const subscriberOutputIterable = startCommand(`stream subscribe ${stream.id}`, {
            privateKey: subscriberPrivateKey,
            abortSignal: subscriberAbortController.signal
        })
        setImmediate(async () => {
            await runCommand(`stream publish ${stream.id}`, {
                inputLines: [JSON.stringify({ foo: 123 })],
                privateKey: publisherPrivateKey
            })
        })
        const receivedMessage = (await collect(subscriberOutputIterable, 1))[0]
        subscriberAbortController.abort()
        expect(JSON.parse(receivedMessage)).toEqual({
            foo: 123
        })
    }, 40 * 1000)
})
