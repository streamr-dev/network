import 'reflect-metadata'

import { fastWallet } from '@streamr/test-utils'
import { collect } from '@streamr/utils'
import { Wallet } from 'ethers'
import range from 'lodash/range'
import { Message } from '../../src/Message'
import { Stream } from '../../src/Stream'
import { StreamrClient } from '../../src/StreamrClient'
import { StreamPermission } from '../../src/permission'
import { StreamMessage } from '../../src/protocol/StreamMessage'
import { FakeEnvironment } from '../test-utils/fake/FakeEnvironment'
import { createMockMessage, createTestStream } from '../test-utils/utils'

describe('unsubscribe', () => {
    let environment: FakeEnvironment
    let client: StreamrClient
    let wallet: Wallet
    let stream: Stream

    beforeEach(async () => {
        environment = new FakeEnvironment()
        wallet = fastWallet()
        client = environment.createClient({
            auth: {
                privateKey: wallet.privateKey
            }
        })
        stream = await createTestStream(client, module)
        await stream.grantPermissions({
            public: true,
            permissions: [StreamPermission.PUBLISH, StreamPermission.SUBSCRIBE]
        })
    })

    afterEach(async () => {
        await client.destroy()
    })

    it('Subscription#unsubscribe', async () => {
        const sub = await client.subscribe(stream.id, () => {})
        expect(await client.getSubscriptions()).toHaveLength(1)

        await sub.unsubscribe()

        expect(await client.getSubscriptions()).toHaveLength(0)
    })

    it('StreamrClient#unsubscribe', async () => {
        const sub = await client.subscribe(stream.id, () => {})
        jest.spyOn(sub, 'unsubscribe')
        expect(await client.getSubscriptions()).toHaveLength(1)

        await client.unsubscribe(sub)

        expect(await client.getSubscriptions()).toHaveLength(0)
        expect(sub.unsubscribe).toHaveBeenCalled()
    })

    it('twice', async () => {
        const sub = await client.subscribe(stream.id, () => {})
        expect(await client.getSubscriptions()).toHaveLength(1)

        await sub.unsubscribe()
        await sub.unsubscribe()

        expect(await client.getSubscriptions()).toHaveLength(0)
    })

    it('can unsubscribe inside async iteration', async () => {
        const sub = await client.subscribe({
            streamId: stream.id
        })

        setImmediate(async () => {
            const publisher = environment.createClient()
            await publisher.publish(stream.id, {})
            await publisher.destroy()
        })

        const received: Message[] = []
        for await (const m of sub) {
            received.push(m)
            setImmediate(() => {
                sub.unsubscribe()
            })
        }

        expect(received).toHaveLength(1)
        expect(await client.getSubscriptions(stream.id)).toHaveLength(0)
    })

    it('before start', async () => {
        const sub = await client.subscribe({
            streamId: stream.id
        })

        expect(await client.getSubscriptions(stream.id)).toHaveLength(1)

        await sub.unsubscribe()
        const received = await collect(sub)
        expect(received).toHaveLength(0)
        expect(await client.getSubscriptions(stream.id)).toHaveLength(0)
    })

    it('before realtime messages iterated', async () => {
        const storageNode = await environment.startStorageNode()
        await client.addStreamToStorageNode(stream.id, storageNode.getAddress())
        const historicalMessages: StreamMessage[] = []
        for (const _ of range(2)) {
            const msg = await createMockMessage({
                stream,
                publisher: wallet
            })
            storageNode.storeMessage(msg)
            historicalMessages.push(msg)
        }
        const sub = await client.subscribe({
            streamId: stream.id,
            resend: {
                last: 100
            }
        })

        const received: Message[] = []
        for await (const m of sub) {
            received.push(m)
            await sub.unsubscribe()
        }

        expect(received).toHaveLength(1)
        expect(await client.getSubscriptions(stream.id)).toHaveLength(0)
    })
})
