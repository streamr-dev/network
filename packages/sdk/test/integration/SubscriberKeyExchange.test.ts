import 'reflect-metadata'

import { fastWallet, randomEthereumAddress } from '@streamr/test-utils'
import { StreamID, StreamPartID, StreamPartIDUtils, toStreamPartID, toUserId, UserID, until } from '@streamr/utils'
import { Wallet } from 'ethers'
import { StreamrClient } from '../../src/StreamrClient'
import { GroupKey } from '../../src/encryption/GroupKey'
import { StreamPermission } from '../../src/permission'
import { convertBytesToGroupKeyRequest } from '../../src/protocol/oldStreamMessageBinaryUtils'
import { FakeEnvironment } from '../test-utils/fake/FakeEnvironment'
import { createMockMessage, createRelativeTestStreamId, getLocalGroupKeyStore } from '../test-utils/utils'
import {
    ContentType,
    EncryptionType,
    SignatureType,
    StreamMessage,
    StreamMessageType
} from './../../src/protocol/StreamMessage'

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

    const triggerGroupKeyRequest = async (
        streamPartId: StreamPartID,
        key: GroupKey,
        publisher: StreamrClient
    ): Promise<void> => {
        const publisherNode = publisher.getNode()
        await publisherNode.broadcast(
            await createMockMessage({
                streamPartId,
                publisher: publisherWallet,
                encryptionKey: key
            })
        )
    }

    const assertGroupKeyRequest = async (
        message: StreamMessage,
        expectedStreamPartId: StreamPartID,
        expectedRequestedKeyIds: string[],
        expectedPublisherId: UserID,
        expectedSignatureType: SignatureType
    ): Promise<void> => {
        expect(message).toMatchObject({
            messageId: {
                streamId: StreamPartIDUtils.getStreamID(expectedStreamPartId),
                streamPartition: StreamPartIDUtils.getStreamPartition(expectedStreamPartId),
                publisherId: expectedPublisherId
            },
            messageType: StreamMessageType.GROUP_KEY_REQUEST,
            contentType: ContentType.BINARY,
            encryptionType: EncryptionType.NONE,
            signature: expect.any(Uint8Array),
            signatureType: expectedSignatureType
        })
        const request = convertBytesToGroupKeyRequest(message.content)
        expect(request.requestId).toBeString()
        expect(request.recipient).toEqualCaseInsensitive(publisherWallet.address)
        expect(request.rsaPublicKey).toBeString()
        expect(request.groupKeyIds).toEqual(expectedRequestedKeyIds)
    }

    beforeEach(async () => {
        publisherWallet = fastWallet()
        subscriberWallet = fastWallet()
        environment = new FakeEnvironment()
        subscriber = environment.createClient({
            auth: {
                privateKey: subscriberWallet.privateKey
            }
        })
    })

    afterEach(async () => {
        await environment.destroy()
    })

    describe('requests a group key', () => {
        /*
         * A subscriber node requests a group key
         * - tests that a correct kind of request message is sent to a publisher node
         * - tests that we store the received key
         */
        it('happy path', async () => {
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
                SignatureType.SECP256K1
            )
            const keyStore = getLocalGroupKeyStore(toUserId(subscriberWallet.address))
            await until(async () => (await keyStore.get(groupKey.id, toUserId(publisherWallet.address))) !== undefined)
        })

        it('happy path: ERC-1271', async () => {
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

            await subscriber.subscribe(
                {
                    id: StreamPartIDUtils.getStreamID(streamPartId),
                    partition: StreamPartIDUtils.getStreamPartition(streamPartId),
                    erc1271Contract
                },
                () => {}
            )

            await triggerGroupKeyRequest(streamPartId, groupKey, publisher)

            const request = await environment.getNetwork().waitForSentMessage({
                messageType: StreamMessageType.GROUP_KEY_REQUEST
            })
            await assertGroupKeyRequest(
                request,
                streamPartId,
                [groupKey.id],
                toUserId(erc1271Contract),
                SignatureType.ERC_1271
            )
            const keyStore = getLocalGroupKeyStore(toUserId(await subscriber.getUserId()))
            await until(async () => (await keyStore.get(groupKey.id, toUserId(publisherWallet.address))) !== undefined)
        })
    })
})
