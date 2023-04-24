import { Wallet } from 'ethers'
import { fastWallet, fetchPrivateKeyWithGas } from '@streamr/test-utils'
import { CONFIG_TEST } from '../../src/ConfigTest'
import { PermissionAssignment, StreamPermission } from '../../src/permission'
import { Stream } from '../../src/Stream'
import { StreamrClient } from '../../src/StreamrClient'
import { createTestStream, createTestClient } from '../test-utils/utils'
import { waitForCondition } from '@streamr/utils'

const TIMEOUT = 60 * 1000

const PAYLOAD = { hello: 'world' }

async function createStreamWithPermissions(
    privateKey: string,
    ...assignments: PermissionAssignment[]
): Promise<Stream> {
    const creatorClient = new StreamrClient({
        ...CONFIG_TEST,
        auth: {
            privateKey
        }
    })
    try {
        const stream = await createTestStream(creatorClient, module)
        await stream.grantPermissions(...assignments)
        return stream
    } finally {
        await creatorClient.destroy()
    }
}

describe('publish-subscribe', () => {
    let subscriberWallet: Wallet
    let publisherPk: string
    let publisherClient: StreamrClient
    let subscriberClient: StreamrClient

    beforeAll(async () => {
        subscriberWallet = fastWallet()
        publisherPk = await fetchPrivateKeyWithGas()
    })

    beforeEach(async () => {
        publisherClient = createTestClient(publisherPk, 'webrtc-publisher')
        subscriberClient = createTestClient(subscriberWallet.privateKey, 'webrtc-subscriber')

    }, TIMEOUT)

    afterEach(async () => {
        await Promise.allSettled([
            publisherClient?.destroy(),
            subscriberClient?.destroy(),
        ])
    }, TIMEOUT)

    describe('private stream', () => {
        let stream: Stream

        beforeAll(async () => {
            stream = await createStreamWithPermissions(publisherPk, {
                permissions: [StreamPermission.SUBSCRIBE],
                user: subscriberWallet.address
            })

        }, TIMEOUT)

        it('subscriber is able to receive and decrypt messages', async () => {
            const messages: any[] = []
            await publisherClient.publish(stream.id, PAYLOAD)
            const sub = await subscriberClient.subscribe(stream.id, (msg: any) => {
                messages.push(msg)
            })
            sub.on('error', (e) => console.error(e))
            await waitForCondition(() => messages.length > 0, 45000)
            expect(messages).toEqual([PAYLOAD])

        }, TIMEOUT)
    })

})
