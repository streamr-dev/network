import { ConfigTest, EncryptionUtil, GroupKey, StreamPermission, StreamrClient } from '../../src'
import { createTestStream, fetchPrivateKeyWithGas, getCreateClient } from '../test-utils/utils'
import { fastPrivateKey, randomEthereumAddress, wait } from 'streamr-test-utils'
import { MessageID, StreamID, StreamMessage } from 'streamr-client-protocol'
import { createNetworkNode, NetworkNode } from 'streamr-network'

const createClient = getCreateClient()
const TIMEOUT = 20 * 1000
const PROPAGATION_WAIT_TIME = 2000

describe('client behaviour on invalid message', () => {
    let streamId: StreamID
    let subscriberClient: StreamrClient
    let publisherClient: StreamrClient
    let networkNode: NetworkNode | undefined

    beforeAll(async () => {
        const creatorClient = await createClient({
            auth: {
                privateKey: await fetchPrivateKeyWithGas()
            }
        })
        try {
            const stream = await createTestStream(creatorClient, module)
            streamId = stream.id
            await stream.grantPermissions({
                permissions: [StreamPermission.SUBSCRIBE],
                public: true
            })
        } finally {
            await creatorClient.destroy()
        }
    }, TIMEOUT)

    beforeEach(async () => {
        subscriberClient = await createClient({
            auth: {
                privateKey: await fetchPrivateKeyWithGas()
            }
        })
        publisherClient = await createClient({
            auth: {
                privateKey: fastPrivateKey()
            }
        })
    }, TIMEOUT)

    afterEach(async () => {
        await Promise.allSettled([
            publisherClient?.destroy(),
            subscriberClient?.destroy(),
            networkNode?.stop()
        ])
    })

    it('publishing with insufficient permissions prevents message from being sent to network (NET-773)', async () => {
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

    it('invalid messages received by subscriber do not cause unhandled promise rejection (NET-774)', async () => {
        await subscriberClient.subscribe(streamId, () => {
            throw new Error('should not get here')
        })
        networkNode = await createNetworkNode({
            ...ConfigTest.network,
            id: 'networkNode',
        })
        const msg = new StreamMessage({
            messageId: new MessageID(streamId, 0, Date.now(), 0, randomEthereumAddress(), ''),
            prevMsgRef: null,
            content: { not: 'allowed' }
        })
        EncryptionUtil.encryptStreamMessage(msg, GroupKey.generate())
        networkNode.publish(msg)
        await wait(PROPAGATION_WAIT_TIME)
        expect(true).toEqual(true) // we never get here if subscriberClient crashes
    }, TIMEOUT)
})
