import 'reflect-metadata'
import { Wallet } from '@ethersproject/wallet'
import { range } from 'lodash'
import { fastWallet } from 'streamr-test-utils'
import { Stream } from '../../src/Stream'
import { FakeEnvironment } from '../test-utils/fake/FakeEnvironment'
import { StreamrClient } from './../../src/StreamrClient'
import { nextValue } from './../../src/utils/iterators'
import { createMockMessage, createTestStream } from './../test-utils/utils'

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
    })

    describe('Realtime subscription', () => {

        it('StreamrClient#unsubscribe', async () => {
            const sub = await client.subscribe(stream.id, () => {})
            const onUnsubscribe = jest.fn()
            sub.on('unsubscribe', onUnsubscribe)
            expect(await client.getSubscriptions()).toHaveLength(1)

            await client.unsubscribe(sub)

            expect(await client.getSubscriptions()).toHaveLength(0)
            expect(onUnsubscribe).toBeCalledTimes(1)
        })

        it('Subscription#unsubscribe', async () => {
            const sub = await client.subscribe(stream.id, () => {})
            const onUnsubscribe = jest.fn()
            sub.on('unsubscribe', onUnsubscribe)
            expect(await client.getSubscriptions({ streamId: stream.id })).toHaveLength(1)

            await sub.unsubscribe()

            expect(await client.getSubscriptions({ streamId: stream.id })).toHaveLength(0)
            expect(onUnsubscribe).toBeCalledTimes(1)
        })
    })

    describe('Resend request', () => {

        beforeEach(async () => {
            const storageNode = environment.startStorageNode()
            await client.addStreamToStorageNode(stream.id, storageNode.id)
            await Promise.all(range(2).map(async () => {
                storageNode.storeMessage(await createMockMessage({
                    stream,
                    publisher: wallet
                }))
            }))
        })

        it('Client#unsubscribe', async () => {
            const sub = await client.resend(stream.id, { last: 1 }, () => {})
            const onResendComplete = jest.fn()
            const onUnsubscribe = jest.fn()
            sub.on('resendComplete', onResendComplete)
            sub.on('unsubscribe', onUnsubscribe)
            expect(await client.getSubscriptions({ streamId: stream.id })).toHaveLength(1)

            await client.unsubscribe(stream.id)

            expect(await client.getSubscriptions({ streamId: stream.id })).toHaveLength(0)
            expect(onResendComplete).toBeCalledTimes(0)
            expect(onUnsubscribe).toBeCalledTimes(1)
        })

        it('Subscription#unsubscribe', async () => {
            const sub = await client.resend(stream.id, { last: 1 }, () => {})
            const onResendComplete = jest.fn()
            const onUnsubscribe = jest.fn()
            sub.on('resendComplete', onResendComplete)
            sub.on('unsubscribe', onUnsubscribe)
            expect(await client.getSubscriptions({ streamId: stream.id })).toHaveLength(1)

            await sub.unsubscribe()

            expect(await client.getSubscriptions({ streamId: stream.id })).toHaveLength(0)
            expect(onResendComplete).toBeCalledTimes(0)
            expect(onUnsubscribe).toBeCalledTimes(1)
        })

        it('automatically unsubscribes when all messages consumed', async () => {
            const sub = await client.resend(stream.id, { last: 2 }, () => {})
            const onResendComplete = jest.fn()
            const onUnsubscribe = jest.fn()
            sub.on('resendComplete', onResendComplete)
            sub.on('unsubscribe', onUnsubscribe)
            expect(await client.getSubscriptions({ streamId: stream.id })).toHaveLength(1)

            await nextValue(sub)
            expect(await client.getSubscriptions({ streamId: stream.id })).toHaveLength(1)
            // TODO It would make sense that we see that there is nothing to iterate when we've
            // received all 2 items which we requested. But in practice the onIterationCompleted
            // is triggered when the iterator exists out of for loop await loop in Pipeline:262.
            // That happens when we try to query the non-existent 3rd item. Therefore we need
            // to query nextValue(sub) three times in this test.
            await nextValue(sub)
            await nextValue(sub)

            expect(await client.getSubscriptions({ streamId: stream.id })).toHaveLength(0)
            expect(onResendComplete).toBeCalledTimes(1)
            expect(onUnsubscribe).toBeCalledTimes(1)
        })
    })
})
