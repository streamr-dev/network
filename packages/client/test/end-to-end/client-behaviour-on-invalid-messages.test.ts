import { StreamrClient } from '../../src/StreamrClient'
import { StreamPermission } from '../../src/permission'
import { ConfigTest } from '../../src/ConfigTest'
import { GroupKey } from '../../src/encryption/GroupKey'
import { EncryptionUtil } from '../../src/encryption/EncryptionUtil'
import { createTestStream, fetchPrivateKeyWithGas, getCreateClient } from '../test-utils/utils'
import { fastPrivateKey, wait } from 'streamr-test-utils'
import { MessageID, SigningUtil, StreamID, StreamMessage } from 'streamr-client-protocol'
import { createNetworkNode, NetworkNode } from 'streamr-network'
import { Wallet } from 'ethers'

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
                privateKey: fastPrivateKey()
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
            ...ConfigTest.network as any,
            id: 'networkNode',
        })
        const publisherWallet = Wallet.createRandom()
        const msg = new StreamMessage({
            messageId: new MessageID(streamId, 0, Date.now(), 0, publisherWallet.address, ''),
            prevMsgRef: null,
            content: { not: 'allowed' }
        })
        EncryptionUtil.encryptStreamMessage(msg, GroupKey.generate())
        msg.signature = await SigningUtil.sign(msg.getPayloadToSign(StreamMessage.SIGNATURE_TYPES.ETH), publisherWallet.privateKey.substring(2))
        networkNode.publish(msg)
        await wait(PROPAGATION_WAIT_TIME)
        expect(true).toEqual(true) // we never get here if subscriberClient crashes
    }, TIMEOUT)
})
