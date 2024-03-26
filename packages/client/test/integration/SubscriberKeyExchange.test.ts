import 'reflect-metadata'

import { EthereumAddress, toEthereumAddress, waitForCondition } from '@streamr/utils'
import { Wallet } from '@ethersproject/wallet'
import {
    ContentType,
    EncryptionType, SignatureType,
    StreamMessage,
    StreamMessageType,
    StreamPartID,
    StreamPartIDUtils
} from '@streamr/protocol'
import { fastWallet, randomEthereumAddress } from '@streamr/test-utils'
import { GroupKey } from '../../src/encryption/GroupKey'
import { StreamPermission } from '../../src/permission'
import { Stream } from '../../src/Stream'
import { StreamrClient } from '../../src/StreamrClient'
import { FakeEnvironment } from '../test-utils/fake/FakeEnvironment'
import {
    createMockMessage,
    createRelativeTestStreamId,
    getLocalGroupKeyStore
} from '../test-utils/utils'
import { convertBytesToGroupKeyRequest } from '@streamr/trackerless-network'

describe('SubscriberKeyExchange', () => {

    let publisherWallet: Wallet
    let subscriberWallet: Wallet
    let subscriber: StreamrClient
    let streamPartId: StreamPartID
    let environment: FakeEnvironment

    const createStream = async (): Promise<Stream> => {
        const s = await subscriber.createStream(createRelativeTestStreamId(module))
        await s.grantPermissions({
            permissions: [StreamPermission.PUBLISH],
            user: publisherWallet.address
        })
        return s
    }

    const triggerGroupKeyRequest = async (key: GroupKey, publisher: StreamrClient): Promise<void> => {
        const publisherNode = await publisher.getNode()
        await publisherNode.broadcast(await createMockMessage({
            streamPartId,
            publisher: publisherWallet,
            encryptionKey: key
        }))
    }

    const assertGroupKeyRequest = async (
        message: StreamMessage,
        expectedRequestedKeyIds: string[],
        expectedPublisherId: EthereumAddress,
        expectedSignatureType: SignatureType
    ): Promise<void> => {
        expect(message).toMatchObject({
            messageId: {
                streamId: StreamPartIDUtils.getStreamID(streamPartId),
                streamPartition:  StreamPartIDUtils.getStreamPartition(streamPartId),
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
        const stream = await createStream()
        streamPartId = stream.getStreamParts()[0]
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
            const groupKey = GroupKey.generate()
            const publisher = environment.createClient({
                auth: {
                    privateKey: publisherWallet.privateKey
                }
            })
            await publisher.addEncryptionKey(groupKey, toEthereumAddress(publisherWallet.address))
            await subscriber.subscribe(streamPartId, () => {})

            await triggerGroupKeyRequest(groupKey, publisher)

            const request = await environment.getNetwork().waitForSentMessage({
                messageType: StreamMessageType.GROUP_KEY_REQUEST
            })
            await assertGroupKeyRequest(
                request,
                [groupKey.id],
                toEthereumAddress(subscriberWallet.address),
                SignatureType.SECP256K1
            )
            const keyStore = getLocalGroupKeyStore(toEthereumAddress(subscriberWallet.address))
            await waitForCondition(async () => (await keyStore.get(groupKey.id, toEthereumAddress(publisherWallet.address))) !== undefined)
        })

        it('happy path: ERC-1271', async () => {
            const subscriber2Wallet = fastWallet()
            const erc1271Contract = randomEthereumAddress()
            await subscriber.grantPermissions(StreamPartIDUtils.getStreamID(streamPartId), {
                permissions: [StreamPermission.SUBSCRIBE],
                user: erc1271Contract
            })
            environment.getChain().erc1271AllowedAddresses.add(erc1271Contract, toEthereumAddress(subscriber2Wallet.address))

            const groupKey = GroupKey.generate()
            const publisher = environment.createClient({
                auth: {
                    privateKey: publisherWallet.privateKey
                }
            })
            await publisher.addEncryptionKey(groupKey, toEthereumAddress(publisherWallet.address))

            const subscriber2 = environment.createClient({
                auth: {
                    privateKey: subscriber2Wallet.privateKey
                }
            })
            await subscriber2.subscribe({
                id: StreamPartIDUtils.getStreamID(streamPartId),
                partition: StreamPartIDUtils.getStreamPartition(streamPartId),
                erc1271Contract
            }, () => {})

            await triggerGroupKeyRequest(groupKey, publisher)

            const request = await environment.getNetwork().waitForSentMessage({
                messageType: StreamMessageType.GROUP_KEY_REQUEST
            })
            await assertGroupKeyRequest(request, [groupKey.id], erc1271Contract, SignatureType.ERC_1271)
            const keyStore = getLocalGroupKeyStore(await subscriber2.getAddress())
            await waitForCondition(async () => (await keyStore.get(groupKey.id, toEthereumAddress(publisherWallet.address))) !== undefined)
        })
    })
})
