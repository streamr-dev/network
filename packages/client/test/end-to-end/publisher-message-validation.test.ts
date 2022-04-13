import { StreamrClient } from '../../src'
import { createTestStream, fetchPrivateKeyWithGas, getCreateClient } from '../test-utils/utils'
import { fastPrivateKey, wait } from 'streamr-test-utils'
import { StreamID } from 'streamr-client-protocol'

const createClient = getCreateClient()

const TIMEOUT = 20 * 1000

const PROPAGATION_WAIT_TIME = 2000

describe('publisher message validation (NET-773)', () => {
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
        const onMessage = jest.fn()
        const onError = jest.fn()
        const subscription = await subscriberClient.subscribe(streamId, onMessage)
        subscription.onError(onError)
        await expect(publisherClient.publish(streamId, { not: 'allowed' }))
            .rejects
            .toThrow(/is not a publisher on stream/)
        await wait(PROPAGATION_WAIT_TIME)
        expect(onMessage).not.toHaveBeenCalled()
        expect(onError).not.toHaveBeenCalled()
    }, TIMEOUT)
})
