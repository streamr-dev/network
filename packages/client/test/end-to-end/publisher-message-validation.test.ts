import { StreamrClient } from '../../src'
import { createTestStream, fetchPrivateKeyWithGas, getCreateClient } from '../test-utils/utils'
import { fastPrivateKey, wait } from 'streamr-test-utils'
import { StreamID } from 'streamr-client-protocol'

const createClient = getCreateClient()

const TIMEOUT = 10 * 1000

describe('publisher message validation', () => {
    let publisherClient: StreamrClient
    let subscriberClient: StreamrClient
    let streamId: StreamID

    beforeEach(async () => {
        publisherClient = await createClient({
            auth: {
                privateKey: fastPrivateKey()
            }
        })
        subscriberClient = await createClient({
            auth: {
                privateKey: await fetchPrivateKeyWithGas()
            }
        })
        const stream = await createTestStream(subscriberClient, module)
        streamId = stream.id
    }, TIMEOUT)

    it('publishing message with insufficient permissions prevents message from getting sent to network', async () => {
        let subscriberReceivedMsgs = 0
        const subscription = await subscriberClient.subscribe(streamId, () => {
            subscriberReceivedMsgs += 1
        })
        subscription.onError((_err) => {
            subscriberReceivedMsgs += 1
        })
        await expect(publisherClient.publish(streamId, { not: 'allowed' }))
            .rejects
            .toThrow(/is not a publisher on stream/)
        await wait(2000)
        expect(subscriberReceivedMsgs).toEqual(0)
    }, TIMEOUT)
})
