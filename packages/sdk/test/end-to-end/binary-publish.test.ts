import { Wallet } from 'ethers'
import { fastWallet, fetchPrivateKeyWithGas } from '@streamr/test-utils'
import { until, areEqualBinaries } from '@streamr/utils'
import { StreamrClient } from '../../src/StreamrClient'
import { Stream } from '../../src/Stream'
import { createTestStream, createTestClient } from '../test-utils/utils'
import { StreamPermission } from '../../src/permission'

describe('binary publish', () => {
    const PAYLOAD = new Uint8Array([1, 2, 3])

    let publisherPk: string
    let subscriberWallet: Wallet

    let publisher: StreamrClient
    let subscriber: StreamrClient
    let stream: Stream

    const TIMEOUT = 15 * 1000

    beforeAll(async () => {
        subscriberWallet = fastWallet()
        publisherPk = await fetchPrivateKeyWithGas()
    }, 30 * 1000)

    describe('private stream', () => {
        beforeEach(async () => {
            subscriber = createTestClient(subscriberWallet.privateKey)
            publisher = createTestClient(publisherPk)
            stream = await createTestStream(publisher, module)
            await publisher.setPermissions({
                streamId: stream.id,
                assignments: [{ permissions: [StreamPermission.SUBSCRIBE], userId: subscriberWallet.address }]
            })
        }, TIMEOUT)

        afterEach(async () => {
            await subscriber.destroy()
            await publisher.destroy()
        })

        it(
            'published binary message is received by subscriber',
            async () => {
                const messages: unknown[] = []
                await subscriber.subscribe(stream.id, (msg: any) => {
                    messages.push(msg)
                })
                await publisher.publish(stream.id, PAYLOAD)
                await until(() => messages.length > 0, TIMEOUT)
                expect(areEqualBinaries(messages[0] as Uint8Array, PAYLOAD)).toEqual(true)
            },
            TIMEOUT
        )
    })

    describe('public stream', () => {
        beforeEach(async () => {
            subscriber = createTestClient(subscriberWallet.privateKey)
            publisher = createTestClient(publisherPk)
            stream = await createTestStream(publisher, module)
            await publisher.setPermissions({
                streamId: stream.id,
                assignments: [{ permissions: [StreamPermission.SUBSCRIBE], public: true }]
            })
        }, TIMEOUT)

        afterEach(async () => {
            await subscriber.destroy()
            await publisher.destroy()
        })

        it(
            'published binary message is received by subscriber',
            async () => {
                const messages: unknown[] = []
                await subscriber.subscribe(stream.id, (msg: any) => {
                    messages.push(msg)
                })
                await publisher.publish(stream.id, PAYLOAD)
                await until(() => messages.length > 0, TIMEOUT)
                expect(areEqualBinaries(messages[0] as Uint8Array, PAYLOAD)).toEqual(true)
            },
            TIMEOUT
        )
    })
})
