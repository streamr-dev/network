import { createTestWallet, randomEthereumAddress } from '@streamr/test-utils'
import {
    StreamID,
    StreamPartID,
    StreamPartIDUtils,
    toStreamPartID,
    toUserId,
    until,
    UserID
} from '@streamr/utils'
import { Wallet } from 'ethers'
import { StreamrClient } from '../../src/StreamrClient'
import { GroupKey } from '../../src/encryption/GroupKey'
import { StreamPermission } from '../../src/permission'
import { FakeEnvironment } from '../test-utils/fake/FakeEnvironment'
import {
    createMockMessage,
    createRelativeTestStreamId,
    getLocalGroupKeyStore
} from '../test-utils/utils'
import { StreamMessage, StreamMessageType } from './../../src/protocol/StreamMessage'
import { AsymmetricEncryptionType, ContentType, EncryptionType, GroupKeyRequest, SignatureType } from '@streamr/trackerless-network'
import { StreamrClientConfig } from '../../src'

describe('SubscriberKeyExchange', () => {

    let publisherWallet: Wallet
    let subscriberWallet: Wallet
    let subscriber: StreamrClient
    let environment: FakeEnvironment

    const createStream = async (subscriberUserId: UserID): Promise<StreamID> => {
        const creator = environment.createClient()
        const s = await creator.createStream(createRelativeTestStreamId(module))
        await s.grantPermissions({
            permissions: [StreamPermission.SUBSCRIBE],
            userId: subscriberUserId
        })
        await s.grantPermissions({
            permissions: [StreamPermission.PUBLISH],
            userId: publisherWallet.address
        })
        return s.id
    }

    const createSubscriber = (config: StreamrClientConfig = {}) => {
        return environment.createClient({
            auth: {
                privateKey: subscriberWallet.privateKey
            },
            ...config,
        })
    }

    const triggerGroupKeyRequest = async (streamPartId: StreamPartID, key: GroupKey, publisher: StreamrClient): Promise<void> => {
        const publisherNode = publisher.getNode()
        await publisherNode.broadcast(await createMockMessage({
            streamPartId,
            publisher: publisherWallet,
            encryptionKey: key
        }))
    }

    const assertGroupKeyRequest = async (
        message: StreamMessage,
        expectedStreamPartId: StreamPartID,
        expectedRequestedKeyIds: string[],
        expectedPublisherId: UserID,
        expectedSignatureType: SignatureType,
        expectedEncryptionType: AsymmetricEncryptionType = AsymmetricEncryptionType.RSA,
    ): Promise<void> => {
        expect(message).toMatchObject({
            messageId: {
                streamId: StreamPartIDUtils.getStreamID(expectedStreamPartId),
                streamPartition:  StreamPartIDUtils.getStreamPartition(expectedStreamPartId),
                publisherId: expectedPublisherId
            },
            messageType: StreamMessageType.GROUP_KEY_REQUEST,
            contentType: ContentType.BINARY,
            encryptionType: EncryptionType.NONE,
            signature: expect.any(Uint8Array),
            signatureType: expectedSignatureType
        })
        const request = GroupKeyRequest.fromBinary(message.content)
        expect(request.requestId).toBeString()
        expect(toUserId(request.recipientId)).toEqualCaseInsensitive(publisherWallet.address)
        expect(request.publicKey).toBeInstanceOf(Uint8Array)
        expect(request.groupKeyIds).toEqual(expectedRequestedKeyIds)
        expect(request.encryptionType).toEqual(expectedEncryptionType)
    }

    beforeEach(async () => {
        publisherWallet = await createTestWallet()
        subscriberWallet = await createTestWallet()
        environment = new FakeEnvironment()
        subscriber = createSubscriber()
    })

    afterEach(async () => {
        await environment.destroy()
    })

    /*
    * A subscriber node requests a group key
    * - tests that a correct kind of request message is sent to a publisher node
    * - tests that we store the received key
    */
    it('requests a group key using default settings', async () => {
        const streamId = await createStream(toUserId(subscriberWallet.address))
        const streamPartId = toStreamPartID(streamId, 0)

        const groupKey = GroupKey.generate()
        const publisher = environment.createClient({
            auth: {
                privateKey: publisherWallet.privateKey
            }
        })
        await publisher.addEncryptionKey(groupKey, publisherWallet.address)
        await subscriber.subscribe(streamPartId, () => {})

        await triggerGroupKeyRequest(streamPartId, groupKey, publisher)

        const request = await environment.getNetwork().waitForSentMessage({
            messageType: StreamMessageType.GROUP_KEY_REQUEST
        })
        await assertGroupKeyRequest(
            request,
            streamPartId,
            [groupKey.id],
            toUserId(subscriberWallet.address),
            SignatureType.ECDSA_SECP256K1_EVM
        )
        const keyStore = getLocalGroupKeyStore(toUserId(subscriberWallet.address))
        await until(async () => (await keyStore.get(groupKey.id, toUserId(publisherWallet.address))) !== undefined)
    })

    it('requests a group key using ERC-1271 identity', async () => {
        const erc1271Contract = randomEthereumAddress()
        const streamId = await createStream(toUserId(erc1271Contract))
        const streamPartId = toStreamPartID(streamId, 0)
        environment.getChain().addErc1271AllowedAddress(erc1271Contract, toUserId(subscriberWallet.address))

        const groupKey = GroupKey.generate()
        const publisher = environment.createClient({
            auth: {
                privateKey: publisherWallet.privateKey
            }
        })
        await publisher.addEncryptionKey(groupKey, publisherWallet.address)

        await subscriber.subscribe({
            id: StreamPartIDUtils.getStreamID(streamPartId),
            partition: StreamPartIDUtils.getStreamPartition(streamPartId),
            erc1271Contract
        }, () => {})

        await triggerGroupKeyRequest(streamPartId, groupKey, publisher)

        const request = await environment.getNetwork().waitForSentMessage({
            messageType: StreamMessageType.GROUP_KEY_REQUEST
        })
        await assertGroupKeyRequest(request, streamPartId, [groupKey.id], toUserId(erc1271Contract), SignatureType.ERC_1271)
        const keyStore = getLocalGroupKeyStore(toUserId(await subscriber.getUserId()))
        await until(async () => (await keyStore.get(groupKey.id, toUserId(publisherWallet.address))) !== undefined)
    })

    it('requests a group key with quantum security', async () => {
        const streamId = await createStream(toUserId(subscriberWallet.address))
        subscriber = createSubscriber({
            encryption: {
                requireQuantumResistantKeyExchange: true,
            }
        })
        const streamPartId = toStreamPartID(streamId, 0)

        const groupKey = GroupKey.generate()
        const publisher = environment.createClient({
            auth: {
                privateKey: publisherWallet.privateKey
            }
        })
        await publisher.addEncryptionKey(groupKey, publisherWallet.address)
        await subscriber.subscribe(streamPartId, () => {})

        await triggerGroupKeyRequest(streamPartId, groupKey, publisher)

        const request = await environment.getNetwork().waitForSentMessage({
            messageType: StreamMessageType.GROUP_KEY_REQUEST
        })
        await assertGroupKeyRequest(
            request,
            streamPartId,
            [groupKey.id],
            toUserId(subscriberWallet.address),
            SignatureType.ECDSA_SECP256K1_EVM,
            AsymmetricEncryptionType.ML_KEM,
        )
        const keyStore = getLocalGroupKeyStore(toUserId(subscriberWallet.address))
        await until(async () => (await keyStore.get(groupKey.id, toUserId(publisherWallet.address))) !== undefined)
    })
})
