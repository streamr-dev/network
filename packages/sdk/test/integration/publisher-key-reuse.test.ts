import 'reflect-metadata'

import { fastWallet } from '@streamr/test-utils'
import { collect } from '@streamr/utils'
import { Wallet } from 'ethers'
import { Stream } from '../../src/Stream'
import { StreamrClient } from '../../src/StreamrClient'
import { StreamPermission } from '../../src/permission'
import { FakeEnvironment } from '../test-utils/fake/FakeEnvironment'
import { nextValue } from './../../src/utils/iterators'

describe('publisher key reuse', () => {
    let publisherWallet: Wallet
    let environment: FakeEnvironment
    let publisher: StreamrClient
    let subscriber: StreamrClient
    let stream: Stream

    function createPublisherClient(): StreamrClient {
        return environment.createClient({
            auth: {
                privateKey: publisherWallet.privateKey
            }
        })
    }

    beforeEach(async () => {
        publisherWallet = fastWallet()
        environment = new FakeEnvironment()
        publisher = createPublisherClient()
        subscriber = environment.createClient()
        stream = await publisher.createStream('/path')
        await stream.grantPermissions({
            permissions: [StreamPermission.SUBSCRIBE],
            userId: await subscriber.getUserId()
        })
    })

    afterEach(async () => {
        await environment.destroy()
    })

    it('happy path: same publisher address', async () => {
        const sub = await subscriber.subscribe(stream.id)
        await publisher.publish(stream, {
            msg: '1'
        })
        await publisher.destroy()
        const publisher2 = createPublisherClient()
        await publisher2.publish(stream, {
            msg: '2'
        })
        const msgs = await collect(sub, 2)
        expect(msgs[0].streamMessage.groupKeyId).toBeString()
        expect(msgs[0].streamMessage.groupKeyId).toEqual(msgs[1].streamMessage.groupKeyId)
    })

    it('happy path: different publisher address', async () => {
        const otherWallet = fastWallet()
        await stream.grantPermissions({
            permissions: [StreamPermission.PUBLISH],
            userId: otherWallet.address
        })

        const sub = await subscriber.subscribe(stream.id)
        const messageIterator = sub[Symbol.asyncIterator]()

        await publisher.publish(stream, {
            msg: '1'
        })
        const receivedMessage1 = await nextValue(messageIterator)
        await publisher.destroy()

        const publisher2 = environment.createClient({
            auth: {
                privateKey: otherWallet.privateKey
            }
        })
        await publisher2.publish(stream.id, {
            msg: '2'
        })
        const receivedMessage2 = await nextValue(messageIterator)

        expect(receivedMessage1!.streamMessage.groupKeyId).toBeString()
        expect(receivedMessage1!.streamMessage.groupKeyId).not.toEqual(receivedMessage2!.streamMessage.groupKeyId)
    })
})
