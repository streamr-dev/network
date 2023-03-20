import 'reflect-metadata'

import { Wallet } from '@ethersproject/wallet'
import { fastWallet } from '@streamr/test-utils'
import { StreamPermission } from '../../src/permission'
import { Stream } from '../../src/Stream'
import { StreamrClient } from '../../src/StreamrClient'
import { collect } from '../../src/utils/iterators'
import { FakeEnvironment } from '../test-utils/fake/FakeEnvironment'
import { toEthereumAddress, wait } from '@streamr/utils'

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
            user: await subscriber.getAddress()
        })
    })

    afterEach(async () => {
        await environment?.destroy()
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
            user: otherWallet.address
        })

        const sub = await subscriber.subscribe(stream.id)
        await publisher.publish(stream, {
            msg: '1'
        })
        // await publisher.destroy() TODO: our guess is this somehow breaks FakeEnvironment
        const publisher2 = environment.createClient({
            auth: {
                privateKey: otherWallet.privateKey
            }
        })
        await publisher2.publish(stream.id, {
            msg: '2'
        })
        const msgs = await collect(sub, 2)
        expect(msgs[0].streamMessage.groupKeyId).toBeString()
        expect(msgs[0].streamMessage.groupKeyId).not.toEqual(msgs[1].streamMessage.groupKeyId)
    })
})
